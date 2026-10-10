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
    title: 'Suma de pares',
    difficulty: 'easy',
    statement: 'Devuelve la **suma** de todos los números del arreglo.\n\nUn arreglo vacío suma `0`.',
    signature: 'function solve(nums: number[]): number',
    publicCases: [{ input: [[1, 2, 3, 4]], output: 10 }],
  },
  {
    title: 'Invertir palabras',
    difficulty: 'easy',
    statement: 'Invierte el orden de las palabras de una frase.\n\n- Las palabras se separan con un solo espacio.\n- Deja las letras de cada palabra como están.',
    signature: 'function solve(s: string): string',
    publicCases: [{ input: ['hello big world'], output: 'world big hello' }],
  },
  {
    title: 'Racha más larga',
    difficulty: 'medium',
    statement: '# Racha más larga\n\nDado un texto, devuelve la longitud de la racha más larga del **mismo carácter**.\n\n```\n"aabbbc" -> 3\n```',
    signature: 'function solve(s: string): number',
    publicCases: [{ input: ['aabbbc'], output: 3 }, { input: [''], output: 0 }],
  },
  {
    title: 'Paréntesis balanceados',
    difficulty: 'medium',
    statement: 'Devuelve `true` si todo `(`, `[` y `{` se cierra en el orden correcto.',
    signature: 'function solve(s: string): boolean',
    publicCases: [{ input: ['([]{})'], output: true }, { input: ['(]'], output: false }],
  },
  {
    title: 'Unir intervalos',
    difficulty: 'hard',
    statement: 'Une todos los intervalos que se solapan y devuélvelos ordenados por inicio.\n\n```\n[[1,3],[2,6],[8,10]] -> [[1,6],[8,10]]\n```',
    signature: 'function solve(intervals: number[][]): number[][]',
    publicCases: [{ input: [[[1, 3], [2, 6], [8, 10]]], output: [[1, 6], [8, 10]] }],
  },
];
