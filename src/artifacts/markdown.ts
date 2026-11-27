/** Markdown parsing with fixed headings: `## ` opens a section; bullets are the unit of content. */
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
  /** "None ..." — exempt from citation */
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
    if (m) out.push({ text: m[1]!, cites: extractCitations(m[1]!), none: /^none\b/i.test(m[1]!) });
  }
  return out;
}

/** Non-empty lines that are not bullets (loose prose). */
export function proseLines(lines: string[]): string[] {
  return lines.filter((l) => l.trim() && !BULLET.test(l) && !/^<!--.*-->$/.test(l.trim()));
}
