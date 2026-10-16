import { useState } from 'react';
import { HowTo } from './HowTo.tsx';
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
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!code) return;
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <main className="screen lobby">
      <div className="card">
        <h1>Sala de espera</h1>
        <section>
          <h2>Comparte este código</h2>
          <div className="code-box">
            <strong className="code">{code}</strong>
            <button type="button" onClick={copy}>
              {copied ? '¡Copiado!' : 'Copiar'}
            </button>
          </div>
        </section>
        <section>
          <h2>Jugadores ({players.length})</h2>
          <ul className="plain players">
            {players.map((p) => (
              <li key={p.playerId}>
                {p.nickname}
                {p.playerId === host && <span className="badge">anfitrión</span>}
                {p.playerId === playerId && <span className="badge">tú</span>}
              </li>
            ))}
          </ul>
        </section>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="link" onClick={() => setLeaving(true)}>
            Salir
          </button>
          {isHost ? (
            <button className="primary" onClick={() => void controller.start()}>
              Empezar partida
            </button>
          ) : (
            <p className="muted">Esperando a que el anfitrión empiece…</p>
          )}
        </div>
      </div>
      <HowTo />
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
