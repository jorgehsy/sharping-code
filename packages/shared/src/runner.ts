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
