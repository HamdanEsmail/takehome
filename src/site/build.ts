// Builds the public site: a folder of plain files. The pages about my own courses are made from the
// sealed list and a few counts, and nothing else, so no real title, name or score can reach them.
// The sample locker shows a made-up student's export.
import type { Export } from "../core/model.ts";
import type { Sealed, SealedLocker } from "../core/seal.ts";

export interface SiteOptions {
  codeUrl: string;
}

/** Counts that are not in the sealed list but are safe to publish. */
export interface SiteFacts {
  equal: number;
  differs: number;
  notOnPage: number;
  asText: number;
  leftOut: number;
  spentUsd: number;
}

const esc = (text: unknown) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const mb = (kb: number) => (kb >= 1024 ? `${(kb / 1024).toFixed(kb >= 10240 ? 0 : 1)} MB` : `${kb} KB`);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (m: string | null) => (m ? `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : "");
const dayText = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "");
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const num = (n: number) => n.toLocaleString("en-US");
const two = (n: number) => String(n).padStart(2, "0");
/** A part of a total, named in the singular when there is one. */
const part = (n: number, one: string, many: string, note?: string) => ({ name: n === 1 ? one : many, n, note });
const KIND: Record<string, string> = { pdf: "PDF", docx: "Word", doc: "Word", pptx: "PowerPoint", ppt: "PowerPoint", ppsx: "PowerPoint", xlsx: "Excel", xls: "Excel", csv: "CSV", mp4: "Video", png: "Picture", jpg: "Picture", jpeg: "Picture", zip: "Zip", txt: "Text", ipynb: "Notebook", other: "Other" };

function page(title: string, path: string, description: string, body: string, opt: SiteOptions, script = ""): string {
  const nav = [["/", "Locker row"], ["/sample/", "Sample locker"], ["/how/", "How it works"], ["/privacy/", "Privacy"]]
    .map(([href, name]) => `<a href="${href}"${href === path ? ' aria-current="page"' : ""}>${name}</a>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="Hamdan Esmail">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@600;700&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<div class="wrap"><header class="top"><a class="mark" href="/"><i></i>Takehome</a><nav aria-label="Pages">${nav}<a href="${esc(opt.codeUrl)}">Code</a></nav></header></div>
${body}
<footer><div class="wrap"><span>Built by <a href="https://github.com/HamdanEsmail">Hamdan Esmail</a> for the TinyFish Student Bounty, Drop 002.</span><nav aria-label="More"><a href="${esc(opt.codeUrl)}">Source code</a><a href="/how/">How it works</a><a href="/privacy/">Privacy</a><a href="/sealed.json">The sealed list</a></nav></div></footer>
${script}
</body>
</html>
`;
}

/** Documents of one locker (or of all), counted by kind, largest count first. */
function byKind(files: Sealed["files"]): Array<{ kind: string; n: number; kb: number }> {
  const out = new Map<string, { kind: string; n: number; kb: number }>();
  for (const f of files) {
    const kind = KIND[f.type] ?? "Other";
    const row = out.get(kind) ?? { kind, n: 0, kb: 0 };
    row.n++;
    row.kb += f.kb;
    out.set(kind, row);
  }
  return [...out.values()].sort((a, b) => b.n - a.n);
}

/** A row of proportional blocks with a legend: how a total splits into parts. */
function split(parts: Array<{ name: string; n: number; note?: string }>): string {
  const total = parts.reduce((n, p) => n + p.n, 0) || 1;
  const shown = parts.filter((p) => p.n > 0);
  return `<div class="split" role="img" aria-label="${esc(shown.map((p) => `${p.name} ${p.n}`).join(", "))}">${shown.map((p, i) => `<i class="s${i % 5}" style="flex:${Math.max(p.n / total, 0.02).toFixed(4)}"></i>`).join("")}</div>
<ul class="legend">${shown.map((p, i) => `<li><i class="s${i % 5}"></i><b>${num(p.n)}</b> ${esc(p.name)}${p.note ? ` <span>${esc(p.note)}</span>` : ""}</li>`).join("")}</ul>`;
}

function locker(l: SealedLocker): string {
  const tag = l.state === "locked" ? "Locked by the university" : l.fresh > 0 ? `<span class="new"><b>+${l.fresh}</b> new</span>` : l.firstMonth ? `${month(l.firstMonth)}${l.lastMonth && l.lastMonth !== l.firstMonth ? ` to ${month(l.lastMonth)}` : ""}` : "";
  const rows = l.state === "locked" && l.counts.items + l.counts.grades + l.counts.files === 0
    ? `<dt>Out of reach</dt><dd></dd>`
    : `<dt>Graded</dt><dd>${l.counts.grades}</dd><dt>Checked</dt><dd>${l.counts.checked}</dd><dt>Items</dt><dd>${l.counts.items}</dd><dt>Files</dt><dd>${l.counts.files}</dd><dt>Saved</dt><dd>${l.saved}</dd>`;
  return `<li><a class="locker${l.state === "locked" ? " locked" : ""}" href="#locker-${two(l.locker)}" aria-label="Locker ${l.locker}, ${esc(l.term)}, ${l.state === "locked" ? "locked by the university" : "open"}: see what is inside, in counts"><div class="vents" aria-hidden="true"><i></i><i></i><i></i></div><span class="plate">${two(l.locker)}</span>
<div class="label"><div class="bar" role="img" aria-label="Course name, sealed">${l.bar.map((n) => `<i style="width:${n * 6}px"></i>`).join("")}</div><dl>${rows}</dl></div>
<p class="tag">${tag}</p>${l.state === "locked" ? '<span class="padlock" aria-hidden="true"></span>' : ""}</a></li>`;
}

/** What one locker holds, in counts: shown when its door is chosen. */
function detail(l: SealedLocker, s: Sealed): string {
  const files = s.files.filter((f) => f.locker === l.locker);
  const head = `<h3><span class="plate">${two(l.locker)}</span> ${esc(l.term)} · ${l.state === "locked" ? "locked by the university" : "open"}</h3>`;
  if (l.state === "locked" && l.counts.items + l.counts.grades + files.length === 0) {
    return `<article class="detail" id="locker-${two(l.locker)}">${head}<p>The portal still lists this course, with its name and its term, and nothing else. Its content and my graded work in it are out of reach, so nothing could be taken home.</p><p><a href="#row">Back to the row</a></p></article>`;
  }
  const c = l.counts;
  return `<article class="detail" id="locker-${two(l.locker)}">${head}
<div class="two"><div><h4>Rows taken home</h4>${split([part(c.items, "content item", "content items"), part(c.grades, "graded item", "graded items", `${c.checked} read by the Agent and equal to the portal`), part(c.files, "document", "documents", `${l.saved} saved, ${mb(l.kb)}`), part(c.announcements, "announcement", "announcements"), part(c.messages, "conversation", "conversations")])}</div>
<div><h4>Documents by kind</h4>${files.length ? split(byKind(files).map((k) => ({ name: k.kind, n: k.n, note: k.kb > 0 ? mb(k.kb) : undefined }))) : "<p>No documents in this course.</p>"}</div></div>
<p class="fine">${l.firstMonth ? `Active from ${month(l.firstMonth)} to ${month(l.lastMonth)}. ` : ""}${l.fresh > 0 ? `The last run added or changed ${plural(l.fresh, "row")} here. ` : ""}Fingerprint <code>${l.fp}</code>: I can match it to the course, nobody else can. To see an open locker, <a href="/sample/">open the sample</a>. <a href="#row">Back to the row</a></p></article>`;
}

function home(s: Sealed, f: SiteFacts, opt: SiteOptions): string {
  const t = s.totals;
  const terms = [...new Set(s.lockers.map((l) => l.term))];
  const row = terms.map((term) => `<div class="term"><h3>${esc(term)}</h3><ul class="lockers">${s.lockers.filter((l) => l.term === term).map(locker).join("")}</ul></div>`).join("");
  const runs = s.runs.map((r, i) => `<tr><td>${i + 1}</td><td>${dayText(r.day)}</td><td>${r.kind === "export" ? "First export" : "Rerun"}${r.until ? `, up to ${dayText(r.until)}` : ", everything"}</td><td class="n">${num(r.added)}</td><td class="n">${r.changed}</td><td class="n">${r.steps}</td><td class="n">$${r.usd.toFixed(2)}</td></tr>`).join("");
  const rowsHome = t.courses + t.items + t.grades + t.files + t.announcements + t.messages;
  const body = `<main>
<div class="wrap"><section class="hero">
<h1 style="max-width:17ch">Empty your locker before it locks.</h1>
<p>My university's Blackboard has no export button, and it has already locked ${t.locked} of my ${t.courses} courses. Takehome sends a TinyFish Agent through the portal on my own saved sign-in and brings everything home: one clean JSON file, CSV files and the documents. Run it again and it takes only what is new.</p>
<div class="acts"><a class="btn" href="/sample/">Open the sample locker</a><a class="btn quiet" href="/how/">How it works</a></div>
<div class="figs"><div><b>${t.courses}</b><span>courses over ${plural(terms.length, "term")}</span></div><div><b>${t.locked}</b><span>already locked by the university</span></div><div><b>${num(rowsHome)}</b><span>rows taken home, ${t.grades} of them graded work</span></div><div><b>${num(t.saved)}</b><span>documents saved (${mb(t.kb)}), ${num(f.asText)} searchable</span></div></div>
</section></div>
<section class="band" id="row"><div class="wrap">
<h2>My locker row</h2>
<p class="lead">These are my real courses, sealed. Each door says what is behind it in counts only: choose one to see more. This page holds no course name, no score and no document name. Its source shows bars and numbers, because that is all it was given.</p>
${row}
<div class="details">${s.lockers.map((l) => detail(l, s)).join("")}</div>
</div></section>
<section><div class="wrap">
<h2>What came home</h2>
<p class="lead">Everything is in one JSON file and six CSV files, with the documents beside them. Each row keeps the portal's own id.</p>
<div class="two"><div><h4>${num(rowsHome)} rows</h4>${split([part(t.items, "content item", "content items"), part(t.grades, "graded item", "graded items"), part(t.files, "document listed", "documents listed"), part(t.announcements, "announcement", "announcements"), part(t.messages, "conversation", "conversations"), part(t.courses, "course", "courses")])}</div>
<div><h4>${num(t.files)} documents</h4>${split(byKind(s.files).map((k) => ({ name: k.kind, n: k.n, note: k.kb > 0 ? mb(k.kb) : undefined })))}<p class="fine">${num(t.saved)} saved byte for byte, each with its SHA-256. ${num(f.asText)} PDFs and Word files were turned into text, so the export can be searched. ${f.leftOut ? `${num(f.leftOut)} were left out with a reason, mostly videos over 25 MB.` : ""}</p></div></div>
</div></section>
<section class="band"><div class="wrap">
<h2>How it gets out</h2>
<ol class="strip">
<li><b>I sign in once, by hand.</b> TinyFish keeps the session as a saved sign-in. No password is in the code.</li>
<li><b>The Agent reads each Grades page.</b> One TinyFish Agent run per course, read-only, about three steps.</li>
<li><b>Every reading is checked.</b> Its rows must be the portal's own, and each score must equal the portal's.</li>
<li><b>A rerun takes only what is new.</b> The Agent goes back only where graded work changed.</li>
</ol>
<div class="acts" style="margin-top:22px"><a class="btn quiet" href="/how/">The whole method</a></div>
</div></section>
<section><div class="wrap two">
<div><h2>Every run</h2><p class="lead">Steps are the Agent's; each costs 1.6 cents. Everything else a run does is free.</p>
<div class="scroll"><table><thead><tr><th>Run</th><th>Day</th><th>What</th><th class="n">New</th><th class="n">Changed</th><th class="n">Steps</th><th class="n">Cost</th></tr></thead><tbody>${runs || '<tr><td colspan="7">No run yet.</td></tr>'}</tbody></table></div>
<p class="fine">Spent in all, tests included: $${f.spentUsd.toFixed(2)}.</p></div>
<div><h2>Checked, not trusted</h2><p class="lead">The Agent reads each course's Grades page as I see it. Every row it returns is compared with what the portal itself reports.</p>
<ul class="checks"><li><b>${f.equal}</b> scores the Agent read equal the portal's own</li><li><b>${f.differs}</b> ${f.differs === 1 ? "differs, and is" : "differ, and are"} flagged in the export, not hidden</li><li><b>${f.notOnPage}</b> rows the portal holds that the Grades page does not show me</li></ul>
<p class="note">On the first day one run finished "completed" and handed back twelve rows that were on no page. The check refused all twelve. <a href="/how/">How the check works</a></p></div>
</div></section>
<section class="band"><div class="wrap">
<h2>See inside one</h2>
<p class="lead">My lockers stay shut. The sample locker holds a made-up student's export, so you can use the same viewer I use on mine, and search it. You can also open your own export in it: the file is read in your browser and goes nowhere.</p>
<div class="acts"><a class="btn" href="/sample/">Open the sample locker</a><a class="btn quiet" href="${esc(opt.codeUrl)}">Run it on your own portal</a></div>
</div></section>
</main>`;
  return page("Takehome: empty your locker before it locks", "/", `A TinyFish Agent walks a student portal that has no export button and brings home ${t.courses} courses, ${t.grades} graded items and ${t.files} documents as clean JSON and CSV. Reruns take only what is new.`, body, opt);
}

function how(s: Sealed, f: SiteFacts, opt: SiteOptions): string {
  const t = s.totals;
  const steps = s.runs.reduce((n, r) => n + r.steps, 0);
  const body = `<main><div class="wrap"><section class="hero" style="padding-bottom:10px"><h1 style="max-width:16ch">How it gets everything out.</h1>
<p>The portal is UAEU's Blackboard, on my own student account. Nothing below needs my password: I sign in once by hand, inside TinyFish, and the tool works from that saved sign-in.</p></section>
<section style="padding-top:20px"><ol class="steps">
<li><div><h3>I sign in once, by hand</h3><p>TinyFish opens a browser, I sign in to Blackboard in it myself, and TinyFish keeps that session as a Browser Context Profile. No password is in the code, in the settings or in any Agent goal.</p></div></li>
<li><div><h3>The portal says what it holds</h3><p>Through that same signed-in TinyFish browser, Takehome reads the data Blackboard's own pages load for themselves: every course and term, the content of each course, the graded work, the announcements. It only ever asks to read.</p></div></li>
<li><div><h3>The TinyFish Agent reads each Grades page</h3><p>One Agent run per course, on the saved sign-in, returns every row exactly as the page shows it. A Grades page takes the Agent about three steps. A second kind of run reads the overview of all my courses, locked ones included.</p></div></li>
<li><div><h3>Every reading is checked</h3><p>The Agent's rows must be the portal's own rows, and each score must equal the portal's at the precision the page shows. A reading that fails is read once more, and if it fails again its rows stay marked "not read". Nothing is filled in.</p></div></li>
<li><div><h3>Only what changed is read again</h3><p>Content, announcements and documents come from the portal's own data on every run, which costs nothing. The Agent is sent only to courses whose graded work is not what the export already holds. Rows are merged by the portal's own ids, so none is taken twice.</p></div></li>
<li><div><h3>The documents come home whole</h3><p>The signed-in browser asks the portal where each document is; the portal answers with a link that works for a short time, and the bytes are saved with their SHA-256. Files over 25 MB are listed, not fetched.</p></div></li>
<li><div><h3>The documents become searchable</h3><p>TinyFish Fetch reads the same short-lived link and returns the text of each PDF and Word file. One command then looks inside all of them.</p></div></li>
</ol></section></div>
<section class="band"><div class="wrap two">
<div><h2>Where TinyFish is used</h2><div class="scroll"><table><thead><tr><th>TinyFish</th><th>What it does here</th></tr></thead><tbody>
<tr><td>Agent</td><td>Reads the Grades overview and each course's Grades page on the saved sign-in, against a fixed answer shape</td></tr>
<tr><td>Fetch</td><td>Turns each PDF and Word file into text, so the export can be searched</td></tr>
<tr><td>Browser Context Profile</td><td>Holds the sign-in I made by hand. Its browser reads what the portal itself reports, for the check, and asks where each document is</td></tr>
<tr><td>Runs</td><td>Follows every Agent run to its end and records its steps and its cost</td></tr>
</tbody></table></div>
<p class="lead" style="margin-top:14px">So far: ${plural(steps, "Agent step")} in the runs listed on the first page, $${f.spentUsd.toFixed(2)} spent in all with the first tests, for ${t.grades} graded items in ${t.courses - t.locked} open courses.</p></div>
<div><h2>What it will not do</h2><ul class="plain">
<li>Change anything. Every Agent goal forbids Submit, Start, Begin, Send, Save, Delete and Mark.</li>
<li>Open a test I have not taken. Only the Grades page is read.</li>
<li>Take other students' work or names. A conversation is kept as a date and a size.</li>
<li>Go faster than a person. One or two pages at a time, never a burst.</li>
<li>Get past a sign-in page. If the saved sign-in has ended it stops and asks me to sign in again.</li>
<li>Pass its spending cap. Every run is booked in a ledger before the next one starts.</li>
</ul></div>
</div></section>
<section><div class="wrap"><h2>What comes home</h2>
<pre>takehome-data/
  export.json          everything, one file: courses, items, grades, files, announcements, messages, runs
  csv/                 one CSV per table, the same columns on every line
  files/&lt;course&gt;/      the documents themselves
  text/&lt;course&gt;/       PDFs and Word files as text
  changes/run-2.json   what each run added or changed
  manifest.json        counts and checks per course, every run, every dollar
  sealed.json          the only file that is ever published</pre>
<p class="lead">Every row keeps the portal's own id. A grade row also says how it was checked: equal to the portal, different, not shown on the page, or not read yet.</p></div></section></main>`;
  return page("How Takehome works", "/how/", "How a TinyFish Agent, a saved sign-in and a check against the portal's own data turn a student portal into a clean export.", body, opt);
}

function privacy(opt: SiteOptions): string {
  const body = `<main><div class="wrap"><section class="hero" style="padding-bottom:10px"><h1 style="max-width:15ch">What leaves my computer.</h1>
<p>One file: the sealed list, and a handful of totals. The list is built from an allow-list, so a field that is not named there cannot be published by mistake.</p></section>
<section style="padding-top:20px"><div class="two">
<div><h2>In the sealed list</h2><ul class="plain">
<li>How many courses, and how many the university has locked</li>
<li>For each course: its term, counts of items, graded work, documents and announcements, the total size, the first and last month</li>
<li>For each document: its kind (pdf, docx, pptx), its size in KB, whether it was saved</li>
<li>For each run: the day, the Agent's steps, the cost, how many rows were new</li>
<li>A fingerprint per course and per document, made with a secret salt that never leaves my computer</li>
</ul></div>
<div><h2>Never in it</h2><ul class="plain">
<li>A course name or code, a document name, an announcement</li>
<li>A score, a grade or any feedback</li>
<li>A person's name: mine, a teacher's or a classmate's</li>
<li>The portal's ids, and TinyFish's run ids</li>
<li>The length of a name: the bars on each door take their length from the fingerprint, because a real length could give a course away to anyone holding the catalogue</li>
</ul></div></div>
<p class="note" style="margin-top:26px">A test builds the sealed list and this site from an export and fails if any word of that export appears in them. You can read the list this site was built from: <a href="/sealed.json">sealed.json</a>.</p>
</section></div>
<section class="band"><div class="wrap two">
<div><h2>My sign-in</h2><ul class="plain">
<li>I type my password once, into Blackboard's own page, inside a TinyFish browser. It is never in this code, in a settings file or in an Agent goal.</li>
<li>The session's cookies stay in TinyFish's browser. They are not copied to my computer.</li>
<li>I do not use the password vault: it would store my university password with a third party.</li>
<li>When I am done I delete the profile on TinyFish, and the saved session is gone.</li>
</ul></div>
<div><h2>Other people, and TinyFish</h2><ul class="plain">
<li>Only my own account, and only reading.</li>
<li>Classmates' names and posts are not exported. A conversation is kept as its date and its number of messages.</li>
<li>TinyFish sees what its Agent and its browser see, and Fetch reads each PDF and Word file to return its text. That is the service doing its work; nothing goes anywhere else.</li>
<li>TinyFish's run pages hold real pictures of my portal, so their links go to the judges only.</li>
</ul></div>
</div></section></main>`;
  return page("Takehome: privacy", "/privacy/", "What Takehome publishes about a student's portal (counts only) and what it never does.", body, opt);
}

function sample(opt: SiteOptions): string {
  const body = `<main><div class="wrap"><section class="hero" style="padding-bottom:6px"><h1 style="max-width:14ch">The sample locker.</h1>
<p id="whose">A made-up student at a made-up university.</p></section>
<section style="padding-top:14px">
<div class="drop"><p><b>Open your own export.</b> Choose the <span class="mono">export.json</span> that Takehome wrote for you. It is read by this page in your browser; this site has no server to send it to.</p><input id="own" type="file" accept="application/json,.json" aria-label="Open your own export.json"></div>
<div class="find"><label for="q">Search this export</label><input id="q" type="search" placeholder="Try: tide, syllabus, quiz" autocomplete="off"><p id="found" class="fine" aria-live="polite"></p></div>
<ul id="hits" class="hits"></ul>
<div id="viewer" class="viewer"></div>
<noscript><p class="note">The viewer needs JavaScript. Without it, <a href="/sample/export.json">the sample export</a> is still there to read.</p></noscript>
<p class="fine" style="margin-top:18px">The sample as files: <a href="/sample/export.json">export.json</a></p>
</section></div></main>`;
  return page("Takehome: the sample locker", "/sample/", "A made-up student's export in the Takehome viewer. Open your own export in the same viewer, in your browser only.", body, opt, '<script src="/assets/viewer.js" defer></script>');
}

function notFound(opt: SiteOptions): string {
  return page("Takehome: nothing behind this door", "/404", "This address leads nowhere.", `<main><div class="wrap"><section class="hero"><h1 style="max-width:14ch">Nothing behind this door.</h1><p>This address leads nowhere.</p><div class="acts"><a class="btn" href="/">Back to the locker row</a></div></section></div></main>`, opt);
}

/** Every file of the site, by its path under the public folder. */
export function buildSite(sealed: Sealed, sampleExport: Export, facts: SiteFacts, opt: SiteOptions): Record<string, string> {
  return {
    "index.html": home(sealed, facts, opt),
    "how/index.html": how(sealed, facts, opt),
    "privacy/index.html": privacy(opt),
    "sample/index.html": sample(opt),
    "sample/export.json": JSON.stringify(sampleExport),
    "404.html": notFound(opt),
    "sealed.json": JSON.stringify(sealed, null, 1),
  };
}
