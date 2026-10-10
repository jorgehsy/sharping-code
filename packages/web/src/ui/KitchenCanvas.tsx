import { useEffect, useRef, useState } from 'react';
import { useApp } from './context.ts';

/** Waits (briefly) for the pixel font so the first floating numbers don't render in the fallback font. */
async function pixelFontReady() {
  try {
    const wait = new Promise((r) => setTimeout(r, 1500));
    await Promise.race([document.fonts.load('30px Silkscreen'), wait]);
  } catch {
    /* the fallback font is fine */
  }
}

/**
 * Host of the Phaser tavern. Phaser is a separate chunk, fetched on first mount; the game is created in an
 * effect and destroyed on unmount (Alt+K unmounts the kitchen), also if the unmount happens while loading.
 */
export function KitchenCanvas() {
  const { store, controller } = useApp();
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let game: { destroy: (removeCanvas: boolean) => void } | null = null;
    void (async () => {
      try {
        await pixelFontReady();
        const { createKitchenGame } = await import('../kitchen/createKitchenGame.ts');
        if (cancelled || !host.current) return;
        game = createKitchenGame(host.current, { store, onLiveEvent: controller.onLiveEvent });
        setStatus('ready');
      } catch (e) {
        console.error('Could not start the tavern scene', e);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, [store, controller]);

  return (
    <div className="scene">
      <div ref={host} className="scene-host" role="img" aria-label="La taberna: cocineros tras el mostrador, clientes monstruo delante" />
      {status !== 'ready' && <p className="scene-note">{status === 'error' ? 'No se pudo cargar la taberna.' : 'Encendiendo las antorchas…'}</p>}
    </div>
  );
}
