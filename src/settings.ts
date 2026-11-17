// Takehome's settings: a small KEY=value file kept outside the repository.
// What the file says wins over the shell, so a TinyFish key left in the shell from other work can
// never send runs to the wrong account.
import { existsSync, readFileSync } from "node:fs";

export function parseSettings(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    out[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

/** Reads the file if it is there and puts its values into the environment, over what the shell had. */
export function loadSettings(path: string, env: Record<string, string | undefined> = process.env): boolean {
  if (!existsSync(path)) return false;
  Object.assign(env, parseSettings(readFileSync(path, "utf8")));
  return true;
}
