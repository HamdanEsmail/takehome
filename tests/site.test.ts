import { describe, expect, it } from "vitest";
import { sampleExport } from "../fixtures/sample.ts";
import { seal } from "../src/core/seal.ts";
import { buildSite } from "../src/site/build.ts";

const exp = sampleExport();
const site = buildSite(seal(exp, "a-test-salt"), exp, { codeUrl: "https://github.com/HamdanEsmail/takehome" });
const pages = Object.entries(site).filter(([path]) => path.endsWith(".html"));

/** The export's own words: titles, codes, names of documents, announcements. */
function words(): string[] {
  const out = new Set<string>();
  const take = (v: string | null) => {
    if (!v) return;
    out.add(v);
    for (const w of v.split(/[^\p{L}\p{N}_]+/u)) if (w.length >= 6) out.add(w);
  };
  for (const c of exp.courses) [c.id, c.code, c.title].forEach(take);
  for (const i of exp.items) [i.id, i.title].forEach(take);
  for (const g of exp.grades) [g.id, g.title].forEach(take);
  for (const f of exp.files) [f.id, f.name].forEach(take);
  for (const a of exp.announcements) [a.id, a.title, a.body].forEach(take);
  for (const m of exp.messages) [m.id, m.subject].forEach(take);
  // Words the site's own copy uses.
  for (const mine of ["Spring", "Summer", "Winter", "Autumn", "export", "sample", "Sample", "student", "portal", "course", "courses", "documents", "locker", "before", "against", "graded", "Graded", "messages", "Conversation", "notebook", "printed", "leaves", "Reading", "Syllabus", "Symbols"]) out.delete(mine);
  return [...out];
}

describe("the public site", () => {
  it("builds the locker row, the sample locker, how it works, privacy and a not-found page", () => {
    expect(Object.keys(site).sort()).toEqual(["404.html", "how/index.html", "index.html", "privacy/index.html", "sample/export.json", "sample/index.html", "sealed.json"]);
  });

  it("puts none of the export's own words on the pages about my courses", () => {
    for (const path of ["index.html", "how/index.html", "privacy/index.html", "404.html", "sealed.json"]) {
      const found = words().filter((w) => site[path]!.includes(w));
      expect(found, path).toEqual([]);
    }
  });

  it("shows one door per course, with a padlock on the locked one", () => {
    const home = site["index.html"]!;
    expect(home.match(/<li class="locker/g)).toHaveLength(6);
    expect(home.match(/class="padlock"/g)).toHaveLength(1);
    expect(home).toContain("Locked by the university");
    expect(home).toContain("locked 1 of my 6 courses");
  });

  it("carries my name and link in the foot of every page", () => {
    for (const [path, html] of pages) expect(html, path).toMatch(/Built by <a href="https:\/\/github\.com\/HamdanEsmail">Hamdan Esmail<\/a>/);
  });

  it("gives the sample locker the made-up export, and says it is made up", () => {
    expect(JSON.parse(site["sample/export.json"]!).courses).toHaveLength(6);
    expect(site["sample/index.html"]).toContain("A made-up student at a made-up university.");
  });

  it("escapes what it prints", () => {
    const odd = seal(exp, "a-test-salt");
    odd.lockers[0]!.term = '<script>alert("x")</script>';
    expect(buildSite(odd, exp, { codeUrl: "https://example.test" })["index.html"]).not.toContain("<script>alert");
  });
});
