import { describe, expect, it } from "vitest";
import { sampleExport } from "../fixtures/sample.ts";
import { csvFiles, toCsv } from "../src/core/csv.ts";

describe("CSV files", () => {
  it("writes a header and one line per row, with the same columns on every line", () => {
    const csv = toCsv([{ id: "a", title: "One", score: 9 }, { id: "b", title: "Two", score: null }], ["id", "title", "score"]);
    expect(csv).toBe("id,title,score\r\na,One,9\r\nb,Two,\r\n");
  });

  it("quotes commas, quotes and line breaks so a spreadsheet reads them as one cell", () => {
    const csv = toCsv([{ id: "a", title: 'Essay: "my nearest harbour", first draft', body: "line one\nline two" }], ["id", "title", "body"]);
    expect(csv).toBe('id,title,body\r\na,"Essay: ""my nearest harbour"", first draft","line one\nline two"\r\n');
  });

  it("writes a header alone for an empty table", () => {
    expect(toCsv([], ["id", "title"])).toBe("id,title\r\n");
  });

  it("makes one file per table, each with as many lines as the table has rows", () => {
    const exp = sampleExport();
    const out = csvFiles(exp);
    expect(Object.keys(out).sort()).toEqual(["announcements.csv", "courses.csv", "files.csv", "grades.csv", "items.csv", "messages.csv"]);
    expect(out["grades.csv"]!.trimEnd().split("\r\n")).toHaveLength(exp.grades.length + 1);
    expect(out["courses.csv"]!.split("\r\n")[0]).toBe("id,code,title,term,state");
  });
});
