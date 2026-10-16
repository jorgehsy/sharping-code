import { useSyncExternalStore } from 'react';
import type { Mute } from '../sound/mute.ts';
import { useApp } from './context.ts';

function Toggle({ mute, on, off, label }: { mute: Mute; on: string; off: string; label: string }) {
  const muted = useSyncExternalStore(mute.subscribe, mute.muted);
  const title = `${muted ? 'Activar' : 'Silenciar'} ${label}`;
  return (
    <button type="button" className={muted ? 'off' : undefined} aria-pressed={!muted} aria-label={title} title={title} onClick={() => mute.setMuted(!muted)}>
      {muted ? off : on}
    </button>
  );
}

/** Sfx and music toggles. Floating top-right outside the game; inline in the HUD. */
export function MuteButtons({ floating = false }: { floating?: boolean }) {
  const { sound, music } = useApp();
  return (
    <span className={floating ? 'mute' : 'mute-inline'}>
      <Toggle mute={sound} on="🔊" off="🔇" label="efectos" />
      <Toggle mute={music} on="🎵" off="🎵" label="música" />
    </span>
  );
}
