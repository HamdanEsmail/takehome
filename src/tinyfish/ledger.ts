// What Takehome has spent at TinyFish, line by line, and the cap it may not pass.

/** TinyFish charges an Agent run by its steps. */
export const STEP_USD = 0.016;

export interface SpendLine {
  at: string;
  what: string;
  usd: number;
  runId: string | null;
}

export class Ledger {
  readonly capUsd: number;
  readonly lines: SpendLine[];

  constructor(capUsd: number, lines: SpendLine[] = []) {
    this.capUsd = capUsd;
    this.lines = [...lines];
  }

  spent(): number {
    return Math.round(this.lines.reduce((n, l) => n + l.usd, 0) * 1e6) / 1e6;
  }

  /** True when work that could cost this much at worst still fits under the cap. */
  room(worstCaseUsd: number): boolean {
    return this.spent() + worstCaseUsd <= this.capUsd + 1e-9;
  }

  mustHaveRoom(worstCaseUsd: number, what: string): void {
    if (!this.room(worstCaseUsd)) {
      throw new Error(`Stopped before ${what}: it could cost $${worstCaseUsd.toFixed(2)}, and $${this.spent().toFixed(2)} of the $${this.capUsd.toFixed(2)} cap is already spent.`);
    }
  }

  book(what: string, usd: number, runId: string | null, at: string = new Date().toISOString()): void {
    this.lines.push({ at, what, usd: Math.round(usd * 1e6) / 1e6, runId });
  }
}
