import { describe, expect, it } from "vitest";
import { courseRow, cut, filesInBody, fingerprint, htmlToText, kindOf, mapCourse, type RawCourse } from "../src/core/blackboard.ts";

// A made-up course, in the shape the portal's own feed has.
const raw = (): RawCourse => ({
  contents: [
    { id: "_10_1", parentId: "_1_1", title: "Week 1", handler: "resource/x-bb-folder", created: "2026-09-01T06:00:00.000Z", modified: "2026-09-01T06:00:00.000Z" },
    { id: "_11_1", parentId: "_10_1", title: "Syllabus", handler: "resource/x-bb-file", created: "2026-09-01T06:10:00.000Z", modified: "2026-09-01T06:10:00.000Z", attachments: [{ id: "_500_1", fileName: "HAR101 Syllabus.docx" }] },
    { id: "_12_1", parentId: "_10_1", title: "Reading list", handler: "resource/x-bb-document", created: "2026-09-02T06:00:00.000Z", modified: "2026-09-02T06:00:00.000Z",
      body: '<p>Read this first.</p><a href="https://portal.example/bbcswebdav/pid-77-dt-content-rid-900_1/xid-900_1" data-bbfile="{&quot;linkName&quot;:&quot;Reading list.pdf&quot;,&quot;resourceUrl&quot;:&quot;https://portal.example/bbcswebdav/pid-77-dt-content-rid-900_1/xid-900_1&quot;}">Reading list.pdf</a>' },
    { id: "_13_1", parentId: "_1_1", title: "Quiz 1", handler: "resource/x-bb-asmt-test-link", created: "2026-09-10T06:00:00.000Z", modified: "2026-09-10T06:00:00.000Z" },
    { id: "_14_1", parentId: "_1_1", title: "Publisher e-book", handler: "resource/x-bb-bltiplacement-ebook_x", created: "2026-09-01T06:00:00.000Z", modified: null },
    { id: "_15_1", parentId: "_1_1", title: "November notes", handler: "resource/x-bb-file", created: "2026-11-05T06:00:00.000Z", modified: "2026-11-05T06:00:00.000Z", attachments: [{ id: "_501_1", fileName: "November notes.pptx" }] },
  ],
  columns: [
    { id: "_70_1", name: "Quiz 1", possible: 10, due: "2026-09-18T19:59:00.000Z" },
    { id: "_71_1", name: "Essay", possible: 20, due: "2026-10-02T19:59:00.000Z" },
    { id: "_72_1", name: "Quiz 4", possible: 5, due: "2026-11-15T19:59:00.000Z" },
    { id: "_73_1", name: "Final project", possible: 40, due: "2026-12-10T19:59:00.000Z" },
  ],
  grades: [
    { columnId: "_70_1", status: "Graded", score: 9, first: "2026-09-18T10:00:00.000Z", last: "2026-09-19T10:00:00.000Z" },
    { columnId: "_71_1", status: "Graded", score: 17.5, first: "2026-10-01T10:00:00.000Z", last: "2026-10-05T10:00:00.000Z" },
    { columnId: "_72_1", status: "Graded", score: 4.5, first: "2026-11-15T10:00:00.000Z", last: "2026-11-16T10:00:00.000Z" },
  ],
  announcements: [
    { id: "_90_1", title: "Welcome", body: "<p>Welcome to the course.&nbsp;Bring a <b>notebook</b>.</p>", start: "2026-09-01T05:00:00.000Z", created: "2026-08-30T05:00:00.000Z" },
    { id: "_91_1", title: "Quiz 4 moved", body: "<p>Now on the 15th.</p>", start: null, created: "2026-11-10T05:00:00.000Z" },
  ],
  conversations: [{ id: "_95_1", created: "2026-10-20T09:00:00.000Z", updated: "2026-10-21T09:00:00.000Z", total: 3 }],
});

describe("reading the portal's feed into export rows", () => {
  it("makes a course row, and calls a course the portal has closed to the student locked", () => {
    expect(courseRow({ id: "_9_1", code: "HAR101_1_Fall_2026", title: "Harbour Studies (02)", term: "Fall 2026", available: true, organization: false })).toEqual({ id: "_9_1", code: "HAR101_1_Fall_2026", title: "Harbour Studies (02)", term: "Fall 2026", state: "open" });
    expect(courseRow({ id: "_8_1", code: "LMP110", title: "Lighthouses", term: null, available: false, organization: false })).toMatchObject({ state: "locked", term: "No term" });
  });

  it("names each kind of content", () => {
    expect(["resource/x-bb-folder", "resource/x-bb-document", "resource/x-bb-file", "resource/x-bb-assignment", "resource/x-bb-asmt-test-link", "resource/x-bb-externallink", "resource/x-bb-blti-link", "resource/x-bb-bltiplacement-ebook_x", "resource/x-bb-toollink", "something/else"].map(kindOf))
      .toEqual(["folder", "document", "file", "assignment", "test", "link", "tool", "tool", "tool", "other"]);
  });

  it("maps a course's content, with top-level items having no parent", () => {
    const { items } = mapCourse("_9_1", raw());
    expect(items).toHaveLength(6);
    expect(items[0]).toEqual({ id: "_10_1", courseId: "_9_1", parentId: null, kind: "folder", title: "Week 1", dueAt: null });
    expect(items[1]!.parentId).toBe("_10_1");
  });

  it("lists one grade row per column, with the student's score where there is one", () => {
    const { grades } = mapCourse("_9_1", raw());
    expect(grades).toHaveLength(4);
    expect(grades[1]).toEqual({ id: "_71_1", courseId: "_9_1", title: "Essay", score: 17.5, possible: 20, status: "Graded", submittedAt: "2026-10-05T10:00:00.000Z", shown: null, check: "unread" });
    expect(grades[3]).toMatchObject({ title: "Final project", score: null, status: "No grade yet", submittedAt: "2026-12-10T19:59:00.000Z" });
  });

  it("finds documents attached to items and documents linked inside a page", () => {
    const { files } = mapCourse("_9_1", raw());
    expect(files.map((f) => f.name)).toEqual(["HAR101 Syllabus.docx", "Reading list.pdf", "November notes.pptx"]);
    expect(files[0]).toEqual({ id: "_500_1", courseId: "_9_1", itemId: "_11_1", name: "HAR101 Syllabus.docx", source: "/learn/api/public/v1/courses/_9_1/contents/_11_1/attachments/_500_1/download", bytes: null, sha256: null, path: null });
    expect(files[1]).toMatchObject({ id: "xid-900_1", itemId: "_12_1", source: "/bbcswebdav/pid-77-dt-content-rid-900_1/xid-900_1" });
  });

  it("reads a linked document's name and address out of a page's HTML, once per document", () => {
    const html = raw().contents[2]!.body!;
    expect(filesInBody(html + html)).toEqual([{ id: "xid-900_1", name: "Reading list.pdf", source: "/bbcswebdav/pid-77-dt-content-rid-900_1/xid-900_1" }]);
    expect(filesInBody('<a href="/bbcswebdav/pid-1-dt-content-rid-22_1/xid-22_1">Notes week 2</a>')).toEqual([{ id: "xid-22_1", name: "Notes week 2", source: "/bbcswebdav/pid-1-dt-content-rid-22_1/xid-22_1" }]);
    expect(filesInBody("<p>No files here.</p>")).toEqual([]);
  });

  it("turns an announcement's HTML into plain text and keeps the day it was shown", () => {
    const { announcements } = mapCourse("_9_1", raw());
    expect(announcements[0]).toEqual({ id: "_90_1", courseId: "_9_1", title: "Welcome", body: "Welcome to the course. Bring a notebook.", postedAt: "2026-09-01T05:00:00.000Z" });
    expect(announcements[1]!.postedAt).toBe("2026-11-10T05:00:00.000Z");
    expect(htmlToText("<p>One</p><p>Two &amp; three</p><br>Four")).toBe("One\nTwo & three\nFour");
  });

  it("keeps only the size and dates of a conversation, never who wrote or what", () => {
    const { messages } = mapCourse("_9_1", raw());
    expect(messages).toEqual([{ id: "_95_1", courseId: "_9_1", subject: "Conversation of 3 messages", sentAt: "2026-10-21T09:00:00.000Z" }]);
  });
});

describe("stopping a first export at a date", () => {
  it("leaves out what the portal got after that day", () => {
    const early = mapCourse("_9_1", cut(raw(), "2026-10-31"));
    expect(early.items.map((i) => i.title)).not.toContain("November notes");
    expect(early.files.map((f) => f.name)).toEqual(["HAR101 Syllabus.docx", "Reading list.pdf"]);
    expect(early.grades.map((g) => g.title)).toEqual(["Quiz 1", "Essay"]);
    expect(early.announcements.map((a) => a.title)).toEqual(["Welcome"]);
    expect(early.messages).toHaveLength(1);
  });

  it("takes everything when no date is given", () => {
    expect(mapCourse("_9_1", cut(raw(), null)).grades).toHaveLength(4);
  });
});

describe("a course's fingerprint", () => {
  it("stays the same when nothing changed, whatever order the feed uses", () => {
    const a = raw();
    const b = raw();
    b.columns.reverse();
    b.contents.reverse();
    expect(fingerprint(b)).toBe(fingerprint(a));
    expect(fingerprint(a)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("changes when a grade, a document or an announcement changes", () => {
    const base = fingerprint(raw());
    const graded = raw();
    graded.grades.push({ columnId: "_73_1", status: "Graded", score: 38, first: null, last: "2026-12-12T10:00:00.000Z" });
    const edited = raw();
    edited.contents[1]!.modified = "2026-11-17T06:00:00.000Z";
    const told = raw();
    told.announcements.push({ id: "_92_1", title: "Room change", body: "", start: null, created: "2026-11-17T05:00:00.000Z" });
    expect(new Set([base, fingerprint(graded), fingerprint(edited), fingerprint(told)]).size).toBe(4);
  });
});
