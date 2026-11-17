// Shows an export: the made-up sample at first, or a file the visitor opens.
// A file opened here is read by this page, in this browser. The site is a folder of plain files:
// there is no server code behind it that the file could be sent to.
const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) node.append(kid);
  return node;
}

const TABS = [["grades", "Grades"], ["items", "Content"], ["files", "Documents"], ["announcements", "Announcements"], ["messages", "Messages"]];
let exp = null;
let courseId = null;
let tab = "grades";

const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");
const size = (bytes) => (bytes === null || bytes === undefined ? "" : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const mine = (rows) => rows.filter((r) => r.courseId === courseId);

function looksRight(data) {
  return data && data.version === 1 && ["courses", "items", "grades", "files", "announcements", "messages"].every((t) => Array.isArray(data[t]));
}

function show(data, whose) {
  if (!looksRight(data)) {
    $("#whose").textContent = "That file is not a Takehome export (export.json).";
    return;
  }
  exp = data;
  courseId = (exp.courses.find((c) => c.state === "open") ?? exp.courses[0])?.id ?? null;
  $("#whose").textContent = whose;
  render();
}

function gradesTable(rows) {
  const word = { match: "Equals the portal", differs: "Differs from the portal", "not on page": "Not shown on the page", unread: "Not read yet" };
  return el("div", { class: "scroll" }, el("table", {},
    el("thead", {}, el("tr", {}, el("th", {}, "Item"), el("th", { class: "n" }, "Score"), el("th", { class: "n" }, "Out of"), el("th", {}, "Status"), el("th", {}, "Check"))),
    el("tbody", {}, rows.map((g) => el("tr", {},
      el("td", {}, g.title), el("td", { class: "n" }, g.score ?? ""), el("td", { class: "n" }, g.possible ?? ""), el("td", {}, g.status),
      el("td", { class: g.check === "match" ? "check-match" : g.check === "differs" ? "check-differs" : "check-not" }, word[g.check] ?? g.check))))));
}

function tree(rows) {
  const kids = new Map();
  for (const r of rows) kids.set(r.parentId ?? "", [...(kids.get(r.parentId ?? "") ?? []), r]);
  const level = (parent) => (kids.get(parent) ?? []).map((r) => el("li", {}, el("span", { class: "kind" }, r.kind), r.title, kids.has(r.id) ? el("ul", {}, level(r.id)) : null));
  return el("ul", { class: "tree" }, level(""));
}

function panel() {
  const course = exp.courses.find((c) => c.id === courseId);
  if (!course) return el("div", { class: "inside" }, "This export has no courses.");
  const counts = Object.fromEntries(TABS.map(([t]) => [t, mine(exp[t]).length]));
  let body;
  if (course.state === "locked" && TABS.every(([t]) => counts[t] === 0)) body = el("p", {}, "The portal has locked this course. Its name and term are all it still shows, and all that could be taken home.");
  else if (tab === "grades") body = counts.grades ? gradesTable(mine(exp.grades)) : el("p", {}, "No graded work.");
  else if (tab === "items") body = counts.items ? tree(mine(exp.items)) : el("p", {}, "No content.");
  else if (tab === "files") body = counts.files ? el("div", { class: "scroll" }, el("table", {}, el("thead", {}, el("tr", {}, el("th", {}, "Document"), el("th", { class: "n" }, "Size"), el("th", {}, "Saved as"))),
    el("tbody", {}, mine(exp.files).map((f) => el("tr", {}, el("td", {}, f.name), el("td", { class: "n" }, size(f.bytes)), el("td", {}, f.path ?? "listed, not saved")))))) : el("p", {}, "No documents.");
  else if (tab === "announcements") body = counts.announcements ? el("div", {}, mine(exp.announcements).map((a) => el("div", {}, el("p", {}, el("b", {}, a.title), " ", el("span", { class: "mono" }, day(a.postedAt))), el("p", { style: "white-space:pre-wrap;margin-top:-10px" }, a.body)))) : el("p", {}, "No announcements.");
  else body = counts.messages ? el("ul", { class: "plain" }, mine(exp.messages).map((m) => el("li", {}, m.subject, " ", el("span", { class: "mono" }, day(m.sentAt))))) : el("p", {}, "No messages.");
  return el("div", { class: "inside" },
    el("h3", {}, course.title), el("p", { class: "sub" }, `${course.code} · ${course.term} · ${course.state === "locked" ? "locked by the university" : "open"}`),
    el("div", { class: "tabs" }, TABS.map(([t, name]) => el("button", { type: "button", "aria-pressed": String(tab === t), onclick: () => { tab = t; render(); } }, `${name} ${counts[t]}`))),
    body);
}

function render() {
  const root = $("#viewer");
  root.replaceChildren(
    el("div", { class: "courses" }, exp.courses.map((c) => el("button", { type: "button", class: c.state === "locked" ? "locked" : "", "aria-pressed": String(c.id === courseId), onclick: () => { courseId = c.id; render(); } }, c.title, el("small", {}, `${c.term}${c.state === "locked" ? " · locked" : ""}`)))),
    panel());
}

/** Rows of the open export that hold every word asked for: graded work, content, documents, announcements. */
function searchRows(question) {
  const words = question.toLowerCase().split(/\s+/).filter(Boolean);
  if (!exp || words.length === 0) return [];
  const course = new Map(exp.courses.map((c) => [c.id, c.title]));
  const out = [];
  const take = (tabName, kind, courseId, text) => {
    const low = text.toLowerCase();
    if (words.every((w) => low.includes(w))) out.push({ tab: tabName, kind, courseId, text, course: course.get(courseId) ?? "" });
  };
  for (const g of exp.grades) take("grades", "Graded item", g.courseId, g.title);
  for (const i of exp.items) take("items", "Content", i.courseId, i.title);
  for (const f of exp.files) take("files", "Document", f.courseId, f.name);
  for (const a of exp.announcements) take("announcements", "Announcement", a.courseId, `${a.title}. ${a.body}`);
  return out;
}

function showHits(question) {
  const hits = searchRows(question);
  $("#found").textContent = question.trim() ? `${hits.length} ${hits.length === 1 ? "row holds" : "rows hold"} those words.` : "";
  $("#hits").replaceChildren(...hits.slice(0, 12).map((h) => el("li", {},
    el("span", { class: "kind" }, h.kind),
    el("button", { type: "button", onclick: () => { courseId = h.courseId; tab = h.tab; render(); $("#viewer").scrollIntoView({ block: "nearest" }); } }, h.text.length > 110 ? `${h.text.slice(0, 110)}…` : h.text),
    el("span", { class: "mono" }, `  ${h.course}`))));
}

$("#q").addEventListener("input", (e) => showHits(e.target.value));

$("#own").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    show(JSON.parse(await file.text()), "Your own export, read in this browser only. Nothing was uploaded.");
  } catch {
    $("#whose").textContent = "That file could not be read as JSON.";
  }
});

fetch("/sample/export.json").then((r) => r.json()).then((data) => show(data, "A made-up student at a made-up university."));
