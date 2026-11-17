// Blackboard Learn: turning what the portal's own feed reports into export rows.
// The feed is the data the portal's pages load for themselves. It is read through the signed-in
// TinyFish browser (src/portal), cut down there to the few fields below, and mapped here.
// Nothing in this file touches the network.
import { createHash } from "node:crypto";
import type { Announcement, Course, FileRef, Grade, Item, Kind, Message } from "./model.ts";

export interface RawMembership {
  id: string;
  code: string;
  title: string;
  term: string | null;
  available: boolean;
  organization: boolean;
}

export interface RawContent {
  id: string;
  parentId: string | null;
  title: string;
  handler: string;
  created: string | null;
  modified: string | null;
  /** A page's own HTML, kept only to find the documents linked inside it. */
  body?: string;
  attachments?: Array<{ id: string; fileName: string }>;
}

export interface RawColumn {
  id: string;
  name: string;
  possible: number | null;
  due: string | null;
}

export interface RawGrade {
  columnId: string;
  status: string;
  score: number | null;
  first: string | null;
  last: string | null;
}

export interface RawAnnouncement {
  id: string;
  title: string;
  body: string;
  start: string | null;
  created: string | null;
}

export interface RawConversation {
  id: string;
  created: string | null;
  updated: string | null;
  total: number;
}

export interface RawCourse {
  contents: RawContent[];
  columns: RawColumn[];
  grades: RawGrade[];
  announcements: RawAnnouncement[];
  conversations: RawConversation[];
}

export interface CourseRows {
  items: Item[];
  grades: Grade[];
  files: FileRef[];
  announcements: Announcement[];
  messages: Message[];
}

export function courseRow(m: RawMembership): Course {
  return { id: m.id, code: m.code, title: m.title, term: m.term ?? "No term", state: m.available ? "open" : "locked" };
}

export function kindOf(handler: string): Kind {
  if (handler === "resource/x-bb-folder") return "folder";
  if (handler === "resource/x-bb-document") return "document";
  if (handler === "resource/x-bb-file") return "file";
  if (handler === "resource/x-bb-assignment") return "assignment";
  if (handler.startsWith("resource/x-bb-asmt")) return "test";
  if (handler === "resource/x-bb-externallink") return "link";
  if (/blti|toollink/.test(handler)) return "tool";
  return "other";
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const unescape = (text: string) => text.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (whole, name: string) => {
  if (name[0] === "#") return String.fromCodePoint(name[1]!.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
  return ENTITIES[name.toLowerCase()] ?? whole;
});

export function htmlToText(html: string): string {
  const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<\/(p|div|li|h\d|tr)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
  return unescape(text).split("\n").map((line) => line.replace(/[ \t ]+/g, " ").trim()).filter(Boolean).join("\n");
}

/** The documents a page links to. A document is known by the "xid" in its address, so it is listed once. */
export function filesInBody(html: string): Array<{ id: string; name: string; source: string }> {
  const out = new Map<string, { id: string; name: string; source: string }>();
  const path = (url: string) => /\/bbcswebdav\/[^"'?#\s<]+/.exec(unescape(url))?.[0] ?? null;
  const add = (url: string, name: string | null) => {
    const source = path(url);
    const id = source ? /xid-\d+_\d+/.exec(source)?.[0] : null;
    if (!source || !id) return;
    const known = out.get(id);
    if (!known) out.set(id, { id, name: name?.trim() || id, source });
    else if (known.name === id && name?.trim()) known.name = name.trim();
  };
  for (const m of html.matchAll(/data-bbfile="([^"]+)"/g)) {
    try {
      const info = JSON.parse(unescape(m[1]!)) as { linkName?: string; displayName?: string; resourceUrl?: string };
      if (info.resourceUrl) add(info.resourceUrl, info.linkName ?? info.displayName ?? null);
    } catch {
      // Not the shape expected: the plain link below still finds the document.
    }
  }
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]*bbcswebdav[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) add(m[1]!, htmlToText(m[2]!));
  return [...out.values()];
}

/** The day a first export stops at, as the last moment of that day in UTC. */
const endOf = (day: string) => `${day}T23:59:59.999Z`;

/** What the course held up to the end of a day. With no day, everything. */
export function cut(raw: RawCourse, until: string | null): RawCourse {
  if (!until) return raw;
  const limit = endOf(until);
  const by = (when: string | null) => when === null || when <= limit;
  const gradeOf = new Map(raw.grades.map((g) => [g.columnId, g]));
  const columns = raw.columns.filter((c) => {
    const g = gradeOf.get(c.id);
    return by(g ? (g.last ?? g.first ?? c.due) : c.due);
  });
  const kept = new Set(columns.map((c) => c.id));
  return {
    contents: raw.contents.filter((c) => by(c.created)),
    columns,
    grades: raw.grades.filter((g) => kept.has(g.columnId)),
    announcements: raw.announcements.filter((a) => by(a.start ?? a.created)),
    conversations: raw.conversations.filter((c) => by(c.created)),
  };
}

export function mapCourse(courseId: string, raw: RawCourse): CourseRows {
  const ids = new Set(raw.contents.map((c) => c.id));
  const items: Item[] = raw.contents.map((c) => ({ id: c.id, courseId, parentId: c.parentId && ids.has(c.parentId) ? c.parentId : null, kind: kindOf(c.handler), title: c.title, dueAt: null }));

  const files: FileRef[] = [];
  const seen = new Set<string>();
  const add = (file: FileRef) => {
    if (seen.has(file.id)) return;
    seen.add(file.id);
    files.push(file);
  };
  for (const c of raw.contents) {
    for (const a of c.attachments ?? []) add({ id: a.id, courseId, itemId: c.id, name: a.fileName, source: `/learn/api/public/v1/courses/${courseId}/contents/${c.id}/attachments/${a.id}/download`, bytes: null, sha256: null, path: null });
    for (const f of c.body ? filesInBody(c.body) : []) add({ id: f.id, courseId, itemId: c.id, name: f.name, source: f.source, bytes: null, sha256: null, path: null });
  }

  const gradeOf = new Map(raw.grades.map((g) => [g.columnId, g]));
  const grades: Grade[] = raw.columns.map((c) => {
    const g = gradeOf.get(c.id);
    return { id: c.id, courseId, title: c.name, score: g?.score ?? null, possible: c.possible, status: g?.status ?? "No grade yet", submittedAt: g ? (g.last ?? g.first ?? c.due) : c.due, shown: null, check: "unread" };
  });

  const announcements: Announcement[] = raw.announcements.map((a) => ({ id: a.id, courseId, title: a.title, body: htmlToText(a.body), postedAt: a.start ?? a.created }));
  const messages: Message[] = raw.conversations.map((c) => ({ id: c.id, courseId, subject: `Conversation of ${c.total} message${c.total === 1 ? "" : "s"}`, sentAt: c.updated ?? c.created }));
  return { items, grades, files, announcements, messages };
}

/** Changes when anything in the course changed: used to decide which courses a rerun reads again. */
export function fingerprint(raw: RawCourse): string {
  const sorted = <T>(rows: T[], line: (row: T) => string) => rows.map(line).sort();
  const parts = [
    sorted(raw.contents, (c) => [c.id, c.title, c.modified ?? "", c.handler, (c.attachments ?? []).map((a) => a.id).sort().join("+")].join("|")),
    sorted(raw.columns, (c) => [c.id, c.name, c.possible ?? "", c.due ?? ""].join("|")),
    sorted(raw.grades, (g) => [g.columnId, g.status, g.score ?? "", g.last ?? ""].join("|")),
    sorted(raw.announcements, (a) => [a.id, a.title, a.start ?? "", a.created ?? "", a.body.length].join("|")),
    sorted(raw.conversations, (c) => [c.id, c.updated ?? "", c.total].join("|")),
  ];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}
