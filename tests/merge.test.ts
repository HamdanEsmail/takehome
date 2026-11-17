import { describe, expect, it } from "vitest";
import { sampleExport, SAMPLE_TABLES } from "../fixtures/sample.ts";
import { merge } from "../src/core/merge.ts";
import { emptyExport } from "../src/core/model.ts";

describe("merging what a walk found into the export", () => {
  it("takes everything on the first run and reports each row as new", () => {
    const { next, changes } = merge(emptyExport("sample"), SAMPLE_TABLES);
    expect(next.courses).toHaveLength(6);
    expect(next.grades).toHaveLength(SAMPLE_TABLES.grades.length);
    const rows = SAMPLE_TABLES.courses.length + SAMPLE_TABLES.items.length + SAMPLE_TABLES.grades.length + SAMPLE_TABLES.files.length + SAMPLE_TABLES.announcements.length + SAMPLE_TABLES.messages.length;
    expect(changes).toHaveLength(rows);
    expect(changes.every((c) => c.what === "new")).toBe(true);
  });

  it("reports nothing when the same walk is merged a second time", () => {
    const first = merge(emptyExport("sample"), SAMPLE_TABLES).next;
    const { next, changes } = merge(first, structuredClone(SAMPLE_TABLES));
    expect(changes).toEqual([]);
    expect(next.items).toHaveLength(first.items.length);
  });

  it("picks up only the new grade and the changed score on a rerun", () => {
    const base = sampleExport();
    const draft = base.grades.find((g) => g.title === "Passage plan, first draft")!;
    const found = {
      grades: [
        { ...draft, score: 22, status: "Graded" },
        { id: "_new_1", courseId: "_9006_1", title: "Barometer log", score: 10, possible: 10, status: "Graded", submittedAt: "2026-11-13T19:59:00Z", shown: "10", check: "match" as const },
        structuredClone(base.grades[0]!),
      ],
    };
    const { next, changes } = merge(base, found);
    expect(changes).toEqual([
      { table: "grades", id: draft.id, what: "changed" },
      { table: "grades", id: "_new_1", what: "new" },
    ]);
    expect(next.grades).toHaveLength(base.grades.length + 1);
    expect(next.grades.find((g) => g.id === draft.id)!.score).toBe(22);
  });

  it("keeps a row the portal no longer shows, because a locked course must not empty the export", () => {
    const base = sampleExport();
    const { next, changes } = merge(base, { courses: base.courses.slice(0, 2), items: [] });
    expect(changes).toEqual([]);
    expect(next.courses).toHaveLength(6);
    expect(next.items).toHaveLength(base.items.length);
  });

  it("counts a row once when the walk lists it twice", () => {
    const twice = { messages: [SAMPLE_TABLES.messages[0]!, structuredClone(SAMPLE_TABLES.messages[0]!)] };
    const { next, changes } = merge(emptyExport("sample"), twice);
    expect(next.messages).toHaveLength(1);
    expect(changes).toHaveLength(1);
  });

  it("does not call a row changed when only the order of its fields differs", () => {
    const base = sampleExport();
    const g = base.grades[0]!;
    const reordered = { check: g.check, shown: g.shown, submittedAt: g.submittedAt, status: g.status, possible: g.possible, score: g.score, title: g.title, courseId: g.courseId, id: g.id };
    expect(merge(base, { grades: [reordered] }).changes).toEqual([]);
  });

  it("keeps a saved document's place and fingerprint when a later walk only lists the file again", () => {
    const base = sampleExport();
    const f = base.files[0]!;
    f.path = "files/HAR101/HAR101 Syllabus.docx";
    f.sha256 = "ab".repeat(32);
    const listedAgain = { ...f, path: null, sha256: null };
    const { next, changes } = merge(base, { files: [listedAgain] });
    expect(changes).toEqual([]);
    expect(next.files[0]!.path).toBe("files/HAR101/HAR101 Syllabus.docx");
    expect(next.files[0]!.sha256).toBe("ab".repeat(32));
  });

  it("leaves the export it was given untouched", () => {
    const base = sampleExport();
    const before = JSON.stringify(base);
    merge(base, { grades: [{ ...base.grades[0]!, score: 1 }] });
    expect(JSON.stringify(base)).toBe(before);
  });
});
