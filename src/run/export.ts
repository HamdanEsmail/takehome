// One export, start to finish:
//  1. open the saved sign-in in TinyFish's browser and read what the portal itself reports
//  2. work out which courses changed since the last run
//  3. have the TinyFish Agent read the Grades page of each changed course, and check each reading
//  4. merge into the export kept from earlier runs, so only what is new is added
//  5. fetch the documents that are new
//  6. write the JSON, the CSV files, the list of changes, the manifest and the sealed list
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { courseRow, cut, fingerprint, mapCourse, type CourseRows, type RawCourse } from "../core/blackboard.ts";
import { csvFiles } from "../core/csv.ts";
import { applyReading, type Reading } from "../core/match.ts";
import { merge, type Change } from "../core/merge.ts";
import { emptyExport, TABLES, type Export, type Tables } from "../core/model.ts";
import { seal } from "../core/seal.ts";
import { openPortal, type Membership, type Portal } from "../portal/browser.ts";
import { TinyFish } from "../tinyfish/api.ts";
import { Ledger, STEP_USD, type SpendLine } from "../tinyfish/ledger.ts";
import { GRADES_GOAL, GRADES_SCHEMA, OVERVIEW_GOAL, OVERVIEW_SCHEMA, gradesAnswer, gradesUrl, overviewAnswer } from "./agent.ts";
import { placeFor } from "./files.ts";

export interface Config {
  key: string;
  origin: string;
  profile: string;
  dataDir: string;
  salt: string;
  capUsd: number;
}

export interface Options {
  /** Take only what the portal held up to the end of this day (YYYY-MM-DD); null takes everything. */
  until: string | null;
  /** Read every open course again, changed or not. */
  full: boolean;
  files: boolean;
  maxFileMb: number;
  log: (line: string) => void;
}

interface CourseReading extends Reading {
  runId: string;
  steps: number;
  at: string;
}

interface Overview {
  runId: string;
  steps: number;
  agentCourses: number;
  matched: number;
  lockedSeen: number;
  at: string;
}

interface State {
  fingerprints: Record<string, string>;
  ledger: SpendLine[];
  readings: Record<string, CourseReading>;
  /** Documents left out on purpose, with the reason. */
  skipped: Record<string, string>;
  overview: Overview | null;
}

export class SignInNeeded extends Error {
  constructor() {
    super('The saved sign-in is no longer signed in. On TinyFish open Browser Context Profiles, choose "Set up sign-ins" on the profile, sign in again and save. Then run this again.');
  }
}

/** The most steps one Agent run may take. A Grades page takes about three. */
const MAX_STEPS = 8;
/** TinyFish keeps a browser on a saved sign-in open for a limited time; a fresh one is opened before that. */
const BROWSER_MS = 10 * 60_000;

const readJson = <T>(path: string): T | null => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null);

/** Written whole or not at all, so a crash never leaves half a file behind. */
function writeWhole(path: string, data: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.part`;
  writeFileSync(temp, data);
  renameSync(temp, path);
}

async function pool<T>(items: T[], width: number, work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(width, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
  }));
}

export async function runExport(cfg: Config, opt: Options) {
  const { log } = opt;
  const at = (file: string) => join(cfg.dataDir, file);
  mkdirSync(cfg.dataDir, { recursive: true });
  const base = readJson<Export>(at("export.json")) ?? emptyExport("Blackboard Learn");
  const state = readJson<State>(at("state.json")) ?? { fingerprints: {}, ledger: [], readings: {}, skipped: {}, overview: null };
  const ledger = new Ledger(cfg.capUsd, state.ledger);
  const saveState = () => writeWhole(at("state.json"), JSON.stringify({ ...state, ledger: ledger.lines }, null, 1));
  const api = new TinyFish(cfg.key);
  const profile = await api.profileNamed(cfg.profile);
  const first = base.runs.length === 0;
  const runId = `run-${base.runs.length + 1}`;
  const startedAt = new Date().toISOString();

  // 1. What the portal itself reports, read through the signed-in TinyFish browser.
  log("Opening the saved sign-in in TinyFish's browser.");
  let portal = await openPortal(api, profile.id, cfg.origin);
  let members: Membership[] = [];
  const feeds = new Map<string, RawCourse>();
  try {
    if (!(await portal.signedIn())) throw new SignInNeeded();
    members = (await portal.memberships()).filter((m) => !m.organization);
    const open = members.filter((m) => m.available);
    log(`The portal lists ${members.length} courses: ${open.length} open, ${members.length - open.length} locked.`);
    for (const m of open) {
      const feed = await portal.courseFeed(m.id);
      const refused = Object.entries(feed.statuses).filter(([, s]) => s !== 200).map(([k, s]) => `${k} ${s}`);
      feeds.set(m.id, feed);
      log(`  ${m.code}: ${feed.contents.length} items, ${feed.columns.length} graded columns, ${feed.announcements.length} announcements${refused.length ? ` (refused: ${refused.join(", ")})` : ""}`);
    }
  } catch (e) {
    await portal.close(false);
    throw e;
  }
  await portal.close(true);

  // 2. Which courses changed since the last run. A first export that stops at a date is fingerprinted as cut.
  const prints = new Map([...feeds].map(([id, feed]) => [id, fingerprint(cut(feed, opt.until))]));
  const changed = members.filter((m) => feeds.has(m.id) && (opt.full || state.fingerprints[m.id] !== prints.get(m.id)));
  log(`${changed.length} of ${feeds.size} open courses changed since the last run${changed.length ? "" : ": nothing to read"}.`);

  const runIds: string[] = [];
  let steps = 0;
  const book = (what: string, used: number, id: string) => {
    steps += used;
    runIds.push(id);
    ledger.book(what, used * STEP_USD, id);
    saveState();
  };

  // 3a. On a first or full export, the Agent reads the Grades overview: every course, and which are locked.
  if ((first || opt.full) && members.length) {
    try {
      ledger.mustHaveRoom(12 * STEP_USD, "reading the Grades overview");
      const id = await api.startRun({ url: `${cfg.origin}/ultra/grades`, goal: OVERVIEW_GOAL, output_schema: OVERVIEW_SCHEMA, profile_id: profile.id, max_steps: 12, max_seconds: 300 });
      const run = await api.waitRun(id);
      book("Grades overview", run.num_of_steps ?? 0, id);
      const answer = overviewAnswer(run.result);
      if (answer.signedOut) throw new SignInNeeded();
      const codes = new Map(members.map((m) => [m.code.toLowerCase(), m]));
      const seen = answer.courses.filter((c) => codes.has(c.code.trim().toLowerCase()));
      state.overview = { runId: id, steps: run.num_of_steps ?? 0, agentCourses: answer.courses.length, matched: new Set(seen.map((c) => c.code.trim().toLowerCase())).size, lockedSeen: seen.filter((c) => c.locked && !codes.get(c.code.trim().toLowerCase())!.available).length, at: new Date().toISOString() };
      log(`The Agent's overview: ${state.overview.matched} of ${members.length} courses seen, ${state.overview.lockedSeen} of ${members.length - feeds.size} locked ones recognised (${state.overview.steps} steps).`);
    } catch (e) {
      if (e instanceof SignInNeeded) throw e;
      log(`The Grades overview could not be read (${e instanceof Error ? e.message.slice(0, 120) : "unknown"}); the export goes on without it.`);
    }
    saveState();
  }

  // 3b. The Agent reads the Grades page of each changed course. A reading is kept only when its rows
  //     are the portal's own rows; it is judged against the whole course, then cut to the date asked for.
  const rowsOf = new Map<string, CourseRows>();
  const trusted = new Set<string>();
  await pool(changed, 2, async (m) => {
    const feed = feeds.get(m.id)!;
    const whole = mapCourse(m.id, feed);
    const kept = mapCourse(m.id, cut(feed, opt.until));
    rowsOf.set(m.id, kept);
    if (whole.grades.length === 0) {
      trusted.add(m.id);
      return;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      ledger.mustHaveRoom(MAX_STEPS * STEP_USD, `reading the grades of ${m.code}`);
      const id = await api.startRun({ url: gradesUrl(cfg.origin, m.id, m.ultra), goal: GRADES_GOAL, output_schema: GRADES_SCHEMA, profile_id: profile.id, max_steps: MAX_STEPS, max_seconds: 240 });
      const run = await api.waitRun(id);
      book(`Grades page, ${m.code}`, run.num_of_steps ?? 0, id);
      const answer = gradesAnswer(run.result);
      if (answer.signedOut) throw new SignInNeeded();
      const { grades, reading } = applyReading(whole.grades, run.status === "COMPLETED" && answer.pageOk ? answer.rows : []);
      state.readings[m.id] = { ...reading, runId: id, steps: run.num_of_steps ?? 0, at: new Date().toISOString() };
      saveState();
      if (reading.trusted) {
        const keep = new Set(kept.grades.map((g) => g.id));
        kept.grades = grades.filter((g) => keep.has(g.id));
        trusted.add(m.id);
        log(`  ${m.code}: the Agent read ${reading.agentRows} rows in ${run.num_of_steps} steps; ${reading.equal} of ${reading.matched} scores equal the portal's${reading.differs ? `, ${reading.differs} differ` : ""}${reading.notOnPage ? `, ${reading.notOnPage} not shown on the page` : ""}.`);
        return;
      }
      log(`  ${m.code}: the Agent's reading was refused (${reading.matched} of ${reading.agentRows} rows are the portal's); ${attempt === 0 ? "reading it once more" : "left unread and marked so"}.`);
    }
  });

  // 4. Merge. Courses that did not change are not touched; nothing already taken home is ever dropped.
  const found: Tables = { courses: members.map(courseRow), items: [], grades: [], files: [], announcements: [], messages: [] };
  for (const rows of rowsOf.values()) for (const t of ["items", "grades", "files", "announcements", "messages"] as const) (found[t] as unknown[]).push(...rows[t]);
  const { next, changes } = merge(base, found);
  next.exportedAt = new Date().toISOString();
  const run = { id: runId, at: startedAt, kind: first ? ("export" as const) : ("rerun" as const), until: opt.until, steps, usd: Math.round(steps * STEP_USD * 1000) / 1000, added: changes.filter((c) => c.what === "new").length, changed: changes.filter((c) => c.what === "changed").length, tinyfishRunIds: runIds };
  next.runs.push(run);
  for (const m of changed) if (trusted.has(m.id)) state.fingerprints[m.id] = prints.get(m.id)!;
  const write = (changesNow: readonly Change[]) => {
    writeWhole(at("export.json"), JSON.stringify(next, null, 1));
    for (const [name, text] of Object.entries(csvFiles(next))) writeWhole(at(`csv/${name}`), text);
    writeWhole(at(`changes/${runId}.json`), JSON.stringify({ run: runId, at: startedAt, until: opt.until, added: run.added, changed: run.changed, rows: changesNow }, null, 1));
    writeWhole(at("manifest.json"), JSON.stringify(manifest(next, state, members, ledger), null, 1));
    writeWhole(at("sealed.json"), JSON.stringify(seal(next, cfg.salt, changesNow), null, 1));
    saveState();
  };
  write(changes);
  log(`Merged: ${run.added} new rows, ${run.changed} changed.`);

  // 5. Documents that are listed but not yet saved. The browser only asks the portal where the bytes
  //    are; the portal answers with a link that works for a short time, and the bytes come from there.
  if (opt.files) {
    const codeOf = new Map(next.courses.map((c) => [c.id, c.code]));
    const todo = next.files.filter((f) => f.path === null && !state.skipped[f.id]);
    const used = new Set(next.files.filter((f) => f.path).map((f) => f.path!.toLowerCase()));
    if (todo.length) log(`Fetching ${todo.length} documents.`);
    let opened = 0;
    let live: Portal | null = null;
    let done = 0;
    try {
      for (const f of todo) {
        if (!live || Date.now() - opened > BROWSER_MS) {
          if (live) await live.close(true);
          live = await openPortal(api, profile.id, cfg.origin);
          opened = Date.now();
          if (!(await live.signedIn())) throw new SignInNeeded();
        }
        const link = await live.fileLink(f.source);
        if (link.status !== 200 || !link.url) {
          state.skipped[f.id] = `the portal answered ${link.status}`;
          continue;
        }
        if (link.bytes && link.bytes > opt.maxFileMb * 1_048_576) {
          f.bytes = link.bytes;
          state.skipped[f.id] = `larger than ${opt.maxFileMb} MB`;
          continue;
        }
        let bytes: Buffer | null = null;
        if (!link.url.startsWith(cfg.origin)) {
          const res = await fetch(link.url, { signal: AbortSignal.timeout(180_000) }).catch(() => null);
          if (res?.ok) bytes = Buffer.from(await res.arrayBuffer());
        }
        bytes ??= await live.fileBytes(f.source);
        if (!bytes) {
          state.skipped[f.id] = "the bytes could not be fetched";
          continue;
        }
        const place = placeFor(codeOf.get(f.courseId) ?? f.courseId, f.name, used);
        writeWhole(at(place), bytes);
        f.bytes = bytes.length;
        f.sha256 = createHash("sha256").update(bytes).digest("hex");
        f.path = place;
        if (++done % 25 === 0) {
          write(changes);
          log(`  ${done} of ${todo.length} documents saved.`);
        }
      }
    } finally {
      if (live) await live.close(true);
    }
    write(changes);
    log(`Documents: ${done} saved now, ${next.files.filter((f) => f.path).length} of ${next.files.length} in all, ${Object.keys(state.skipped).length} left out with a reason.`);
  }

  return { run, totals: Object.fromEntries(TABLES.map((t) => [t, next[t].length])), saved: next.files.filter((f) => f.path).length, spentUsd: ledger.spent() };
}

/** Counts and checks, per course: what a reader needs to judge the export without opening it. */
function manifest(exp: Export, state: State, members: Membership[], ledger: Ledger) {
  const count = (rows: Array<{ courseId: string | null }>, id: string) => rows.filter((r) => r.courseId === id).length;
  return {
    portal: exp.portal,
    exportedAt: exp.exportedAt,
    totals: { ...Object.fromEntries(TABLES.map((t) => [t, exp[t].length])), locked: exp.courses.filter((c) => c.state === "locked").length, documentsSaved: exp.files.filter((f) => f.path).length, documentsLeftOut: Object.keys(state.skipped).length },
    gradeChecks: Object.fromEntries(["match", "differs", "not on page", "unread"].map((k) => [k, exp.grades.filter((g) => g.check === k).length])),
    overview: state.overview,
    courses: exp.courses.map((c) => ({
      id: c.id, code: c.code, term: c.term, state: c.state, layout: members.find((m) => m.id === c.id)?.ultra ? "newer" : "older",
      items: count(exp.items, c.id), grades: count(exp.grades, c.id), files: count(exp.files, c.id), filesSaved: exp.files.filter((f) => f.courseId === c.id && f.path).length,
      announcements: count(exp.announcements, c.id), messages: count(exp.messages, c.id), reading: state.readings[c.id] ?? null,
    })),
    leftOut: state.skipped,
    runs: exp.runs,
    spend: { usd: ledger.spent(), capUsd: ledger.capUsd, lines: ledger.lines },
  };
}
