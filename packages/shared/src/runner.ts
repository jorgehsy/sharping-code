import type { PuzzleCase } from './puzzle.ts';

export type SabotageRule = 'no-loops' | 'max-lines-3';

export interface RunnerCase extends PuzzleCase {
  hidden?: boolean;
}

/** Payload the lambdalith sends to the Runner Lambda (sync invoke). */
export interface RunnerEvent {
  source: string;
  entry: 'solve';
  cases: RunnerCase[];
  sabotage?: SabotageRule;
  /**
   * `submit` (default): stop at the first failing case → RunnerResult.
   * `taste`: run every case and report each one → TasteResult. Only public cases are sent.
   */
  mode?: 'submit' | 'taste';
}

export type RunnerResult =
  | { passed: true; durationMs: number }
  | {
      passed: false;
      reason: 'compile' | 'sabotage' | 'timeout' | 'runtime' | 'wrong';
      hidden?: boolean;
      /** Only for public cases; never filled for hidden ones. */
      case?: { input: unknown[]; expected: unknown; actual: unknown };
      message?: string;
      durationMs: number;
    };

/** One case as reported by a taste. `error` is set when solve() threw on this case. */
export interface TasteCase {
  input: unknown[];
  expected: unknown;
  actual?: unknown;
  error?: string;
  passed: boolean;
}

/** Runner answer when `mode: 'taste'`. `ok: false` means no case could run. */
export type TasteResult =
  | { ok: true; cases: TasteCase[]; durationMs: number }
  | { ok: false; reason: 'compile' | 'sabotage' | 'timeout' | 'runtime'; message: string; durationMs: number };
