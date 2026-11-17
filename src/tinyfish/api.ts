// The TinyFish calls Takehome makes. The key comes from the environment and is never written anywhere.
//  - Profiles: the saved sign-in, and a browser opened on it (setup session)
//  - Agent: one run per page to read, on the saved sign-in
//  - Runs: following each run to its end
//  - Fetch: turning a document into text, from the short-lived link the portal gives for it
const BASE = "https://agent.tinyfish.ai";
const FETCH = "https://api.fetch.tinyfish.ai";

export interface AgentRun {
  run_id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  num_of_steps: number | null;
  result: unknown;
  error: unknown;
  started_at: string | null;
  finished_at: string | null;
  steps?: Array<{ id: string; action?: string; screenshot?: string | null }>;
}

export interface SetupSession {
  session_id: string;
  cdp_url: string;
}

export class TinyFishError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class TinyFish {
  readonly #key: string;

  constructor(key: string) {
    if (!key) throw new Error("TINYFISH_API_KEY is not set.");
    this.#key = key;
  }

  async #call<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "X-API-Key": this.#key, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      // A busy or briefly failing service is tried again; anything else is reported as it is.
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, Number(res.headers.get("retry-after") ?? 2 ** attempt * 2) * 1000));
        continue;
      }
      const text = await res.text();
      if (!res.ok) throw new TinyFishError(res.status, `TinyFish answered ${res.status} to ${method} ${path}: ${text.slice(0, 200)}`);
      return (text ? JSON.parse(text) : null) as T;
    }
  }

  async wallet(): Promise<number> {
    return Number((await this.#call<{ available_balance: string }>("GET", "/v1/wallet")).available_balance);
  }

  async profileNamed(name: string): Promise<{ id: string; name: string }> {
    const answer = await this.#call<unknown>("GET", "/v1/profiles");
    const list = (Array.isArray(answer) ? answer : ((answer as { profiles?: unknown[]; data?: unknown[]; items?: unknown[] }).profiles ?? (answer as { data?: unknown[] }).data ?? (answer as { items?: unknown[] }).items ?? [])) as Array<{ id: string; name: string }>;
    const found = list.find((p) => p.name === name);
    if (!found) throw new Error(`No saved sign-in named "${name}" on this TinyFish account. Create it first (see the README).`);
    return found;
  }

  startSetup(profileId: string, url: string, timeoutSeconds = 900): Promise<SetupSession> {
    return this.#call("POST", `/v1/profiles/${profileId}/setup-session`, { url, timeout_seconds: timeoutSeconds });
  }

  async saveSetup(profileId: string, sessionId: string): Promise<void> {
    await this.#call("POST", `/v1/profiles/${profileId}/save`, { session_id: sessionId });
  }

  async cancelSetup(profileId: string, sessionId: string): Promise<void> {
    await this.#call("POST", `/v1/profiles/${profileId}/setup-session/cancel`, { session_id: sessionId });
  }

  async startRun(body: { url: string; goal: string; output_schema: unknown; profile_id: string; max_steps: number; max_seconds: number }): Promise<string> {
    const out = await this.#call<{ run_id: string | null; error: unknown }>("POST", "/v1/automation/run-async", {
      url: body.url,
      goal: body.goal,
      output_schema: body.output_schema,
      use_profile: true,
      profile_id: body.profile_id,
      agent_config: { max_steps: body.max_steps, max_duration_seconds: body.max_seconds },
    });
    if (!out.run_id) throw new TinyFishError(200, `TinyFish did not start the run: ${JSON.stringify(out.error).slice(0, 200)}`);
    return out.run_id;
  }

  getRun(runId: string): Promise<AgentRun> {
    return this.#call("GET", `/v1/runs/${runId}?screenshots=none`);
  }

  /** Follows a run to its end. A run still going after the wait is reported, never assumed done. */
  async waitRun(runId: string, waitMs = 420_000): Promise<AgentRun> {
    const until = Date.now() + waitMs;
    for (;;) {
      const run = await this.getRun(runId);
      if (run.status === "COMPLETED" || run.status === "FAILED" || run.status === "CANCELLED") return run;
      if (Date.now() > until) throw new Error(`Run ${runId} was still ${run.status} after ${Math.round(waitMs / 1000)} s.`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  /**
   * TinyFish Fetch reads each address and gives back its text. Used on the short-lived links the
   * portal hands out for documents: a PDF or a Word file comes back as text that can be searched.
   * A document Fetch cannot read is simply missing from the answer.
   */
  async fetchText(urls: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (urls.length === 0) return out;
    const res = await fetch(FETCH, { method: "POST", headers: { "X-API-Key": this.#key, "content-type": "application/json" }, body: JSON.stringify({ urls, format: "markdown" }), signal: AbortSignal.timeout(120_000) });
    if (!res.ok) return out;
    const answer = (await res.json()) as { results?: Array<{ url: string; text?: string }> };
    for (const r of answer.results ?? []) if (r.text && r.text.trim()) out.set(r.url, r.text);
    return out;
  }
}
