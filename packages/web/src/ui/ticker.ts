import { useSyncExternalStore } from 'react';
import { serverNow } from '../store/time.ts';
import { useGame } from './context.ts';

/** One shared 250ms ticker for every countdown on screen (runs only while something is subscribed). */
let tick = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const subs = new Set<() => void>();

function subscribe(cb: () => void) {
  subs.add(cb);
  timer ??= setInterval(() => {
    tick++;
    subs.forEach((f) => f());
  }, 250);
  return () => {
    subs.delete(cb);
    if (!subs.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Current server time (ms), re-rendering the caller every tick. */
export function useServerNow(): number {
  useSyncExternalStore(subscribe, () => tick);
  const offset = useGame((s) => s.clockOffset);
  return serverNow(offset, Date.now());
}
