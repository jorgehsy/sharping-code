
import { Final } from './Final.tsx';
import { Game } from './Game.tsx';
import { Home } from './Home.tsx';
import { Lobby } from './Lobby.tsx';
import { useApp, useGame } from './context.ts';

export function App() {
  const { controller } = useApp();
  const code = useGame((s) => s.code);
  const synced = useGame((s) => s.synced);
  const loaded = useGame((s) => s.hostPlayerId !== null);
  const status = useGame((s) => s.status);
  const error = useGame((s) => s.actionError);

  if (!code) return <Home />;
  if (!loaded) {
    return (
      <main className="center">
        <p>{error ?? (synced ? 'Loading…' : 'Joining game…')}</p>
        {error && <button onClick={() => controller.leave()}>Back</button>}
      </main>
    );
  }
  return (
    <>
      <ConnectionBanner />
      {status === 'lobby' ? <Lobby /> : status === 'running' ? <Game /> : <Final />}
    </>
  );
}

function ConnectionBanner() {
  const connection = useGame((s) => s.connection);
  const synced = useGame((s) => s.synced);
  if (connection === 'live' && synced) return null;
  return <div className="banner">{connection === 'live' ? 'Syncing…' : 'Reconnecting…'}</div>;
}
