import type { PuzzleCase } from '@sharping/shared';

type Difficulty = 'easy' | 'medium' | 'hard';

export interface FakePuzzle {
  title: string;
  difficulty: Difficulty;
  statement: string;
  signature: string;
  publicCases: PuzzleCase[];
}

export const BASE_POINTS: Record<Difficulty, number> = { easy: 100, medium: 200, hard: 300 };
export const CLOCK_MS: Record<Difficulty, number> = { easy: 3 * 60_000, medium: 6 * 60_000, hard: 10 * 60_000 };

export const CATALOG: FakePuzzle[] = [
  {
    title: 'Pair sum',
    difficulty: 'easy',
    statement: 'Return the **sum** of all numbers in the array.\n\nAn empty array sums to `0`.',
    signature: 'function solve(nums: number[]): number',
    publicCases: [{ input: [[1, 2, 3, 4]], output: 10 }],
  },
  {
    title: 'Reverse words',
    difficulty: 'easy',
    statement: 'Reverse the order of the words in a sentence.\n\n- Words are separated by a single space.\n- Keep the letters of each word as they are.',
    signature: 'function solve(s: string): string',
    publicCases: [{ input: ['hello big world'], output: 'world big hello' }],
  },
  {
    title: 'Longest run',
    difficulty: 'medium',
    statement: '# Longest run\n\nGiven a string, return the length of the longest run of the **same character**.\n\n```\n"aabbbc" -> 3\n```',
    signature: 'function solve(s: string): number',
    publicCases: [{ input: ['aabbbc'], output: 3 }, { input: [''], output: 0 }],
  },
  {
    title: 'Balanced brackets',
    difficulty: 'medium',
    statement: 'Return `true` if every `(`, `[` and `{` is closed in the right order.',
    signature: 'function solve(s: string): boolean',
    publicCases: [{ input: ['([]{})'], output: true }, { input: ['(]'], output: false }],
  },
  {
    title: 'Merge intervals',
    difficulty: 'hard',
    statement: 'Merge all overlapping intervals and return them sorted by start.\n\n```\n[[1,3],[2,6],[8,10]] -> [[1,6],[8,10]]\n```',
    signature: 'function solve(intervals: number[][]): number[][]',
    publicCases: [{ input: [[[1, 3], [2, 6], [8, 10]]], output: [[1, 6], [8, 10]] }],
  },
];
