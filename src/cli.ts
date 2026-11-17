// Takehome's command line.
//   node src/cli.ts export [--until YYYY-MM-DD] [--full] [--no-files] [--max-file-mb 25]
//   node src/cli.ts status
//   node src/cli.ts search <words>   looks inside the documents that were turned into text
//   node src/cli.ts site      builds the public site into ./public from the sealed list
// Settings come from a file outside the repository (see .env.example); nothing secret is ever an argument.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runExport, SignInNeeded, type Config } from "./run/export.ts";
import { findInTexts, type DocText } from "./core/search.ts";
import { loadSettings } from "./settings.ts";
import { buildSite } from "./site/build.ts";

// The settings file wins over the shell. Its place can be given in TAKEHOME_SETTINGS.
loadSettings(resolve(process.env.TAKEHOME_SETTINGS ?? "../.takehome.env"));

function config(): Config {
  const env = process.env;
  const dataDir = resolve(env.TAKEHOME_DATA ?? "../takehome-data");
  return {
    key: env.TINYFISH_API_KEY ?? "",
    origin: (env.TAKEHOME_ORIGIN ?? "").replace(/\/$/, ""),
    profile: env.TAKEHOME_PROFILE ?? "Blackboard",
    dataDir,
    salt: env.TAKEHOME_SALT ?? "",
    capUsd: Number(env.TAKEHOME_CAP_USD ?? "8"),
  };
}

const args = process.argv.slice(2);
const command = args[0] ?? "status";
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};

if (command === "export") {
  const cfg = config();
  for (const [name, v] of [["TINYFISH_API_KEY", cfg.key], ["TAKEHOME_ORIGIN", cfg.origin], ["TAKEHOME_SALT", cfg.salt]] as const) {
    if (!v) {
      console.error(`${name} is not set. Copy .env.example and fill it in.`);
      process.exit(2);
    }
  }
  const until = value("until");
  if (until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    console.error("--until takes a day, written YYYY-MM-DD.");
    process.exit(2);
  }
  try {
    const out = await runExport(cfg, { until, full: flag("full"), files: !flag("no-files"), text: !flag("no-text"), maxFileMb: Number(value("max-file-mb") ?? "25"), log: (line) => console.log(line) });
    console.log(`\nDone: ${out.run.kind} ${out.run.id}, ${out.run.added} new rows, ${out.run.changed} changed, ${out.run.steps} Agent steps ($${out.run.usd.toFixed(3)}).`);
    console.log(`The export now holds ${Object.entries(out.totals).map(([k, n]) => `${n} ${k}`).join(", ")}; ${out.saved} documents saved. Spent so far: $${out.spentUsd.toFixed(2)} of $${cfg.capUsd.toFixed(2)}.`);
    console.log(`It is in ${cfg.dataDir}`);
    } catch (e) {
    console.error(e instanceof SignInNeeded ? `\n${e.message}` : `\nStopped: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
} else if (command === "status") {
  const path = join(config().dataDir, "manifest.json");
  if (!existsSync(path)) {
    console.log("No export yet. Run: node src/cli.ts export");
    process.exit(0);
  }
  const m = JSON.parse(readFileSync(path, "utf8"));
  console.log(`Exported ${m.exportedAt} from ${m.portal}`);
  console.log(`Totals: ${Object.entries(m.totals).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log(`Grade checks: ${Object.entries(m.gradeChecks).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log(`Runs: ${m.runs.map((r: { id: string; kind: string; added: number; changed: number; steps: number }) => `${r.id} ${r.kind} +${r.added} ~${r.changed} (${r.steps} steps)`).join("; ")}`);
  console.log(`Spent $${m.spend.usd.toFixed(2)} of $${m.spend.capUsd.toFixed(2)}`);
} else if (command === "search") {
  const dir = config().dataDir;
  if (!existsSync(join(dir, "state.json")) || !existsSync(join(dir, "export.json"))) {
    console.log("No export yet. Run: node src/cli.ts export");
    process.exit(0);
  }
  const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8")) as { texts?: Record<string, { path: string }> };
  const exp = JSON.parse(readFileSync(join(dir, "export.json"), "utf8")) as { files: Array<{ id: string; name: string; courseId: string }>; courses: Array<{ id: string; code: string }> };
  const code = new Map(exp.courses.map((c) => [c.id, c.code]));
  const docs: DocText[] = [];
  for (const f of exp.files) {
    const t = state.texts?.[f.id];
    if (t && existsSync(join(dir, t.path))) docs.push({ id: f.id, course: code.get(f.courseId) ?? f.courseId, name: f.name, text: readFileSync(join(dir, t.path), "utf8") });
  }
  const hits = findInTexts(docs, args.slice(1).join(" "));
  console.log(`${hits.length} of ${docs.length} searchable documents hold those words.`);
  for (const h of hits.slice(0, 25)) console.log(`
${h.course} / ${h.name}
  ${h.snippet}`);
} else if (command === "site") {
  const sealedPath = join(config().dataDir, "sealed.json");
  if (!existsSync(sealedPath)) {
    console.error("No sealed list yet. Run an export first.");
    process.exit(2);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const { sampleExport } = await import("../fixtures/sample.ts");
  const m = JSON.parse(readFileSync(join(config().dataDir, "manifest.json"), "utf8"));
  const facts = { equal: m.gradeChecks.match, differs: m.gradeChecks.differs, notOnPage: m.gradeChecks["not on page"], asText: m.totals.documentsAsText ?? 0, leftOut: m.totals.documentsLeftOut, spentUsd: m.spend.usd };
  const files = buildSite(JSON.parse(readFileSync(sealedPath, "utf8")), sampleExport(), facts, { codeUrl: process.env.TAKEHOME_CODE_URL ?? "https://github.com/HamdanEsmail/takehome" });
  for (const [path, text] of Object.entries(files)) {
    const to = join(root, "public", path);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, text);
  }
  mkdirSync(join(root, "public", "assets"), { recursive: true });
  for (const asset of ["site.css", "viewer.js"]) copyFileSync(join(root, "site", asset), join(root, "public", "assets", asset));
  console.log(`Built ${Object.keys(files).length} files into public/ from the sealed list.`);
} else {
  console.error(`Unknown command "${command}". Use: export, status, search, site.`);
  process.exit(2);
}
