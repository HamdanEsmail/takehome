// The sealed list: the only thing Takehome ever publishes.
// It is built from an allow-list. Each field below is copied on purpose; nothing else in the
// export can reach it, so no title, name, code, id, date or score leaves the computer.
import { createHash } from "node:crypto";
import type { Change } from "./merge.ts";
import type { Export, Table } from "./model.ts";

export interface SealedLocker {
  locker: number;
  term: string;
  state: "open" | "locked";
  /** A fingerprint made with a secret salt: the owner can match it to a course, nobody else can. */
  fp: string;
  /** Word lengths for the bar drawn in place of the course's name. They come from the fingerprint, not from the name. */
  bar: number[];
  counts: { items: number; grades: number; checked: number; files: number; announcements: number; messages: number };
  kb: number;
  saved: number;
  /** How many rows the latest run added to or changed in this locker. */
  fresh: number;
  firstMonth: string | null;
  lastMonth: string | null;
}

export interface SealedFile {
  locker: number;
  type: string;
  kb: number;
  saved: boolean;
  fp: string;
}

export interface SealedRun {
  day: string;
  kind: "export" | "rerun";
  until: string | null;
  steps: number;
  usd: number;
  added: number;
  changed: number;
}

export interface Sealed {
  version: 1;
  portal: string;
  sealedOn: string | null;
  totals: { courses: number; locked: number; items: number; grades: number; checked: number; files: number; saved: number; announcements: number; messages: number; kb: number };
  lockers: SealedLocker[];
  files: SealedFile[];
  runs: SealedRun[];
}

const TYPES = new Set(["docx", "doc", "pptx", "ppt", "ppsx", "pdf", "xlsx", "xls", "csv", "txt", "zip", "png", "jpg", "jpeg", "mp4", "ipynb"]);
const SEASON: Record<string, number> = { winter: 0, spring: 1, summer: 2, fall: 3, autumn: 3 };

/** "Fall 2025" sorts before "Spring 2026": the order a student lived them in. Unknown names go last. */
function termOrder(term: string): number {
  const m = /^(\w+)\s+(\d{4})$/.exec(term.trim());
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[2]) * 10 + (SEASON[m[1]!.toLowerCase()] ?? 9);
}

const month = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : null);
const kb = (bytes: number | null) => (bytes === null ? 0 : Math.max(1, Math.round(bytes / 1024)));

export function seal(exp: Export, salt: string, lastChanges: readonly Change[] = []): Sealed {
  if (!salt) throw new Error("A salt is needed to seal: without one a fingerprint could be guessed.");
  const digest = (table: Table, id: string) => createHash("sha256").update(`${salt}:${table}:${id}`).digest();
  const fp = (table: Table, id: string) => digest(table, id).toString("hex").slice(0, 8);

  // Lockers are ordered by term, then by fingerprint, so their numbers do not follow the course codes.
  const order = exp.courses
    .map((c) => ({ c, fp: fp("courses", c.id), d: digest("courses", c.id) }))
    .sort((a, b) => termOrder(a.c.term) - termOrder(b.c.term) || (a.fp < b.fp ? -1 : a.fp > b.fp ? 1 : 0));
  const lockerOf = new Map(order.map((o, i) => [o.c.id, i + 1]));

  const courseOf = new Map<string, string>();
  for (const c of exp.courses) courseOf.set(`courses:${c.id}`, c.id);
  for (const t of ["items", "grades", "files", "announcements", "messages"] as const) for (const r of exp[t]) if (r.courseId) courseOf.set(`${t}:${r.id}`, r.courseId);
  const fresh = new Map<string, number>();
  for (const ch of lastChanges) {
    const course = courseOf.get(`${ch.table}:${ch.id}`);
    if (course) fresh.set(course, (fresh.get(course) ?? 0) + 1);
  }

  const lockers: SealedLocker[] = order.map(({ c, fp: f, d }, i) => {
    const mine = <T extends { courseId: string | null }>(rows: T[]) => rows.filter((r) => r.courseId === c.id);
    const grades = mine(exp.grades);
    const files = mine(exp.files);
    const months = [
      ...mine(exp.items).map((r) => month(r.dueAt)),
      ...grades.map((r) => month(r.submittedAt)),
      ...mine(exp.announcements).map((r) => month(r.postedAt)),
      ...mine(exp.messages).map((r) => month(r.sentAt)),
    ].filter((m): m is string => m !== null).sort();
    const words = 2 + (d[0]! % 3);
    return {
      locker: i + 1,
      term: c.term,
      state: c.state,
      fp: f,
      bar: Array.from({ length: words }, (_, w) => 3 + (d[w + 1]! % 9)),
      counts: { items: mine(exp.items).length, grades: grades.length, checked: grades.filter((g) => g.check === "match").length, files: files.length, announcements: mine(exp.announcements).length, messages: mine(exp.messages).length },
      kb: files.filter((f2) => f2.path !== null).reduce((n, f2) => n + kb(f2.bytes), 0),
      saved: files.filter((f2) => f2.path !== null).length,
      fresh: fresh.get(c.id) ?? 0,
      firstMonth: months[0] ?? null,
      lastMonth: months.at(-1) ?? null,
    };
  });

  const files: SealedFile[] = exp.files
    .filter((f) => lockerOf.has(f.courseId))
    .map((f) => {
      const ext = (/\.([a-z0-9]{2,5})$/i.exec(f.name)?.[1] ?? "").toLowerCase();
      return { locker: lockerOf.get(f.courseId)!, type: TYPES.has(ext) ? ext : "other", kb: kb(f.bytes), saved: f.path !== null, fp: fp("files", f.id) };
    })
    .sort((a, b) => a.locker - b.locker || (a.fp < b.fp ? -1 : 1));

  const sum = (pick: (l: SealedLocker) => number) => lockers.reduce((n, l) => n + pick(l), 0);
  return {
    version: 1,
    portal: exp.portal,
    sealedOn: exp.exportedAt ? exp.exportedAt.slice(0, 10) : null,
    totals: {
      courses: lockers.length,
      locked: lockers.filter((l) => l.state === "locked").length,
      items: sum((l) => l.counts.items),
      grades: sum((l) => l.counts.grades),
      checked: sum((l) => l.counts.checked),
      files: sum((l) => l.counts.files),
      saved: sum((l) => l.saved),
      announcements: sum((l) => l.counts.announcements),
      messages: exp.messages.length,
      kb: sum((l) => l.kb),
    },
    lockers,
    files,
    runs: exp.runs.map((r) => ({ day: r.at.slice(0, 10), kind: r.kind, until: r.until, steps: r.steps, usd: r.usd, added: r.added, changed: r.changed })),
  };
}
