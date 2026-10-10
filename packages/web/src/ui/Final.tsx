import { useMemo } from 'react';
import { useApp, useGame } from './context.ts';

export function Final() {
  const { controller } = useApp();
  const players = useGame((s) => s.players);
  const podium = useGame((s) => s.podium);
  const awards = useGame((s) => s.awards);
  const name = (id: string) => players.find((p) => p.playerId === id)?.nickname ?? id;
  const ranked = useMemo(() => [...players].sort((a, b) => b.score - a.score), [players]);
  // After a reload the snapshot has no podium: fall back to the score table.
  const top = podium.length ? podium : ranked.slice(0, 3).map((p) => p.playerId);

  return (
    <main className="center">
      <h1>Fin de la partida</h1>
      <h2>Podio</h2>
      <ol>
        {top.map((id) => (
          <li key={id}>
            {name(id)} - {players.find((p) => p.playerId === id)?.score ?? 0}
          </li>
        ))}
      </ol>
      <h2>Puntuaciones</h2>
      <ul className="plain">
        {ranked.map((p) => (
          <li key={p.playerId}>
            {p.nickname}: {p.score}
          </li>
        ))}
      </ul>
      {Object.keys(awards).length > 0 && (
        <>
          <h2>Premios</h2>
          <ul className="plain">
            {Object.entries(awards).map(([award, id]) => (
              <li key={award}>
                {award}: {name(id)}
              </li>
            ))}
          </ul>
        </>
      )}
      <button onClick={() => controller.leave()}>Volver al inicio</button>
    </main>
  );
}
