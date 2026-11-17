import { describe, expect, it } from "vitest";
import { applyReading, gradeNumber, sameGrades } from "../src/core/match.ts";
import type { Grade } from "../src/core/model.ts";

const grade = (id: string, title: string, score: number | null, possible = 10): Grade => ({ id, courseId: "_9_1", title, score, possible, status: score === null ? "No grade yet" : "Graded", submittedAt: null, shown: null, check: "unread" });
const feed = () => [grade("a", "Quiz 1 on breakwaters", 9), grade("b", "Essay: my nearest harbour", 17.5, 20), grade("c", "Midterm", 41, 50), grade("d", "Final project", null, 40), grade("e", "Weighted total", 82.4567, 100)];

describe("checking the Agent's reading of a Grades page against the portal", () => {
  it("marks each row the Agent read with the grade as shown and whether it equals the portal's", () => {
    const { grades, reading } = applyReading(feed(), [
      { title: "Quiz 1 on breakwaters", grade: "9", possible: "10" },
      { title: "Essay: my nearest harbour", grade: "17.5", possible: "20" },
      { title: "Midterm", grade: "41 / 50" },
      { title: "Final project", grade: "Not graded" },
    ]);
    expect(grades.map((g) => g.check)).toEqual(["match", "match", "match", "match", "not on page"]);
    expect(grades.map((g) => g.shown)).toEqual(["9", "17.5", "41 / 50", "Not graded", null]);
    expect(reading).toEqual({ agentRows: 4, matched: 4, equal: 4, differs: 0, pageOnly: 0, notOnPage: 1, trusted: true });
  });

  it("refuses a reading whose rows are not the portal's, and leaves every grade unread", () => {
    const invented = ["Home Page", "Course Document", "Discussions", "Groups", "Tools", "Help"].map((t) => ({ title: `Harbour Studies (02) - ${t}`, grade: "88.50", possible: "100" }));
    const { grades, reading } = applyReading(feed(), invented);
    expect(reading.trusted).toBe(false);
    expect(reading.matched).toBe(0);
    expect(grades.every((g) => g.check === "unread" && g.shown === null)).toBe(true);
  });

  it("flags a score the page shows differently", () => {
    const { grades, reading } = applyReading(feed(), [{ title: "Quiz 1 on breakwaters", grade: "8" }, { title: "Midterm", grade: "41" }, { title: "Essay: my nearest harbour", grade: "17.5" }]);
    expect(grades[0]!.check).toBe("differs");
    expect(reading).toMatchObject({ equal: 2, differs: 1, trusted: true });
  });

  it("compares at the precision the page shows", () => {
    const { grades } = applyReading(feed(), [{ title: "Weighted total", grade: "82.46" }, { title: "Midterm", grade: "41.00" }, { title: "Quiz 1 on breakwaters", grade: "9" }]);
    expect(grades[4]!.check).toBe("match");
    expect(grades[2]!.check).toBe("match");
  });

  it("matches a title the page cut short or decorated", () => {
    const { reading } = applyReading(feed(), [{ title: "Essay: my nearest har…", grade: "17.5" }, { title: "Midterm (Late)", grade: "41" }, { title: "quiz 1 on breakwaters", grade: "9" }]);
    expect(reading.matched).toBe(3);
  });

  it("pairs repeated titles in the order they appear", () => {
    const twins = [grade("a", "Lab report", 7), grade("b", "Lab report", 9)];
    const { grades } = applyReading(twins, [{ title: "Lab report", grade: "7" }, { title: "Lab report", grade: "9" }]);
    expect(grades.map((g) => g.check)).toEqual(["match", "match"]);
  });

  it("counts rows the page shows that the portal's list does not hold", () => {
    const { reading } = applyReading(feed(), [{ title: "Quiz 1 on breakwaters", grade: "9" }, { title: "Midterm", grade: "41" }, { title: "Attendance", grade: "-" }]);
    expect(reading).toMatchObject({ agentRows: 3, matched: 2, pageOnly: 1, trusted: true });
  });

  it("trusts an empty reading only for a course with no grades", () => {
    expect(applyReading([], []).reading.trusted).toBe(true);
    expect(applyReading(feed(), []).reading.trusted).toBe(false);
  });

  it("reads the number out of a grade as shown", () => {
    expect(["14", "4.5", "41 / 50", "1,581.25", "--", "-", "Not graded", "", "A-"].map(gradeNumber)).toEqual([14, 4.5, 41, 1581.25, null, null, null, null, null]);
  });
});

describe("deciding whether the Agent must read a course again", () => {
  const read = () => applyReading(feed(), [{ title: "Quiz 1 on breakwaters", grade: "9" }, { title: "Essay: my nearest harbour", grade: "17.5" }, { title: "Midterm", grade: "41" }, { title: "Final project", grade: "-" }, { title: "Weighted total", grade: "82.46" }]).grades;

  it("says no when the portal's graded work is what the export already holds", () => {
    expect(sameGrades(read(), feed())).toBe(true);
    expect(sameGrades(read(), [...feed()].reverse())).toBe(true);
  });

  it("says yes when a score, a status or a row is new", () => {
    const scored = feed();
    scored[3] = { ...scored[3]!, score: 38, status: "Graded" };
    expect(sameGrades(read(), scored)).toBe(false);
    expect(sameGrades(read(), [...feed(), grade("f", "Quiz 2", 8)])).toBe(false);
    expect(sameGrades(read(), feed().slice(1))).toBe(false);
  });

  it("says yes while any row is still unread", () => {
    expect(sameGrades(feed(), feed())).toBe(false);
  });

  it("says no for a course with no graded work at all", () => {
    expect(sameGrades([], [])).toBe(true);
  });
});
