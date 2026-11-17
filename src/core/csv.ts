// CSV files: one per table, the same columns on every line, quoted so any spreadsheet reads them.
import { TABLES, type Table, type Tables } from "./model.ts";

export const COLUMNS: Record<Table, readonly string[]> = {
  courses: ["id", "code", "title", "term", "state"],
  items: ["id", "courseId", "parentId", "kind", "title", "dueAt"],
  grades: ["id", "courseId", "title", "score", "possible", "status", "submittedAt", "shown", "check"],
  files: ["id", "courseId", "itemId", "name", "source", "bytes", "sha256", "path"],
  announcements: ["id", "courseId", "title", "body", "postedAt"],
  messages: ["id", "courseId", "subject", "sentAt"],
};

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: readonly object[], columns: readonly string[]): string {
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell((row as Record<string, unknown>)[c])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

/** File name to file text, one CSV per table. */
export function csvFiles(tables: Tables): Record<string, string> {
  const out: Record<string, string> = {};
  for (const table of TABLES) out[`${table}.csv`] = toCsv(tables[table], COLUMNS[table]);
  return out;
}
