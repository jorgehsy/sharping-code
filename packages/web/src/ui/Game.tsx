import { lazy, Suspense, useEffect, useState } from 'react';
import { Kitchen } from './Kitchen.tsx';
import { Toasts } from './Toasts.tsx';
import { useApp, useGame } from './context.ts';
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
          <Suspense fallback={<p className="center">Loading editor…</p>}>
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
  const me = useGame((s) => s.me);
  const code = useGame((s) => s.code);
  const now = useServerNow();

  return (
    <header className="hud">
      <span>
        Game <strong>{code}</strong>
      </span>
      <span className="clock">{endsAt ? formatClock(remainingMs(endsAt, now)) : '--:--'}</span>
      {rush && <span className="badge rush">RUSH x2</span>}
      <span>Score: {me?.score ?? 0}</span>
      <span>Condiments: {me?.condiments ?? 0}</span>
      {me?.sabotage && <span className="badge bad">Sabotage: {me.sabotage}</span>}
      <span className="spacer" />
      <button onClick={() => setView(view === 'kitchen' ? 'editor' : 'kitchen')} disabled={view === 'kitchen' && !canEdit}>
        {view === 'kitchen' ? 'Editor' : 'Kitchen'} (Alt+K)
      </button>
      <button className="link" onClick={() => controller.leave()}>
        Leave
      </button>
    </header>
  );
}
