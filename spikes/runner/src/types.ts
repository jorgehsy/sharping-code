export type Sabotage = "no-loops" | "max-lines-3";
export interface Case { input: unknown[]; output: unknown; hidden?: boolean }
export interface RunnerEvent { source: string; entry: "solve"; cases: Case[]; sabotage?: Sabotage }
export type RunnerResult =
  | { passed: true; durationMs: number }
  | {
      passed: false;
      reason: "compile" | "sabotage" | "timeout" | "runtime" | "wrong";
      hidden?: boolean;
      case?: { input: unknown[]; expected: unknown; actual: unknown };
      message?: string;
      durationMs: number;
    };
