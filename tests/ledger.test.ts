import { describe, expect, it } from "vitest";
import { Ledger, STEP_USD } from "../src/tinyfish/ledger.ts";
import { safeName, placeFor } from "../src/run/files.ts";

describe("the spend ledger", () => {
  it("adds up what was booked", () => {
    const ledger = new Ledger(8, [{ at: "2026-11-17T08:00:00Z", what: "first tests", usd: 0.416, runId: null }]);
    ledger.book("grades of one course", 3 * STEP_USD, "run-1", "2026-11-17T09:00:00Z");
    expect(ledger.spent()).toBeCloseTo(0.464, 6);
    expect(ledger.lines).toHaveLength(2);
  });

  it("refuses work whose worst case would pass the cap", () => {
    const ledger = new Ledger(1, [{ at: "2026-11-17T08:00:00Z", what: "earlier", usd: 0.9, runId: null }]);
    expect(ledger.room(0.05)).toBe(true);
    expect(ledger.room(0.2)).toBe(false);
    expect(() => ledger.mustHaveRoom(0.2, "twelve grade readings")).toThrow(/cap/i);
  });

  it("prices an Agent run by its steps", () => {
    expect(STEP_USD).toBe(0.016);
  });
});

describe("where a document is saved", () => {
  it("keeps a readable name and removes what a file system refuses", () => {
    expect(safeName('Week 3: "Tides" <final>?.pptx')).toBe("Week 3 Tides final.pptx");
    expect(safeName("  ..hidden  ")).toBe("hidden");
    expect(safeName("")).toBe("document");
    expect(safeName("a".repeat(200) + ".pdf")).toHaveLength(120);
    expect(safeName("a".repeat(200) + ".pdf").endsWith(".pdf")).toBe(true);
  });

  it("puts each document under its course, and never writes two documents to one place", () => {
    const used = new Set<string>();
    expect(placeFor("HAR101_1_Fall_2026", "Syllabus.docx", used)).toBe("files/HAR101_1_Fall_2026/Syllabus.docx");
    expect(placeFor("HAR101_1_Fall_2026", "Syllabus.docx", used)).toBe("files/HAR101_1_Fall_2026/Syllabus (2).docx");
    expect(placeFor("HAR101_1_Fall_2026", "syllabus.DOCX", used)).toBe("files/HAR101_1_Fall_2026/syllabus (3).DOCX");
  });
});
