// What the TinyFish Agent is asked to do. Every goal is read-only and says so.
import type { AgentRow } from "../core/match.ts";

const RULES =
  "Rules: this is read-only. Copy only what is on the page and never make up a row. Do not open any item and do not leave this page. " +
  "Never click Submit, Start, Begin, Send, Save, Delete or Mark, and never start a test. If a page asks you to sign in, stop and answer with signed_out true.";

export const GRADES_SCHEMA = {
  type: "object",
  properties: {
    signed_out: { type: "boolean" },
    page_shows_grades: { type: "boolean" },
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, due: { type: "string" }, status: { type: "string" }, grade: { type: "string" }, possible: { type: "string" } },
        required: ["title", "grade"],
      },
    },
  },
  required: ["signed_out", "page_shows_grades", "rows"],
} as const;

export const OVERVIEW_SCHEMA = {
  type: "object",
  properties: {
    signed_out: { type: "boolean" },
    courses: {
      type: "array",
      items: {
        type: "object",
        properties: { code: { type: "string" }, title: { type: "string" }, term: { type: "string" }, locked: { type: "boolean" }, work_count: { type: "string" } },
        required: ["code", "title", "locked"],
      },
    },
  },
  required: ["signed_out", "courses"],
} as const;

/** The two course layouts keep the student's grades at different addresses. */
export function gradesUrl(origin: string, courseId: string, ultra: boolean): string {
  return ultra ? `${origin}/ultra/courses/${courseId}/grades` : `${origin}/webapps/gradebook/do/student/viewGrades?course_id=${courseId}&callback=course`;
}

export const GRADES_GOAL =
  "You are signed in to a university Blackboard as the student. This page lists the student's own graded work for one course: each row is one item with its name, " +
  "dates, a status, a grade and the points possible. Make every row visible first: if rows are hidden behind a filter choose \"All\", scroll to the end of the list, and use any " +
  "\"Load more\" or \"Show more\" control until no more rows appear. Then return every row exactly as shown: title, due date as shown, status as shown, the grade as shown " +
  "(for example \"14\", \"4.5\", \"14.00\" or \"-\"), and the points possible as shown. If the page does not show such a list, answer with page_shows_grades false and no rows. " +
  RULES;

export const OVERVIEW_GOAL =
  "You are signed in to a university Blackboard as the student. This is the Grades page: it lists every course the student has, grouped under term headings. " +
  "Make the whole list visible first: scroll to the end and use every \"Load more courses\" control until none is left. Then return every course once: its code line " +
  "(for example \"ABCD101_12345_Fall_2026\"), its title, the term heading it is under, whether the page says the instructor has not made the course available (locked true), " +
  "and the number shown in \"View all work (N)\" when there is one. " +
  RULES;

export interface GradesAnswer {
  signedOut: boolean;
  pageOk: boolean;
  rows: AgentRow[];
}

/** An Agent result arrives as an object or as JSON text; anything else is an empty reading. */
export function gradesAnswer(result: unknown): GradesAnswer {
  let r = result;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      r = null;
    }
  }
  const o = (r && typeof r === "object" ? r : {}) as { signed_out?: unknown; page_shows_grades?: unknown; rows?: unknown };
  const rows = Array.isArray(o.rows) ? o.rows.filter((x): x is AgentRow => !!x && typeof x === "object" && typeof (x as AgentRow).title === "string").map((x) => ({ ...x, grade: String(x.grade ?? "") })) : [];
  return { signedOut: o.signed_out === true, pageOk: o.page_shows_grades !== false, rows };
}

export interface OverviewCourse {
  code: string;
  title: string;
  term?: string;
  locked: boolean;
  work_count?: string;
}

export function overviewAnswer(result: unknown): { signedOut: boolean; courses: OverviewCourse[] } {
  let r = result;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      r = null;
    }
  }
  const o = (r && typeof r === "object" ? r : {}) as { signed_out?: unknown; courses?: unknown };
  const courses = Array.isArray(o.courses) ? o.courses.filter((x): x is OverviewCourse => !!x && typeof x === "object" && typeof (x as OverviewCourse).code === "string") : [];
  return { signedOut: o.signed_out === true, courses };
}
