/** Achata expressões de string PHP em texto, com `{$x}` / `{expr}` no lugar do que é dinâmico. */
export interface Flat {
  text: string;
  /** true se há partes dinâmicas (exceto {__DIR__}, que é resolvível) */
  dynamic: boolean;
}

const DIR = "{__DIR__}";

export function flatten(node: any): Flat {
  if (!node || typeof node !== "object") return { text: "{expr}", dynamic: true };
  switch (node.kind) {
    case "string":
    case "nowdoc":
      return { text: String(node.value ?? ""), dynamic: false };
    case "number":
      return { text: String(node.value), dynamic: false };
    case "encapsed": {
      const parts = (node.value as any[]).map((p) => flatten(p.kind === "encapsedpart" ? p.expression : p));
      return join(parts);
    }
    case "bin":
      if (node.type === ".") return join([flatten(node.left), flatten(node.right)]);
      return { text: "{expr}", dynamic: true };
    case "variable":
      return { text: typeof node.name === "string" ? `{$${node.name}}` : "{expr}", dynamic: true };
    case "magic":
      return node.value === "__DIR__" ? { text: DIR, dynamic: false } : { text: "{expr}", dynamic: true };
    case "call": {
      const name = node.what?.kind === "name" ? String(node.what.name).replace(/^\\/, "").toLowerCase() : "";
      if (name === "dirname" && node.arguments?.[0]?.kind === "magic" && node.arguments[0].value === "__FILE__") {
        return { text: DIR, dynamic: false };
      }
      return { text: "{expr}", dynamic: true };
    }
    default:
      return { text: "{expr}", dynamic: true };
  }
}

function join(parts: Flat[]): Flat {
  return { text: parts.map((p) => p.text).join(""), dynamic: parts.some((p) => p.dynamic) };
}
