import type { Context } from 'aws-lambda';
import { vi } from 'vitest';
import type { CatalogPuzzle } from '@sharping/game';
import type { RunnerEvent, RunnerResult } from '@sharping/shared';
import type { Deps } from '../src/app.ts';

export const PUZZLE: CatalogPuzzle = {
  id: 'pz',
  title: 'Puzzle',
  difficulty: 'hard',
  author: 'x',
  signature: 'function solve(n: number): number',
  tags: [],
  blockedSabotages: [],
  statement: 'Do it.',
  cases: {
    public: [{ input: [1], output: 2 }],
    hidden: [{ input: [99], output: 198 }],
  },
};

export function v2Event(method: string, path: string, opts: { body?: unknown; token?: string } = {}) {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      host: 'api.example.com',
      ...(opts.token ? { 'x-player-token': opts.token } : {}),
    },
    requestContext: {
      accountId: '1',
      apiId: 'a',
      domainName: 'api.example.com',
      domainPrefix: 'api',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '1.1.1.1', userAgent: 't' },
      requestId: 'r',
      routeKey: `${method} ${path}`,
      stage: '$default',
      time: '',
      timeEpoch: 0,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    isBase64Encoded: false,
  };
}

export const ctx = { functionName: 'test', awsRequestId: 'r' } as unknown as Context;

export function fakeDeps() {
  const deps = {
    repo: {
      createGame: vi.fn(),
      getMeta: vi.fn(),
      playerIdForToken: vi.fn(),
      addPlayer: vi.fn(),
      getSnapshot: vi.fn(),
      startGame: vi.fn(),
      getOrder: vi.fn(),
      getPlayer: vi.fn(),
      getScores: vi.fn(async () => ({})),
      setCurrentOrder: vi.fn(async () => {}),
      claimDelivery: vi.fn(),
      applyDelivery: vi.fn(),
      applyPenalty: vi.fn(async () => {}),
      stickSabotage: vi.fn(async () => true),
    },
    getPuzzle: vi.fn((id: string) => (id === 'pz' ? PUZZLE : undefined)),
    random: () => 0,
    emit: vi.fn(async () => []),
    lambdas: {
      startClock: vi.fn(async () => {}),
      warmRunner: vi.fn(async () => {}),
      runCode: vi.fn<(e: RunnerEvent) => Promise<RunnerResult>>(async () => ({ passed: true, durationMs: 1 })),
    },
    now: () => 1_000_000,
  };
  return deps satisfies Deps;
}
