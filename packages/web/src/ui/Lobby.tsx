import { useApp, useGame } from './context.ts';

export function Lobby() {
  const { controller } = useApp();
  const code = useGame((s) => s.code);
  const players = useGame((s) => s.players);
  const host = useGame((s) => s.hostPlayerId);
  const playerId = useGame((s) => s.playerId);
  const error = useGame((s) => s.actionError);
  const isHost = host === playerId;

  return (
    <main className="center">
      <h1>Lobby</h1>
      <p>
        Share this code: <strong className="code">{code}</strong>
      </p>
      <ul className="plain">
        {players.map((p) => (
          <li key={p.playerId}>
            {p.nickname}
            {p.playerId === host && ' (host)'}
            {p.playerId === playerId && ' (you)'}
          </li>
        ))}
      </ul>
      {isHost ? <button onClick={() => void controller.start()}>Start game</button> : <p>Waiting for the host to start…</p>}
      {error && <p className="error">{error}</p>}
      <button className="link" onClick={() => controller.leave()}>
        Leave
      </button>
    </main>
  );
}
