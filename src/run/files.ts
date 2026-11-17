// Where a downloaded document goes inside the export folder.

/** A file name any file system takes: readable, no reserved characters, at most 120 characters. */
export function safeName(name: string): string {
  let clean = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/^[. ]+|[. ]+$/g, "");
  clean = clean.replace(/ +(\.[A-Za-z0-9]{1,8})$/, "$1");
  if (!clean) return "document";
  if (clean.length <= 120) return clean;
  const ext = /\.[A-Za-z0-9]{1,8}$/.exec(clean)?.[0] ?? "";
  return clean.slice(0, 120 - ext.length) + ext;
}

/** The place for a document under its course. `used` remembers places already taken, without regard to case. */
export function placeFor(courseCode: string, name: string, used: Set<string>): string {
  const folder = `files/${safeName(courseCode)}`;
  const file = safeName(name);
  const dot = file.lastIndexOf(".");
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : "";
  for (let n = 1; ; n++) {
    const place = `${folder}/${n === 1 ? file : `${stem} (${n})${ext}`}`;
    if (!used.has(place.toLowerCase())) {
      used.add(place.toLowerCase());
      return place;
    }
  }
}
