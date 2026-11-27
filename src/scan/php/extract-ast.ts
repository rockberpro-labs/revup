import { normalizeSnippet, type RawFact } from "../facts.ts";
import { analyzeSql } from "../sql.ts";
import { flatten } from "./flatten.ts";

const INPUT = new Set(["_GET", "_POST", "_REQUEST", "_FILES", "_SERVER", "_COOKIE"]);

function classify(name: string): "input" | "session" | null {
  if (name === "_SESSION") return "session";
  return INPUT.has(name) ? "input" : null;
}

/** Facts from a php-parser AST, in order of appearance in the file. */
export function extractAst(ast: any, text: string, file: string): RawFact[] {
  const out: { offset: number; seq: number; fact: RawFact }[] = [];
  const writes = new WeakSet<object>();
  const covered = new WeakSet<object>();

  const push = (node: any, partial: Partial<RawFact> & Pick<RawFact, "kind" | "resolved">) => {
    const start = node.loc?.start;
    const end = node.loc?.end;
    const snippet = partial.snippet ?? (start && end ? normalizeSnippet(text.slice(start.offset, end.offset)) : "");
    out.push({
      offset: start?.offset ?? 0,
      seq: out.length,
      fact: { file, line: Math.max(1, start?.line ?? 1), snippet, confidence: "ast", ...partial } as RawFact,
    });
  };

  const sqlFact = (node: any) => {
    const flat = flatten(node);
    const info = analyzeSql(flat.text);
    if (!info) return;
    push(node, {
      kind: "sql",
      operation: info.operation,
      tables: info.tables,
      text: normalizeSnippet(flat.text, 500),
      resolved: !flat.dynamic,
    });
  };

  const includeFact = (node: any) => {
    const flat = flatten(node.target);
    const name = (node.require ? "require" : "include") + (node.once ? "_once" : "");
    push(node, { kind: "include", name, target: flat.text, resolved: !flat.dynamic });
  };

  const callFacts = (node: any) => {
    const name = node.what?.kind === "name" ? String(node.what.name).replace(/^\\/, "") : null;
    push(node, { kind: "call", name: name ?? "{expr}", resolved: name !== null });
    if (name?.toLowerCase() === "header" && node.arguments?.[0]) {
      const flat = flatten(node.arguments[0]);
      const m = /^\s*location\s*:\s*([\s\S]*)$/i.exec(flat.text);
      if (m) push(node, { kind: "redirect", target: m[1]!.trim(), resolved: !flat.dynamic });
    }
  };

  const defFact = (node: any) => {
    const name = typeof node.name === "string" ? node.name : node.name?.name;
    if (!name) return;
    const method = node.kind === "method";
    push(node, {
      kind: "function_def",
      name,
      source: method ? "method" : "function",
      snippet: `${method ? "method" : "function"} ${name}()`,
      resolved: true,
    });
  };

  const offsetFact = (node: any) => {
    if (covered.has(node)) return;
    let base = node;
    const chain: any[] = [];
    const offsets: any[] = [];
    while (base?.kind === "offsetlookup") {
      chain.push(base);
      offsets.unshift(base.offset);
      base = base.what;
    }
    if (base?.kind !== "variable" || typeof base.name !== "string") return;
    const kind = classify(base.name);
    if (!kind) return;
    chain.forEach((n) => covered.add(n));
    covered.add(base);
    const keyNode = offsets[0];
    let key: string | undefined;
    let resolved = true;
    if (keyNode) {
      const flat = flatten(keyNode);
      key = flat.text;
      resolved = !flat.dynamic;
    }
    push(node, { kind, source: `$${base.name}`, key, mode: writes.has(node) ? "write" : "read", resolved });
  };

  const variableFact = (node: any) => {
    if (typeof node.name !== "string" || covered.has(node)) return;
    const kind = classify(node.name);
    if (!kind) return;
    push(node, { kind, source: `$${node.name}`, mode: writes.has(node) ? "write" : "read", resolved: true });
  };

  const visit = (node: any, inConcat = false): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n);
      return;
    }
    const k = node.kind;
    if (typeof k !== "string" || k.startsWith("comment")) return;

    if (k === "assign") writes.add(node.left);
    else if (k === "unset") for (const v of node.variables ?? []) writes.add(v);
    else if (k === "string" || k === "encapsed" || k === "nowdoc" || (k === "bin" && node.type === ".")) {
      if (!inConcat) sqlFact(node);
    } else if (k === "include") includeFact(node);
    else if (k === "call") callFacts(node);
    else if (k === "function" || k === "method") defFact(node);
    else if (k === "offsetlookup") offsetFact(node);
    else if (k === "variable") variableFact(node);

    for (const [key, val] of Object.entries(node)) {
      if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
      const childInConcat = (k === "bin" && node.type === "." && (key === "left" || key === "right")) || k === "encapsedpart";
      visit(val, childInConcat);
    }
  };

  visit(ast.children);
  return out.sort((a, b) => a.offset - b.offset || a.seq - b.seq).map((o) => o.fact);
}
