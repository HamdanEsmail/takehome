// Merging one walk of the portal into the export kept from earlier runs.
// A row is known by the portal's own id. A row the walk did not find is kept: the portal locks
// old courses, and a locked course must never empty what was already taken home.
import { TABLES, type Export, type FileRef, type Table, type Tables } from "./model.ts";

export interface Change {
  table: Table;
  id: string;
  what: "new" | "changed";
}

type Row = { id: string };

/** A row as text with its fields in a fixed order, so the order a walk happens to use is not a change. */
const asText = (row: object) => JSON.stringify(Object.entries(row).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** A later walk only lists a document again; what an earlier run saved of it is kept. */
function carry(table: Table, old: Row, row: Row): Row {
  if (table !== "files") return row;
  const was = old as FileRef;
  const now = row as FileRef;
  const kept: FileRef = { ...now, bytes: now.bytes ?? was.bytes, sha256: now.sha256 ?? was.sha256, path: now.path ?? was.path };
  return kept;
}

export function merge(base: Export, found: Partial<Tables>): { next: Export; changes: Change[] } {
  const next = structuredClone(base);
  const changes: Change[] = [];
  for (const table of TABLES) {
    const rows = found[table] as Row[] | undefined;
    if (!rows) continue;
    const list = next[table] as Row[];
    const place = new Map(list.map((r, i) => [r.id, i]));
    const seen = new Set<string>();
    for (const raw of rows) {
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      const at = place.get(raw.id);
      if (at === undefined) {
        place.set(raw.id, list.length);
        list.push(structuredClone(raw));
        changes.push({ table, id: raw.id, what: "new" });
        continue;
      }
      const row = carry(table, list[at]!, structuredClone(raw));
      if (asText(list[at]!) !== asText(row)) {
        list[at] = row;
        changes.push({ table, id: raw.id, what: "changed" });
      }
    }
  }
  return { next, changes };
}
