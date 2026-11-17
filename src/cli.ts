// Takehome's command line.
//   node src/cli.ts export [--until YYYY-MM-DD] [--full] [--no-files] [--max-file-mb 25]
//   node src/cli.ts status
// Settings come from a file outside the repository (see .env.example); nothing secret is ever an argument.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runExport, SignInNeeded, type Config } from "./run/export.ts";
import { loadSettings } from "./settings.ts";

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
    const out = await runExport(cfg, { until, full: flag("full"), files: !flag("no-files"), maxFileMb: Number(value("max-file-mb") ?? "25"), log: (line) => console.log(line) });
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
} else {
  console.error(`Unknown command "${command}". Use: export, status.`);
  process.exit(2);
}
