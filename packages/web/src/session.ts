/** Persisted identity so a reload rejoins the same game (docs/api.md "Reconexión"). */
export interface Session {
  code: string;
  playerId: string;
  playerToken: string;
  nickname: string;
}

const KEY = 'sharping.session';
const draftKey = (code: string, orderId: string) => `sharping.draft.${code}.${orderId}`;

const isSession = (v: unknown): v is Session => {
  const s = v as Record<string, unknown> | null;
  return (
    !!s &&
    typeof s.code === 'string' &&
    typeof s.playerId === 'string' &&
    typeof s.playerToken === 'string' &&
    typeof s.nickname === 'string'
  );
};

export interface SessionStore {
  load(): Session | null;
  save(s: Session): void;
  clear(): void;
  loadDraft(code: string, orderId: string): string | null;
  saveDraft(code: string, orderId: string, source: string): void;
}

/** Storage can throw (private mode, quota) or hold junk: never let that break the app. */
export function createSessionStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined): SessionStore {
  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  return {
    load() {
      return safe(() => {
        const raw = storage?.getItem(KEY);
        if (!raw) return null;
        const v: unknown = JSON.parse(raw);
        return isSession(v) ? v : null;
      }, null);
    },
    save: (s) => safe(() => storage?.setItem(KEY, JSON.stringify(s)), undefined),
    clear: () => safe(() => storage?.removeItem(KEY), undefined),
    loadDraft: (code, id) => safe(() => storage?.getItem(draftKey(code, id)) ?? null, null),
    saveDraft: (code, id, src) => safe(() => storage?.setItem(draftKey(code, id), src), undefined),
  };
}
