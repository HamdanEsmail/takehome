// Checking what the Agent read on a course's Grades page against what the portal itself reports.
// An Agent run can finish "completed" and still hand back rows that are not on the page. So a
// reading is believed only when its rows are the portal's own rows, and each score is compared.
import type { Grade } from "./model.ts";

/** One row as the Agent returned it: everything as shown on the page. */
export interface AgentRow {
  title: string;
  due?: string;
  status?: string;
  grade?: string;
  possible?: string;
}

export interface Reading {
  agentRows: number;
  matched: number;
  equal: number;
  differs: number;
  /** Rows the page shows that the portal's list of graded work does not hold (a total line, attendance). */
  pageOnly: number;
  /** Rows the portal holds that the Grades page does not show to the student. */
  notOnPage: number;
  trusted: boolean;
}

/** At least this share of the Agent's rows must be the portal's own rows, or the reading is refused. */
const TRUST = 0.6;

const norm = (text: string) => text.toLowerCase().replace(/\((late|overdue|new)\)/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The number in a grade as shown: "41 / 50" is 41, "1,581.25" is 1581.25, "--" and "Not graded" are none. */
export function gradeNumber(shown: string): number | null {
  const m = /^[^\d-]*(-?\d[\d,]*(?:\.\d+)?)/.exec(shown.trim());
  if (!m || /[a-z]/i.test(shown.slice(0, m.index + (m[0].length - m[1]!.length)))) return null;
  const n = Number(m[1]!.replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
}

/** Equal at the precision the page shows: the portal's 82.4567 is the page's "82.46". */
function sameScore(shown: string, score: number | null): boolean {
  const n = gradeNumber(shown);
  if (n === null || score === null) return n === null && score === null;
  const decimals = Math.min(6, (/\.(\d+)/.exec(shown.replaceAll(",", ""))?.[1] ?? "").length);
  return Math.abs(n - score) <= 0.5 * 10 ** -decimals + 1e-9;
}

function sameTitle(page: string, portal: string): boolean {
  if (page === portal) return true;
  const short = page.length < portal.length ? page : portal;
  const long = page.length < portal.length ? portal : page;
  return short.length >= 6 && long.startsWith(short);
}

export function applyReading(grades: readonly Grade[], rows: readonly AgentRow[]): { grades: Grade[]; reading: Reading } {
  const out = grades.map((g) => ({ ...g }));
  const taken = new Set<number>();
  const pairs: Array<[row: AgentRow, at: number]> = [];
  for (const row of rows) {
    const title = norm(row.title ?? "");
    let at = out.findIndex((g, i) => !taken.has(i) && norm(g.title) === title);
    if (at < 0) at = out.findIndex((g, i) => !taken.has(i) && sameTitle(title, norm(g.title)));
    if (at < 0) continue;
    taken.add(at);
    pairs.push([row, at]);
  }
  const matched = pairs.length;
  const trusted = rows.length === 0 ? grades.length === 0 : matched / rows.length >= TRUST;
  let equal = 0;
  if (trusted) {
    for (const [row, at] of pairs) {
      const shown = (row.grade ?? "").trim();
      const same = sameScore(shown, out[at]!.score);
      if (same) equal++;
      out[at] = { ...out[at]!, shown, check: same ? "match" : "differs" };
    }
    out.forEach((g, i) => {
      if (!taken.has(i)) out[i] = { ...g, shown: null, check: "not on page" };
    });
  } else {
    for (const [row, at] of pairs) if (sameScore((row.grade ?? "").trim(), out[at]!.score)) equal++;
  }
  return {
    grades: out,
    reading: { agentRows: rows.length, matched, equal, differs: matched - equal, pageOnly: rows.length - matched, notOnPage: trusted ? out.length - matched : 0, trusted },
  };
}

/**
 * True when the portal's graded work for a course is what the export already holds, with every row
 * read. The Agent then has nothing new to read there, and a rerun leaves the course's Grades page alone.
 */
export function sameGrades(held: readonly Grade[], portal: readonly Grade[]): boolean {
  if (held.length !== portal.length || held.some((g) => g.check === "unread")) return false;
  const line = (g: Grade) => [g.id, g.title, g.score ?? "", g.possible ?? "", g.status, g.submittedAt ?? ""].join("|");
  const mine = held.map(line).sort();
  const theirs = portal.map(line).sort();
  return mine.every((row, i) => row === theirs[i]);
}
