import { describe, it, expect } from 'vitest';
import { buildSchedule, planWaitSeconds } from '../src/schedule.js';

const rnd = () => {
  let s = 42;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
};

describe('buildSchedule', () => {
  const s = buildSchedule({ gameCode: 'ABCD', durationSec: 180, now: 1_000_000, random: rnd() });
  it('has 10 events: started, 3 opened, 3 expired, rush, finished', () => {
    expect(s.events).toHaveLength(9);
    expect(s.events[0].type).toBe('game.started');
    expect(s.events.at(-1)!.type).toBe('game.finished');
  });
  it('is sorted with correlative seq', () => {
    s.events.forEach((e, i) => expect(e.seq).toBe(i + 1));
    for (let i = 1; i < s.events.length; i++)
      expect(s.events[i].plannedAt).toBeGreaterThanOrEqual(s.events[i - 1].plannedAt);
  });
  it('rush at duration-60s, finish at end', () => {
    expect(s.events.find((e) => e.type === 'rush.started')!.plannedAt).toBe(1_000_000 + 120_000);
    expect(s.events.at(-1)!.plannedAt).toBe(1_000_000 + 180_000);
  });
  it('opened precedes expired per order', () => {
    for (const id of ['o1', 'o2', 'o3']) {
      const o = s.events.find((e) => e.type === 'order.opened' && e.data.orderId === id)!;
      const x = s.events.find((e) => e.type === 'order.expired' && e.data.orderId === id)!;
      expect(o.seq).toBeLessThan(x.seq);
    }
  });
});

describe('planWaitSeconds', () => {
  it('0 when late or within margin', () => {
    expect(planWaitSeconds(-500, 1000)).toBe(0);
    expect(planWaitSeconds(1900, 1000)).toBe(0);
  });
  it('floors to wake early', () => {
    expect(planWaitSeconds(10_500, 1000)).toBe(9);
  });
});
