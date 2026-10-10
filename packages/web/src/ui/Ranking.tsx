import type { PlayerSummary } from '@sharping/shared';
import { memo, useEffect, useMemo, useRef } from 'react';
import { heroFrame } from '../kitchen/sprites.ts';
import { heroForIndex } from '../kitchen/heroes.ts';
import { ruleLabel } from '../kitchen/labels.ts';
import { Sprite } from './Sprite.tsx';

export const Ranking = memo(function Ranking({
  players,
  myId,
  canCurse,
  onCurse,
}: {
  players: readonly PlayerSummary[];
  myId: string | null;
  /** I hold a condiment: every other uncursed player's row gets a "Maldecir" control (max 1 sabotage per target). */
  canCurse: boolean;
  onCurse: (playerId: string) => void;
}) {
  // Heroes follow join order, which is the order of `players` (not the score order).
  const sorted = useMemo(
    () =>
      players
        .map((p, joinIndex) => ({ p, joinIndex }))
        .sort((a, b) => b.p.score - a.p.score || a.joinIndex - b.joinIndex),
    [players],
  );
  const prev = useRef<string[]>([]);
  const order = sorted.map((r) => r.p.playerId);
  useEffect(() => {
    prev.current = order;
  });

  return (
    <aside className="board" aria-label="Ranking">
      <h2>Ranking</h2>
      <ol>
        {sorted.map(({ p, joinIndex }, pos) => {
          const before = prev.current.indexOf(p.playerId);
          const bump = before > pos;
          const isMe = p.playerId === myId;
          return (
            <li key={p.playerId} className={`${isMe ? 'me' : ''}${bump ? ' bump' : ''}`}>
              <span className="pos">{pos + 1}</span>
              <span className="portrait">
                <Sprite name={heroFrame(heroForIndex(joinIndex))} />
              </span>
              <span className="name" title={p.nickname}>
                <span className="nm">
                  {p.nickname}
                  {isMe && ' (tú)'}
                </span>
                {p.sabotage && (
                  <span className="cursed" title={`Maldito: ${ruleLabel(p.sabotage)}`}>
                    <Sprite name="skull" />
                  </span>
                )}
              </span>
              <span className="pts">{p.score}</span>
              {canCurse && !isMe && !p.sabotage && (
                <button type="button" className="curse-btn" onClick={() => onCurse(p.playerId)}>
                  Maldecir
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
});
