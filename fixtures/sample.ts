// A made-up student's export. Nothing here is real: the university, the courses, the scores and the
// documents are invented. The tests use it, and the public site's sample locker shows it.
import type { Announcement, Course, Export, FileRef, Grade, Item, Message, Tables } from "../src/core/model.ts";

const course = (id: string, code: string, title: string, term: string, state: Course["state"] = "open"): Course => ({ id, code, title, term, state });

export const SAMPLE_COURSES: Course[] = [
  course("_9001_1", "HAR101", "Introduction to Harbour Studies (02)", "Fall 2025"),
  course("_9002_1", "LMP110", "Lighthouse Keeping I (01)", "Fall 2025", "locked"),
  course("_9003_1", "TID201", "Tides and Tide Tables (04)", "Spring 2026"),
  course("_9004_1", "KNT120", "Practical Knots (01)", "Spring 2026"),
  course("_9005_1", "CRT210", "Reading Sea Charts (03)", "Fall 2026"),
  course("_9006_1", "WTH230", "Weather for Small Boats (01)", "Fall 2026"),
];

const items: Item[] = [];
const grades: Grade[] = [];
const files: FileRef[] = [];
const announcements: Announcement[] = [];
const messages: Message[] = [];

let n = 0;
const next = (prefix: string) => `_${prefix}${String(++n).padStart(4, "0")}_1`;

function week(courseId: string, label: string, docs: Array<[name: string, bytes: number]>, work?: [title: string, kind: "assignment" | "test", due: string, score: number | null, possible: number]) {
  const folder: Item = { id: next("7"), courseId, parentId: null, kind: "folder", title: label, dueAt: null };
  items.push(folder);
  for (const [name, bytes] of docs) {
    const item: Item = { id: next("7"), courseId, parentId: folder.id, kind: "document", title: name, dueAt: null };
    items.push(item);
    files.push({ id: next("8"), courseId, itemId: item.id, name, bytes, sha256: null, path: null });
  }
  if (work) {
    const [title, kind, due, score, possible] = work;
    items.push({ id: next("7"), courseId, parentId: folder.id, kind, title, dueAt: due });
    grades.push({ id: next("6"), courseId, title, score, possible, status: score === null ? "Submitted" : "Graded", submittedAt: due, shown: score === null ? "-" : String(score), check: score === null ? "not on page" : "match" });
  }
}

week("_9001_1", "Week 1", [["HAR101 Syllabus.docx", 48_211], ["What is a harbour.pptx", 2_310_442]], ["Quiz 1 on breakwaters", "test", "2025-09-18T19:59:00Z", 9, 10]);
week("_9001_1", "Week 2", [["Dredging basics.pptx", 1_804_120]], ["Essay: my nearest harbour", "assignment", "2025-10-02T19:59:00Z", 17.5, 20]);
week("_9001_1", "Week 3", [["Harbour plans, worked example.pdf", 620_300]], ["Midterm", "test", "2025-10-30T19:59:00Z", 41, 50]);
week("_9003_1", "Week 1", [["TID201 Syllabus.docx", 51_900], ["Springs and neaps.pptx", 3_220_018]], ["Problem set 1", "assignment", "2026-02-05T19:59:00Z", 8, 10]);
week("_9003_1", "Week 2", [["Reading a tide table.pdf", 410_776]], ["Problem set 2", "assignment", "2026-02-19T19:59:00Z", 10, 10]);
week("_9003_1", "Week 3", [["Secondary ports.pptx", 2_950_400]], ["Quiz on secondary ports", "test", "2026-03-05T19:59:00Z", 4.5, 5]);
week("_9004_1", "Week 1", [["KNT120 Syllabus.docx", 44_020]], ["Bowline, filmed", "assignment", "2026-02-10T19:59:00Z", 5, 5]);
week("_9004_1", "Week 2", [["Hitches and bends.pdf", 1_120_556]], ["Knot board", "assignment", "2026-03-12T19:59:00Z", 28, 30]);
week("_9005_1", "Week 1", [["CRT210 Syllabus.docx", 47_388], ["Symbols and abbreviations.pdf", 2_044_190]], ["Chart symbols quiz", "test", "2026-09-17T19:59:00Z", 14, 15]);
week("_9005_1", "Week 2", [["Plotting a position.pptx", 4_002_771]], ["Plotting exercise", "assignment", "2026-10-01T19:59:00Z", 18, 20]);
week("_9005_1", "Week 3", [["Leading lines.pptx", 1_660_032]], ["Passage plan, first draft", "assignment", "2026-11-12T19:59:00Z", null, 25]);
week("_9006_1", "Week 1", [["WTH230 Syllabus.docx", 45_871]], ["Cloud diary", "assignment", "2026-09-24T19:59:00Z", 9, 10]);
week("_9006_1", "Week 2", [["Reading a synoptic chart.pdf", 880_412]], ["Forecast for Saturday", "assignment", "2026-11-05T19:59:00Z", 13, 15]);

announcements.push(
  { id: next("5"), courseId: "_9001_1", title: "Harbour visit moved to Thursday", body: "The bus leaves the main gate at 8:00. Bring a notebook.", postedAt: "2025-09-21T06:00:00Z" },
  { id: next("5"), courseId: "_9003_1", title: "Tide tables for the exam", body: "You may bring one printed tide table. No phones.", postedAt: "2026-03-01T06:00:00Z" },
  { id: next("5"), courseId: "_9005_1", title: "Chart room open late", body: "The chart room stays open until 21:00 this week.", postedAt: "2026-10-12T06:00:00Z" },
);
messages.push(
  { id: next("4"), courseId: "_9005_1", subject: "Passage plan groups", sentAt: "2026-10-20T09:12:00Z" },
  { id: next("4"), courseId: "_9006_1", subject: "Barometer readings due", sentAt: "2026-11-02T07:40:00Z" },
);

export const SAMPLE_TABLES: Tables = { courses: SAMPLE_COURSES, items, grades, files, announcements, messages };

export function sampleExport(): Export {
  return structuredClone({
    version: 1 as const,
    portal: "Example University student portal (sample)",
    exportedAt: "2026-11-14T10:00:00Z",
    ...SAMPLE_TABLES,
    runs: [
      { id: "run-1", at: "2026-11-01T10:00:00Z", kind: "export" as const, until: "2026-10-31", steps: 96, usd: 1.54, added: 58, changed: 0, tinyfishRunIds: ["sample-run-a"] },
      { id: "run-2", at: "2026-11-14T10:00:00Z", kind: "rerun" as const, until: null, steps: 22, usd: 0.35, added: 6, changed: 1, tinyfishRunIds: ["sample-run-b"] },
    ],
  });
}
