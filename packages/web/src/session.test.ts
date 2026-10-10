import { describe, expect, it } from 'vitest';
import { createSessionStore } from './session.ts';

const mem = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const s = { code: 'ABCDE', playerId: 'p', playerToken: 't', nickname: 'n' };

describe('session store', () => {
  it('round-trips and clears', () => {
    const st = createSessionStore(mem());
    expect(st.load()).toBeNull();
    st.save(s);
    expect(st.load()).toEqual(s);
    st.clear();
    expect(st.load()).toBeNull();
  });
  it('ignores junk and survives throwing storage', () => {
    const m = mem();
    m.setItem('sharping.session', '{"code":1}');
    expect(createSessionStore(m).load()).toBeNull();
    m.setItem('sharping.session', 'not json');
    expect(createSessionStore(m).load()).toBeNull();
    const boom = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    const st = createSessionStore(boom);
    expect(() => st.save(s)).not.toThrow();
    expect(st.load()).toBeNull();
    expect(createSessionStore(undefined).load()).toBeNull();
  });
  it('stores drafts per order', () => {
    const st = createSessionStore(mem());
    st.saveDraft('A', 'o1', 'code');
    expect(st.loadDraft('A', 'o1')).toBe('code');
    expect(st.loadDraft('A', 'o2')).toBeNull();
  });
});
