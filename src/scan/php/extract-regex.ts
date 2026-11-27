import { normalizeSnippet, type RawFact } from "../facts.ts";
import { analyzeSql } from "../sql.ts";

/** Heuristic (per-line) fallback for files the parser rejects. */
export function extractRegex(text: string, file: string): RawFact[] {
  const facts: RawFact[] = [];
  const lines = text.split(/\r\n|\r|\n/);
  const add = (line: number, f: Omit<RawFact, "file" | "line" | "confidence">) =>
    facts.push({ file, line, confidence: "heuristic", ...f, snippet: normalizeSnippet(f.snippet) });

  lines.forEach((raw, i) => {
    const n = i + 1;
    const trimmed = raw.trim();
    if (/^(\/\/|#|\*|\/\*)/.test(trimmed)) return;

    for (const m of raw.matchAll(/\$_(GET|POST|REQUEST|FILES|SERVER|COOKIE|SESSION)\b(?:\s*\[\s*(?:'([^']*)'|"([^"]*)"|([^\]]*?))\s*\])?/g)) {
      const name = m[1]!;
      const dynamicKey = m[4] !== undefined;
      const rest = raw.slice(m.index! + m[0].length);
      const write = /^\s*(?:\[[^\]]*\]\s*)*[-+.*\/]?=(?![=>])/.test(rest);
      add(n, {
        kind: name === "SESSION" ? "session" : "input",
        source: `$_${name}`,
        key: dynamicKey ? "{expr}" : (m[2] ?? m[3]),
        mode: write ? "write" : "read",
        resolved: !dynamicKey,
        snippet: m[0],
      });
    }

    const hdr = /header\s*\(\s*(['"])\s*location\s*:\s*(.*?)\1\s*([.),])/i.exec(raw);
    if (hdr) {
      const dynamic = hdr[3] === "." || (hdr[1] === '"' && /\$/.test(hdr[2]!));
      add(n, { kind: "redirect", target: hdr[2]!.trim(), resolved: !dynamic, snippet: trimmed });
    }

    const inc = /\b(include_once|require_once|include|require)\b(.*)$/i.exec(raw);
    if (inc) {
      const st = /^\s*\(?\s*(['"])([^'"$]*)\1\s*\)?\s*;/.exec(inc[2]!);
      add(n, {
        kind: "include",
        name: inc[1]!.toLowerCase(),
        target: st ? st[2]! : inc[2]!.trim().replace(/;\s*$/, ""),
        resolved: !!st,
        snippet: trimmed,
      });
    }

    for (const m of raw.matchAll(/(["'])((?:\\.|(?!\1).)*)\1/g)) {
      const sqlText = m[2]!.replace(/\{\$[^}]*\}|\$\w+/g, (v) => (v.startsWith("{") ? v : `{${v}}`));
      const info = analyzeSql(sqlText);
      if (info) {
        add(n, {
          kind: "sql",
          operation: info.operation,
          tables: info.tables,
          text: normalizeSnippet(sqlText, 500),
          resolved: !/\{/.test(sqlText),
          snippet: m[0],
        });
      }
    }

    const fn = /\bfunction\s+&?\s*([A-Za-z_]\w*)\s*\(/.exec(raw);
    if (fn) add(n, { kind: "function_def", name: fn[1]!, source: "function", resolved: true, snippet: `function ${fn[1]}()` });
  });
  return facts;
}
