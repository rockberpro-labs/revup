/** Análise de SQL neutra de linguagem. Variáveis já vêm como `{$x}` / `{expr}`. */
export interface SqlInfo {
  operation: "SELECT" | "INSERT" | "REPLACE" | "UPDATE" | "DELETE";
  tables: string[];
}

const SHAPES: [SqlInfo["operation"], RegExp][] = [
  ["SELECT", /^\s*\(?\s*SELECT\b[\s\S]*\bFROM\b/i],
  ["INSERT", /^\s*INSERT\s+(?:\w+\s+)*?INTO\b/i],
  ["REPLACE", /^\s*REPLACE\s+(?:\w+\s+)*?INTO\b/i],
  ["UPDATE", /^\s*UPDATE\b[\s\S]*\bSET\b/i],
  ["DELETE", /^\s*DELETE\b[\s\S]*\bFROM\b/i],
];

const TOKEN = String.raw`\{[^}]*\}|[\`"\w.$]+`;
const KEYWORDS = /^(select|where|set|values|dual|from|join|on|using)$/i;
const FROM_STOP = String.raw`(?=\bWHERE\b|\bGROUP\b|\bORDER\b|\bHAVING\b|\bLIMIT\b|\bUNION\b|\bJOIN\b|\bON\b|\bSET\b|\bVALUES\b|\bUSING\b|;|\)|$)`;

/** "Select an option from the list": lista de colunas com ≥2 palavras soltas e sem sinais de SQL. */
function looksLikeProse(text: string): boolean {
  const list = /^\s*\(?\s*SELECT\b([\s\S]*?)\bFROM\b/i.exec(text)?.[1] ?? "";
  if (/[,*(.{`'"]/.test(list) || /\bas\b/i.test(list)) return false;
  return list.trim().split(/\s+/).filter(Boolean).length >= 2;
}

function clean(tok: string): string {
  return tok.replace(/[`"]/g, "");
}

export function analyzeSql(text: string): SqlInfo | null {
  const shape = SHAPES.find(([, re]) => re.test(text));
  if (!shape) return null;
  if (shape[0] === "SELECT" && looksLikeProse(text)) return null;
  const tables: string[] = [];
  const add = (tok: string | undefined) => {
    if (!tok) return;
    const t = clean(tok);
    if (!t || KEYWORDS.test(t) || t.startsWith("(")) return;
    if (!tables.includes(t)) tables.push(t);
  };
  for (const m of text.matchAll(new RegExp(String.raw`\bFROM\s+([^;]*?)` + FROM_STOP, "gis"))) {
    for (const part of m[1]!.split(",")) add(part.trim().match(new RegExp("^(?:" + TOKEN + ")"))?.[0]);
  }
  for (const m of text.matchAll(new RegExp(String.raw`\bJOIN\s+(` + TOKEN + ")", "gi"))) add(m[1]);
  for (const m of text.matchAll(new RegExp(String.raw`\bINTO\s+(` + TOKEN + ")", "gi"))) add(m[1]);
  const upd = text.match(new RegExp(String.raw`^\s*UPDATE\s+(?:(?:LOW_PRIORITY|IGNORE)\s+)*(` + TOKEN + ")", "i"));
  add(upd?.[1]);
  return { operation: shape[0], tables };
}
