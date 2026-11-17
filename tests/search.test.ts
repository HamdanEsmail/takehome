import { describe, expect, it } from "vitest";
import { findInTexts } from "../src/core/search.ts";

const texts = [
  { id: "a", course: "TID201", name: "Reading a tide table.pdf", text: "A tide table lists the times of high water.\nSprings follow a full moon; neaps follow a half moon." },
  { id: "b", course: "CRT210", name: "Symbols.pdf", text: "Chart symbols for rocks, wrecks and lights." },
  { id: "c", course: "TID201", name: "Secondary ports.docx", text: "For a secondary port, apply the differences to the HIGH WATER time of its standard port." },
];

describe("searching inside the documents", () => {
  it("finds every document that holds all the words, whatever their case", () => {
    expect(findInTexts(texts, "high water").map((h) => h.id)).toEqual(["a", "c"]);
    expect(findInTexts(texts, "WRECKS").map((h) => h.id)).toEqual(["b"]);
    expect(findInTexts(texts, "water moon").map((h) => h.id)).toEqual(["a"]);
  });

  it("gives a short piece of the text around the first word found", () => {
    const [hit] = findInTexts(texts, "neaps");
    expect(hit!.snippet).toContain("neaps follow a half moon");
    expect(hit!.snippet.length).toBeLessThanOrEqual(170);
    expect(hit).toMatchObject({ course: "TID201", name: "Reading a tide table.pdf" });
  });

  it("finds nothing for words no document holds, or for an empty question", () => {
    expect(findInTexts(texts, "lighthouse")).toEqual([]);
    expect(findInTexts(texts, "   ")).toEqual([]);
  });
});
