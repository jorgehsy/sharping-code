import { useEffect, useRef, useState } from 'react';

/** Clips are recorded by `pnpm --filter @sharping/web record:howto` (scripts/record-howto.ts). */
export const STEPS = [
  {
    tab: 'Comandas',
    title: 'Mira las comandas y elige un reto.',
    text: 'Cada comanda es un puzzle con su reloj. Quien entrega primero se lleva más puntos.',
    video: '/assets/howto/1-comandas.mp4',
  },
  {
    tab: 'Código',
    title: 'Resuelve el puzzle en la ventana de código.',
    text: 'Degusta para probar gratis con los ejemplos. Entrega cuando esté listo: un plato mal hecho resta puntos.',
    video: '/assets/howto/2-codigo.mp4',
  },
  {
    tab: 'Condimentos',
    title: 'Usa condimentos para sabotear a los demás.',
    text: 'Ganas uno cada 3 entregas correctas. Lánzalo a un rival y le complica la cocina hasta su próxima entrega.',
    video: '/assets/howto/3-condimentos.mp4',
  },
] as const;

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Lobby side panel: one clip at a time, tabs switch it, and it moves on to the next step when a clip ends.
 * Clicking the clip (or the corner button) pauses it, so the player can read at their own pace.
 */
export function HowTo() {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  // Reduced motion: start paused; the player presses play.
  const [paused, setPaused] = useState(reducedMotion);
  const video = useRef<HTMLVideoElement>(null);
  const step = STEPS[index]!;

  useEffect(() => {
    setProgress(0);
    const v = video.current;
    if (v && !paused) void v.play?.()?.catch(() => {});
    // Only on a step change: `paused` is handled by toggle().
  }, [index]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (paused) void v.play?.()?.catch(() => {});
    else v.pause();
    setPaused(!paused);
  };

  const pick = (i: number) => {
    setPaused(false);
    setIndex(i);
    if (i === index) {
      const v = video.current;
      if (v) {
        v.currentTime = 0;
        void v.play?.()?.catch(() => {});
      }
    }
  };

  return (
    <section className="howto" aria-label="Cómo se juega">
      <h2>Cómo se juega</h2>
      <div className="howto-tabs" role="tablist">
        {STEPS.map((s, i) => (
          <button
            key={s.tab}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={i === index ? 'on' : undefined}
            onClick={() => pick(i)}
          >
            <span className="n">{i + 1}</span>
            {s.tab}
            {i === index && <span className="bar" style={{ transform: `scaleX(${progress})` }} />}
          </button>
        ))}
      </div>
      <div className="howto-screen">
        {failed[index] ? (
          <span className="howto-missing">{index + 1}</span>
        ) : (
          <>
            <video
              key={step.video}
              ref={video}
              src={step.video}
              muted
              playsInline
              autoPlay={!paused}
              preload="auto"
              onClick={toggle}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration) setProgress(v.currentTime / v.duration);
              }}
              onEnded={() => setIndex((i) => (i + 1) % STEPS.length)}
              onError={() => setFailed((f) => ({ ...f, [index]: true }))}
            />
            {paused && <span className="howto-paused" aria-hidden="true">▶</span>}
            <button type="button" className="howto-play" onClick={toggle} aria-label={paused ? 'Reanudar video' : 'Pausar video'}>
              {paused ? '▶' : '❚❚'}
            </button>
          </>
        )}
      </div>
      <div className="howto-text" role="tabpanel">
        <strong>{step.title}</strong>
        <span className="muted">{step.text}</span>
      </div>
    </section>
  );
}
