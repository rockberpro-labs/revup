import type { Config } from "../config.ts";
import { RevupError } from "../errors.ts";
import type { RawFact } from "./facts.ts";
import { phpScanner } from "./php/index.ts";

export interface ScanContext {
  sourceRoot: string;
  includePaths: string[];
  encoding: Config["encoding"];
}

export interface ScanResult {
  files: { path: string; sha256: string }[];
  facts: RawFact[];
}

export interface Scanner {
  language: string;
  /** entry is relative to sourceRoot */
  scan(entry: string, ctx: ScanContext): Promise<ScanResult>;
}

const scanners: Record<string, Scanner> = { php: phpScanner };

export function getScanner(language: string): Scanner {
  const s = scanners[language];
  if (!s) throw new RevupError(`language "${language}" is not supported; available: ${Object.keys(scanners).join(", ")}`);
  return s;
}
