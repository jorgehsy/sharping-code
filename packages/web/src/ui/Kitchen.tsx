import { useMemo, useState } from 'react';
import { formatClock, remainingMs } from '../store/time.ts';
import { useApp, useGame } from './context.ts';
import { useServerNow } from './ticker.ts';

export function Kitchen({ onTaken }: { onTaken: () => void }) {
  const { controller } = useApp();
  const orders = useGame((s) => s.orders);
  const players = useGame((s) => s.players);
  const me = useGame((s) => s.me);
  const rush = useGame((s) => s.rush);
  const error = useGame((s) => s.actionError);
  const now = useServerNow();
  const [target, setTarget] = useState('');
  const ranked = useMemo(() => [...players].sort((a, b) => b.score - a.score), [players]);
  const others = ranked.filter((p) => p.playerId !== me?.playerId);

  const take = async (orderId: string) => {
    if (me?.currentOrderId === orderId) return onTaken();
    if (await controller.takeOrder(orderId)) onTaken();
  };

  return (
    <div className="kitchen">
      <section>
        <h2>Orders</h2>
        {error && <p className="error">{error}</p>}
        {orders.length === 0 && <p>No open orders.</p>}
        <ul className="plain orders">
          {orders.map((o) => {
            const left = remainingMs(o.expiresAt, now);
            return (
              <li key={o.orderId} className={`order ${o.difficulty}`}>
                <div>
                  <strong>{o.title}</strong> <span className="badge">{o.difficulty}</span>
                  <div className="muted">
                    {o.basePoints * (rush ? 2 : 1)} pts - deliveries {o.deliveries}/3 -{' '}
                    <span className={left < 30_000 ? 'warn' : ''}>{formatClock(left)}</span>
                  </div>
                </div>
                <button onClick={() => void take(o.orderId)}>{me?.currentOrderId === o.orderId ? 'Continue' : 'Take'}</button>
              </li>
            );
          })}
        </ul>
      </section>
      <aside>
        <h2>Players</h2>
        <ol className="plain">
          {ranked.map((p) => (
            <li key={p.playerId}>
              {p.nickname}
              {p.playerId === me?.playerId && ' (you)'}: <strong>{p.score}</strong>
            </li>
          ))}
        </ol>
        {me && me.condiments > 0 && (
          <div className="stack">
            <h3>Sabotage</h3>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose a target…</option>
              {others.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.nickname}
                </option>
              ))}
            </select>
            <button disabled={!target} onClick={() => void controller.sabotage(target)}>
              Use condiment
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
