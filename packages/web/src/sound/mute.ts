/** A muted flag persisted in localStorage, observable from React (useSyncExternalStore). */
export interface Mute {
  muted(): boolean;
  setMuted(muted: boolean): void;
  subscribe(cb: () => void): () => void;
}

export function createMute(key: string, storage: Storage | undefined, onChange?: (muted: boolean) => void): Mute {
  let muted = false;
  try {
    muted = storage?.getItem(key) === '1';
  } catch {
    /* blocked storage: start unmuted */
  }
  const subs = new Set<() => void>();
  return {
    muted: () => muted,
    setMuted(value) {
      muted = value;
      try {
        storage?.setItem(key, value ? '1' : '0');
      } catch {
        /* private mode: keep it for this tab only */
      }
      onChange?.(value);
      subs.forEach((f) => f());
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}
