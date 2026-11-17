import { describe, expect, it } from "vitest";
import { sampleExport } from "../fixtures/sample.ts";
import type { Export } from "../src/core/model.ts";
import { seal } from "../src/core/seal.ts";

const SALT = "a-test-salt";

/** Every word and whole value an export holds that the public must never see. */
function secrets(exp: Export): string[] {
  const out = new Set<string>();
  const take = (v: unknown) => {
    if (typeof v !== "string" || v.length < 4) return;
    out.add(v);
    for (const w of v.split(/[^\p{L}\p{N}_]+/u)) if (w.length >= 5) out.add(w);
  };
  for (const c of exp.courses) [c.id, c.code, c.title].forEach(take);
  for (const i of exp.items) [i.id, i.title, i.dueAt].forEach(take);
  for (const g of exp.grades) [g.id, g.title, g.submittedAt].forEach(take);
  for (const f of exp.files) [f.id, f.name, f.path, f.sha256].forEach(take);
  for (const a of exp.announcements) [a.id, a.title, a.body, a.postedAt].forEach(take);
  for (const m of exp.messages) [m.id, m.subject, m.sentAt].forEach(take);
  for (const r of exp.runs) for (const id of r.tinyfishRunIds) out.add(id);
  // Words the sealed list is allowed to say: the names of terms.
  for (const allowed of ["Spring", "Summer", "Winter", "Autumn"]) out.delete(allowed);
  return [...out];
}

/** Every value the sealed list holds, without its field names (those are fixed and checked apart). */
function leaves(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => leaves(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => leaves(x, out));
  else if (v !== null && v !== undefined) out.push(String(v));
  return out;
}

function keys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keys(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); keys(x, out); }
  return out;
}

describe("the sealed list", () => {
  it("holds no title, name, code, id, date or score from the export", () => {
    const exp = sampleExport();
    const text = leaves(seal(exp, SALT)).join("\n");
    const found = secrets(exp).filter((s) => text.includes(s));
    expect(found).toEqual([]);
    for (const g of exp.grades) if (g.score !== null && !Number.isInteger(g.score)) expect(text.split("\n")).not.toContain(String(g.score));
  });

  it("has only the fields on its allow-list", () => {
    const allowed = ["version", "portal", "sealedOn", "totals", "lockers", "files", "runs", "courses", "locked", "items", "grades", "checked", "saved", "announcements", "messages", "kb",
      "locker", "term", "state", "fp", "bar", "counts", "fresh", "firstMonth", "lastMonth", "type", "day", "kind", "until", "steps", "usd", "added", "changed"];
    expect([...keys(seal(sampleExport(), SALT))].filter((k) => !allowed.includes(k))).toEqual([]);
  });

  it("gives one locker per course, numbered from 1, with the term and whether the university locked it", () => {
    const sealed = seal(sampleExport(), SALT);
    expect(sealed.lockers.map((l) => l.locker)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(sealed.lockers.map((l) => l.term)).toEqual(["Fall 2025", "Fall 2025", "Spring 2026", "Spring 2026", "Fall 2026", "Fall 2026"]);
    expect(sealed.lockers.filter((l) => l.state === "locked")).toHaveLength(1);
    expect(sealed.totals.courses).toBe(6);
    expect(sealed.totals.locked).toBe(1);
  });

  it("counts what each locker holds", () => {
    const exp = sampleExport();
    const sealed = seal(exp, SALT);
    const sum = (k: "items" | "grades" | "files" | "announcements" | "messages") => sealed.lockers.reduce((n, l) => n + l.counts[k], 0);
    expect(sum("items")).toBe(exp.items.length);
    expect(sum("grades")).toBe(exp.grades.length);
    expect(sum("files")).toBe(exp.files.length);
    expect(sum("announcements")).toBe(exp.announcements.length);
    expect(sum("messages")).toBe(exp.messages.length);
    expect(sealed.totals.grades).toBe(exp.grades.length);
  });

  it("does not number lockers in the portal's order, which would follow the course codes", () => {
    const exp = sampleExport();
    const again = seal({ ...exp, courses: [...exp.courses].reverse() }, SALT);
    expect(again.lockers.map((l) => l.fp)).toEqual(seal(exp, SALT).lockers.map((l) => l.fp));
  });

  it("draws each sealed name as a bar whose length says nothing about the real name", () => {
    const exp = sampleExport();
    const sealed = seal(exp, SALT);
    for (const l of sealed.lockers) {
      expect(l.bar.length).toBeGreaterThanOrEqual(2);
      expect(l.bar.every((n) => n >= 3 && n <= 11)).toBe(true);
    }
    const renamed = structuredClone(exp);
    renamed.courses[0]!.title = "X";
    expect(seal(renamed, SALT).lockers.map((l) => l.bar)).toEqual(sealed.lockers.map((l) => l.bar));
  });

  it("gives a different fingerprint under a different salt, so nobody can test a guess against it", () => {
    const exp = sampleExport();
    const a = seal(exp, SALT).lockers.map((l) => l.fp);
    const b = seal(exp, "another-salt").lockers.map((l) => l.fp);
    expect(a.some((fp, i) => fp === b[i])).toBe(false);
    expect(a.every((fp) => /^[0-9a-f]{8}$/.test(fp))).toBe(true);
  });

  it("lists each document by kind and rounded size only", () => {
    const exp = sampleExport();
    const sealed = seal(exp, SALT);
    expect(sealed.files).toHaveLength(exp.files.length);
    expect(new Set(sealed.files.map((f) => f.type))).toEqual(new Set(["docx", "pptx", "pdf"]));
    expect(sealed.files.every((f) => Number.isInteger(f.kb) && f.kb >= 1)).toBe(true);
    expect(Object.keys(sealed.files[0]!).sort()).toEqual(["fp", "kb", "locker", "saved", "type"]);
  });

  it("says how much the last run added to each locker, and nothing about which rows", () => {
    const exp = sampleExport();
    const fresh = [{ table: "grades" as const, id: exp.grades[0]!.id, what: "new" as const }, { table: "files" as const, id: exp.files[0]!.id, what: "new" as const }];
    const sealed = seal(exp, SALT, fresh);
    expect(sealed.lockers.reduce((n, l) => n + l.fresh, 0)).toBe(2);
    expect(seal(exp, SALT).lockers.every((l) => l.fresh === 0)).toBe(true);
  });

  it("keeps each run's cost and step count but never its TinyFish run id", () => {
    const sealed = seal(sampleExport(), SALT);
    expect(sealed.runs).toHaveLength(2);
    expect(Object.keys(sealed.runs[0]!).sort()).toEqual(["added", "changed", "day", "kind", "steps", "until", "usd"]);
    expect(sealed.runs[1]!.day).toBe("2026-11-14");
  });

  it("refuses to seal without a salt", () => {
    expect(() => seal(sampleExport(), "")).toThrow(/salt/i);
  });
});
