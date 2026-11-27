import { readFile } from "node:fs/promises";
import type { Config } from "../config.ts";
import { sha256 } from "../state/store.ts";

export interface Source {
  text: string;
  sha256: string;
  encoding: "utf8" | "latin1";
}

/** Reads the file; in auto mode tries strict UTF-8 and falls back to windows-1252. */
export async function readSource(abs: string, encoding: Config["encoding"]): Promise<Source> {
  const buf = await readFile(abs);
  const hash = sha256(buf);
  if (encoding === "latin1") return { text: new TextDecoder("windows-1252").decode(buf), sha256: hash, encoding: "latin1" };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf), sha256: hash, encoding: "utf8" };
  } catch {
    if (encoding === "utf8") return { text: new TextDecoder("utf-8").decode(buf), sha256: hash, encoding: "utf8" };
    return { text: new TextDecoder("windows-1252").decode(buf), sha256: hash, encoding: "latin1" };
  }
}
