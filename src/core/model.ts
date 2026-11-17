// The shape of an export: what Takehome writes for one student's portal.
// Every row carries the portal's own id, so a second run can tell what it has seen before.

export type Kind = "folder" | "document" | "file" | "assignment" | "test" | "link" | "tool" | "other";

export interface Course {
  id: string;
  code: string;
  title: string;
  term: string;
  /** "locked" when the portal still lists the course but no longer lets the student in. */
  state: "open" | "locked";
}

export interface Item {
  id: string;
  courseId: string;
  parentId: string | null;
  kind: Kind;
  title: string;
  dueAt: string | null;
}

/**
 * How a grade row stands after the Agent's reading of the Grades page was compared with what the
 * portal itself reports:
 *  - "match": the Agent read this row and its score equals the portal's
 *  - "differs": the Agent read this row with another score
 *  - "not on page": the portal holds the row but the Grades page does not show it to the student
 *  - "unread": no Agent reading of this course has been taken yet
 */
export type GradeCheck = "match" | "differs" | "not on page" | "unread";

export interface Grade {
  id: string;
  courseId: string;
  title: string;
  score: number | null;
  possible: number | null;
  status: string;
  submittedAt: string | null;
  /** The grade exactly as the Grades page showed it to the Agent; null when the Agent did not read it. */
  shown: string | null;
  check: GradeCheck;
}

export interface FileRef {
  id: string;
  courseId: string;
  itemId: string | null;
  name: string;
  bytes: number | null;
  sha256: string | null;
  /** Where the document was saved, relative to the export folder; null while only its listing is known. */
  path: string | null;
}

export interface Announcement {
  id: string;
  courseId: string;
  title: string;
  body: string;
  postedAt: string | null;
}

/** A conversation in a course. Only its dates and size are kept: no sender, no recipient, no text. */
export interface Message {
  id: string;
  courseId: string | null;
  subject: string;
  sentAt: string | null;
}

export interface RunRecord {
  id: string;
  at: string;
  kind: "export" | "rerun";
  /** A first export may stop at a date; null means it took everything. */
  until: string | null;
  steps: number;
  usd: number;
  added: number;
  changed: number;
  tinyfishRunIds: string[];
}

export interface Tables {
  courses: Course[];
  items: Item[];
  grades: Grade[];
  files: FileRef[];
  announcements: Announcement[];
  messages: Message[];
}

export type Table = keyof Tables;

export const TABLES: readonly Table[] = ["courses", "items", "grades", "files", "announcements", "messages"];

export interface Export extends Tables {
  version: 1;
  portal: string;
  exportedAt: string | null;
  runs: RunRecord[];
}

export function emptyExport(portal: string): Export {
  return { version: 1, portal, exportedAt: null, courses: [], items: [], grades: [], files: [], announcements: [], messages: [], runs: [] };
}
