// Searching inside the documents that were turned into text.

export interface DocText {
  id: string;
  course: string;
  name: string;
  text: string;
}

export interface Hit {
  id: string;
  course: string;
  name: string;
  /** A short piece of the text around the first word found. */
  snippet: string;
}

/** Documents that hold every word of the question, in any case and any order. */
export function findInTexts(texts: readonly DocText[], question: string): Hit[] {
  const words = question.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits: Hit[] = [];
  for (const doc of texts) {
    const low = doc.text.toLowerCase();
    if (!words.every((w) => low.includes(w))) continue;
    const at = low.indexOf(words[0]!);
    const from = Math.max(0, at - 60);
    const piece = doc.text.slice(from, from + 160).replace(/\s+/g, " ").trim();
    hits.push({ id: doc.id, course: doc.course, name: doc.name, snippet: `${from > 0 ? "…" : ""}${piece}${from + 160 < doc.text.length ? "…" : ""}` });
  }
  return hits;
}
