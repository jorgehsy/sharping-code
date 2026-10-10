import { useState } from 'react';
import { ConfirmModal } from './Modal.tsx';
import { useApp, useGame } from './context.ts';

export function Lobby() {
  const { controller } = useApp();
  const code = useGame((s) => s.code);
  const players = useGame((s) => s.players);
  const host = useGame((s) => s.hostPlayerId);
  const playerId = useGame((s) => s.playerId);
  const error = useGame((s) => s.actionError);
  const isHost = host === playerId;
  const [leaving, setLeaving] = useState(false);

  return (
    <main className="center">
      <h1>Sala de espera</h1>
      <p>
        Comparte este código: <strong className="code">{code}</strong>
      </p>
      <ul className="plain">
        {players.map((p) => (
          <li key={p.playerId}>
            {p.nickname}
            {p.playerId === host && ' (anfitrión)'}
            {p.playerId === playerId && ' (tú)'}
          </li>
        ))}
      </ul>
      {isHost ? <button onClick={() => void controller.start()}>Empezar partida</button> : <p>Esperando a que el anfitrión empiece…</p>}
      {error && <p className="error">{error}</p>}
      <button className="link" onClick={() => setLeaving(true)}>
        Salir
      </button>
      {leaving && (
        <ConfirmModal
          title="¿Salir de la sala?"
          confirmLabel="Salir"
          onCancel={() => setLeaving(false)}
          onConfirm={() => {
            setLeaving(false);
            controller.leave();
          }}
        >
          Necesitarás el código de la partida para volver.
        </ConfirmModal>
      )}
    </main>
  );
}
