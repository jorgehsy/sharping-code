import { describe, expect, it } from 'vitest';
import { formatValue, paramNames } from './examples.ts';

describe('paramNames', () => {
  it('reads names, ignoring commas inside types', () => {
    expect(paramNames('function solve(nums: number[]): number')).toEqual(['nums']);
    expect(paramNames('function solve(dishes: [number, number][], k: number): number[]')).toEqual(['dishes', 'k']);
    expect(paramNames('function solve(m: Record<string, number>, opt?: boolean): void')).toEqual(['m', 'opt']);
    expect(paramNames('function solve(): number')).toEqual([]);
  });
});

describe('formatValue', () => {
  it('adds spaces between items but not inside strings', () => {
    expect(formatValue([[0, 10], [5, 15]])).toBe('[[0, 10], [5, 15]]');
    expect(formatValue(['a,b', null, true])).toBe('["a,b", null, true]');
    expect(formatValue({ a: [1, 2] })).toBe('{"a": [1, 2]}');
    expect(formatValue(undefined)).toBe('undefined');
  });
});
