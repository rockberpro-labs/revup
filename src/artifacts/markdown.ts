/** Parsing de markdown com headings fixos: `## ` abre seção; bullets são a unidade de conteúdo. */
export interface Section {
  heading: string;
  lines: string[];
}

export function parseSections(md: string): Section[] {
  const sections: Section[] = [];
  let cur: Section | undefined;
  for (const line of md.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      cur = { heading: h[1]!, lines: [] };
      sections.push(cur);
    } else if (cur && !/^#\s/.test(line)) {
      cur.lines.push(line);
    }
  }
  return sections;
}

export interface Bullet {
  text: string;
  cites: string[];
  /** "Nenhum/Nenhuma ..." — dispensa citação */
  none: boolean;
}

const BULLET = /^\s*(?:[-*]|\d+[.)])\s+(.*\S)\s*$/;
const CITE = /\bF-[0-9a-f]{8}\b/g;

export function extractCitations(text: string): string[] {
  return [...text.matchAll(CITE)].map((m) => m[0]);
}

export function parseBullets(lines: string[]): Bullet[] {
  const out: Bullet[] = [];
  for (const l of lines) {
    const m = BULLET.exec(l);
    if (m) out.push({ text: m[1]!, cites: extractCitations(m[1]!), none: /^nenhum[ao]?\b/i.test(m[1]!) });
  }
  return out;
}

/** Linhas não vazias que não são bullet (prosa solta). */
export function proseLines(lines: string[]): string[] {
  return lines.filter((l) => l.trim() && !BULLET.test(l) && !/^<!--.*-->$/.test(l.trim()));
}
