// The signed-in portal browser: TinyFish opens a browser on the saved sign-in, and Takehome drives it
// over the Chrome DevTools Protocol. It only ever sends GET requests: it reads what the portal's own
// pages load for themselves (so an export can be checked against the portal) and fetches documents.
// No password is typed here. The sign-in's cookies stay inside TinyFish's browser.
import type { RawCourse, RawMembership } from "../core/blackboard.ts";
import type { TinyFish } from "../tinyfish/api.ts";

export interface Membership extends RawMembership {
  /** True for the newer course layout; the two layouts keep their Grades page at different addresses. */
  ultra: boolean;
}

export interface FileLink {
  status: number;
  /** Where the portal sent the browser for the bytes: a link that works for a short time. */
  url?: string;
  bytes?: number | null;
  type?: string | null;
  error?: string;
}

export interface Portal {
  signedIn(): Promise<boolean>;
  memberships(): Promise<Membership[]>;
  courseFeed(courseId: string): Promise<RawCourse & { statuses: Record<string, number> }>;
  fileLink(source: string): Promise<FileLink>;
  fileBytes(source: string): Promise<Buffer | null>;
  /** Closes the browser. With `save`, the refreshed sign-in is saved back so the next run still lands signed in. */
  close(save: boolean): Promise<boolean>;
}

// Code that runs inside the portal's page. The page sets a <base> pointing at a content network, so
// every request names the portal's own origin in full.
const HELPERS = `
window.__get = async (p) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), 30000);
  try { const r = await fetch(p.startsWith('/') ? location.origin + p : p, { headers: { accept: 'application/json' }, signal: c.signal }); const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch {}
    return { status: r.status, j }; } catch (e) { return { status: 599, j: null }; } finally { clearTimeout(t); } };
window.__all = async (p) => { let rows = []; let url = p; for (let i = 0; i < 60 && url; i++) { const r = await __get(url); if (r.status !== 200 || !r.j) return { status: r.status, rows }; rows = rows.concat(r.j.results || []); url = r.j.paging?.nextPage || null; } return { status: 200, rows }; };
true`;

const MEMBERSHIPS = `(async () => { const m = await __all('/learn/api/v1/users/' + __uid + '/memberships?expand=course&includeCount=true&limit=100');
  if (m.status !== 200) throw new Error('memberships answered ' + m.status);
  return m.rows.filter(x => x.course).map(x => ({ id: x.course.id, code: x.course.courseId || x.course.id, title: x.course.displayName || x.course.name || '', term: x.course.term?.name || null,
    available: x.course.isAvailable !== false, organization: !!x.course.isOrganization, ultra: x.course.ultraStatus === 'ULTRA' })); })()`;

const COURSE_FEED = (courseId: string) => `(async (c) => { const contents = [];
  const walk = async (path, depth) => { const r = await __all(path); for (const x of r.rows) { contents.push({ id: x.id, parentId: x.parentId || null, title: x.title || '', handler: x.contentHandler?.id || 'none', created: x.created || null, modified: x.modified || null });
    if (depth < 8 && x.hasChildren) await walk('/learn/api/public/v1/courses/' + c + '/contents/' + x.id + '/children?limit=200', depth + 1); } return r.status; };
  const contentStatus = await walk('/learn/api/public/v1/courses/' + c + '/contents?limit=200', 0);
  for (const it of contents) {
    if (it.handler === 'resource/x-bb-file' || it.handler === 'resource/x-bb-document' || it.handler === 'resource/x-bb-assignment') { const a = await __get('/learn/api/public/v1/courses/' + c + '/contents/' + it.id + '/attachments'); const list = a.status === 200 && a.j ? (a.j.results || []).map(f => ({ id: f.id, fileName: f.fileName || f.id })) : []; if (list.length) it.attachments = list; }
    if (it.handler === 'resource/x-bb-document' || it.handler === 'none') { const d = await __get('/learn/api/v1/courses/' + c + '/contents/' + it.id); const html = d.j?.body?.rawText || ''; if (html.includes('bbcswebdav')) it.body = html; }
  }
  const cols = await __all('/learn/api/public/v2/courses/' + c + '/gradebook/columns?limit=200');
  const gr = await __all('/learn/api/public/v2/courses/' + c + '/gradebook/users/' + __uid + '?limit=200');
  const an = await __all('/learn/api/public/v1/courses/' + c + '/announcements?limit=100');
  const cv = await __all('/learn/api/v1/courses/' + c + '/conversations?limit=100');
  return { contents,
    columns: cols.rows.map(k => ({ id: k.id, name: k.name || '', possible: typeof k.score?.possible === 'number' ? k.score.possible : null, due: k.grading?.due || null })),
    grades: gr.rows.map(g => ({ columnId: g.columnId, status: g.status || '', score: typeof g.displayGrade?.score === 'number' ? g.displayGrade.score : null, first: g.firstRelevantDate || null, last: g.lastRelevantDate || null })),
    announcements: an.rows.map(a => ({ id: a.id, title: a.title || '', body: a.body || '', start: a.availability?.duration?.start || null, created: a.created || null })),
    conversations: cv.rows.map(v => ({ id: v.id, created: v.createdDate || null, updated: v.updatedDate || null, total: v.totalCount || (v.messages || []).length || 0 })),
    statuses: { contents: contentStatus, columns: cols.status, grades: gr.status, announcements: an.status, conversations: cv.status } }; })(${JSON.stringify(courseId)})`;

const FILE_LINK = (source: string) => `(async (s) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), 45000);
  try { const r = await fetch(location.origin + s, { signal: c.signal }); const out = { status: r.status, url: r.url, bytes: Number(r.headers.get('content-length')) || null, type: r.headers.get('content-type') };
    try { await r.body?.cancel(); } catch {} return out; } catch (e) { return { status: 599, error: String(e).slice(0, 120) }; } finally { clearTimeout(t); } })(${JSON.stringify(source)})`;

const FILE_LOAD = (source: string) => `(async (s) => { try { const r = await fetch(location.origin + s); window.__buf = new Uint8Array(await r.arrayBuffer()); return { status: r.status, bytes: window.__buf.length }; } catch (e) { return { status: 599, bytes: 0 }; } })(${JSON.stringify(source)})`;
const FILE_PART = (offset: number, size: number) => `(() => { const part = window.__buf.subarray(${offset}, ${offset + size}); let s = ''; for (let i = 0; i < part.length; i += 0x8000) s += String.fromCharCode.apply(null, part.subarray(i, i + 0x8000)); return btoa(s); })()`;

export async function openPortal(api: TinyFish, profileId: string, origin: string): Promise<Portal> {
  const session = await startSession(api, profileId, origin);
  const ws = new WebSocket(session.cdp_url);
  await new Promise<void>((ok, bad) => {
    ws.onopen = () => ok();
    ws.onerror = () => bad(new Error("Could not reach the TinyFish browser."));
  });
  let n = 0;
  const waiting = new Map<number, { ok: (v: any) => void; bad: (e: Error) => void }>();
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    const w = m.id ? waiting.get(m.id) : undefined;
    if (!w) return;
    waiting.delete(m.id);
    if (m.error) w.bad(new Error(m.error.message));
    else w.ok(m.result);
  };
  const send = (method: string, params: object = {}, sessionId?: string) =>
    new Promise<any>((ok, bad) => {
      const id = ++n;
      waiting.set(id, { ok, bad });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const { targetInfos } = await send("Target.getTargets");
  const page = (targetInfos as Array<{ type: string; targetId: string }>).find((t) => t.type === "page");
  if (!page) throw new Error("The TinyFish browser opened without a page.");
  const { sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  const read = async <T>(expression: string): Promise<T> => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(`The portal page failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value as T;
  };
  for (let i = 0; i < 20; i++) {
    const href = await read<string>("location.href").catch(() => "");
    if (href.startsWith(origin) && (await read<string>("document.readyState")) === "complete") break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  await read(HELPERS);
  const signedIn = async () => (await read<number>(`(async () => { const r = await __get('/learn/api/v1/users/me'); window.__uid = r.j?.id; return r.status; })()`)) === 200;

  let closed = false;
  return {
    signedIn,
    memberships: () => read<Membership[]>(MEMBERSHIPS),
    courseFeed: (courseId) => read(COURSE_FEED(courseId)),
    fileLink: (source) => read<FileLink>(FILE_LINK(source)),
    async fileBytes(source) {
      const head = await read<{ status: number; bytes: number }>(FILE_LOAD(source));
      if (head.status !== 200) return null;
      const parts: Buffer[] = [];
      for (let at = 0; at < head.bytes; at += 1_048_576) parts.push(Buffer.from(await read<string>(FILE_PART(at, 1_048_576)), "base64"));
      return Buffer.concat(parts);
    },
    async close(save) {
      if (closed) return false;
      closed = true;
      let saved = false;
      try {
        if (save && (await signedIn())) {
          await api.saveSetup(profileId, session.session_id);
          saved = true;
        }
      } catch {
        // The browser may already be gone; that must never fail an export.
      }
      if (!saved) await api.cancelSetup(profileId, session.session_id).catch(() => {});
      try {
        ws.close();
      } catch {
        // Already closed.
      }
      return saved;
    },
  };
}

/** An Agent run that is still using the saved sign-in holds it; wait for it instead of failing. */
async function startSession(api: TinyFish, profileId: string, origin: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api.startSetup(profileId, `${origin}/ultra/course`);
    } catch (e) {
      if (!(e instanceof Error) || !/locked|active run|in use/i.test(e.message) || attempt >= 40) throw e;
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}
