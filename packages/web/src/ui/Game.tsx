import { lazy, Suspense, useEffect, useState } from 'react';
import { Kitchen } from './Kitchen.tsx';
import { ConfirmModal } from './Modal.tsx';
import { MuteButtons } from './MuteButton.tsx';
import { Sprite } from './Sprite.tsx';
import { Toasts } from './Toasts.tsx';
import { useApp, useGame } from './context.ts';
import { ruleLabel } from '../kitchen/labels.ts';
import { MAX_CONDIMENTS, SOLVES_PER_CONDIMENT } from '../store/reducer.ts';
import { formatClock, remainingMs } from '../store/time.ts';
import { useServerNow } from './ticker.ts';

// Monaco is heavy: only fetched once the player first opens the editor.
const EditorView = lazy(() => import('./EditorView.tsx'));

export type View = 'kitchen' | 'editor';

export function Game() {
  const [view, setView] = useState<View>('kitchen');
  const taken = useGame((s) => s.taken);

  // Alt+K toggles views (capture phase so Monaco can't swallow it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyK') {
        e.preventDefault();
        setView((v) => (v === 'kitchen' ? 'editor' : 'kitchen'));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="game">
      <Hud view={view} setView={setView} canEdit={!!taken} />
      <div className="view">
        {view === 'kitchen' ? (
          <Kitchen onTaken={() => setView('editor')} />
        ) : (
          <Suspense fallback={<p className="center">Cargando editor…</p>}>
            <EditorView onBack={() => setView('kitchen')} />
          </Suspense>
        )}
      </div>
      <Toasts />
    </div>
  );
}

function Hud({ view, setView, canEdit }: { view: View; setView: (v: View) => void; canEdit: boolean }) {
  const { controller } = useApp();
  const endsAt = useGame((s) => s.endsAt);
  const rush = useGame((s) => s.rush);
  const score = useGame((s) => s.me?.score ?? 0);
  const condiments = useGame((s) => s.me?.condiments ?? 0);
  const towardNext = useGame((s) => (s.me?.solved ?? 0) % SOLVES_PER_CONDIMENT);
  const sabotage = useGame((s) => s.me?.sabotage ?? null);
  const code = useGame((s) => s.code);
  const now = useServerNow();
  const [leaving, setLeaving] = useState(false);

  return (
    <header className="hud" aria-label="Estado de la partida">
      <span className="muted">
        Partida <span className="code-text">{code}</span>
      </span>
      <span className="clock">{endsAt ? formatClock(remainingMs(endsAt, now)) : '--:--'}</span>
      {rush && <span className="pill rush">Hora punta x2</span>}
      <span>
        Puntos <span className="score">{score}</span>
      </span>
      <span title={`${condiments} condimento${condiments === 1 ? '' : 's'}`}>
        Condimentos{' '}
        <span className="flasks">
          {Array.from({ length: MAX_CONDIMENTS }, (_, i) => (
            <Sprite key={i} name="flask_big_red" scale={1.25} style={{ opacity: i < condiments ? 1 : 0.25 }} />
          ))}
        </span>{' '}
        <span className="muted" title={`Cada ${SOLVES_PER_CONDIMENT} platos bien hechos ganas un condimento`}>
          {towardNext}/{SOLVES_PER_CONDIMENT}
        </span>
      </span>
      {sabotage && <span className="pill curse">Maldito: {ruleLabel(sabotage)}</span>}
      <span className="spacer" />
      <button type="button" onClick={() => setView(view === 'kitchen' ? 'editor' : 'kitchen')} disabled={view === 'kitchen' && !canEdit}>
        {view === 'kitchen' ? 'Editor' : 'Cocina'} (Alt+K)
      </button>
      <MuteButtons />
      <button type="button" onClick={() => setLeaving(true)}>
        Salir
      </button>
      {leaving && (
        <ConfirmModal
          title="¿Salir de la partida?"
          confirmLabel="Salir"
          onCancel={() => setLeaving(false)}
          onConfirm={() => {
            setLeaving(false);
            controller.leave();
          }}
        >
          Perderás tu progreso en la comanda actual.
        </ConfirmModal>
      )}
    </header>
  );
}
