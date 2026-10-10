import { useCallback, useEffect, useRef, useState } from 'react';
import type { EventPayloads } from '@sharping/shared';
import { nextPoints } from '../kitchen/points.ts';
import { useApp, useGame } from './context.ts';
import { KitchenCanvas } from './KitchenCanvas.tsx';
import { Ranking } from './Ranking.tsx';
import { Ticket, useTicketLifecycle, type Beaten } from './Tickets.tsx';
import { useServerNow } from './ticker.ts';

/** How long the "someone beat you" overlay stays on a ticket (it fades out at the end). */
const BEATEN_MS = 2600;

export function Kitchen({ onTaken }: { onTaken: () => void }) {
  const { controller, store } = useApp();
  const orders = useGame((s) => s.orders);
  const players = useGame((s) => s.players);
  const myId = useGame((s) => s.playerId);
  const myOrderId = useGame((s) => s.me?.currentOrderId ?? null);
  const canCurse = useGame((s) => (s.me?.condiments ?? 0) > 0);
  const rush = useGame((s) => s.rush);
  const error = useGame((s) => s.actionError);
  const now = useServerNow();
  const tickets = useTicketLifecycle(orders);

  const take = async (orderId: string) => {
    if (myOrderId === orderId) return onTaken();
    if (await controller.takeOrder(orderId)) onTaken();
  };

  // "Te ganaron el NºN": an overlay on my ticket (absolutely positioned, never moves the layout).
  const [beaten, setBeaten] = useState<Record<string, Beaten>>({});
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const live = timers.current;
    const off = controller.onLiveEvent((e) => {
      if (e.type !== 'order.delivered') return;
      const d = e.data as EventPayloads['order.delivered'];
      const s = store.getState();
      if (!s.playerId || d.playerId === s.playerId || s.me?.currentOrderId !== d.orderId) return;
      const o = s.orders.find((x) => x.orderId === d.orderId);
      if (!o || o.deliveredBy.includes(s.playerId)) return;
      const worth = nextPoints(o, s.rush);
      const text = worth > 0 ? `Te ganaron el Nº${d.rank}. Ahora vale ${worth}` : `Te ganaron el Nº${d.rank}. Se llenó: ya no puedes entregar`;
      const until = Date.now() + BEATEN_MS;
      setBeaten((b) => ({ ...b, [d.orderId]: { text, until } }));
      const h = setTimeout(() => {
        live.delete(h);
        setBeaten((b) => (b[d.orderId]?.until === until ? Object.fromEntries(Object.entries(b).filter(([k]) => k !== d.orderId)) : b));
      }, BEATEN_MS + 100);
      live.add(h);
    });
    return () => {
      off();
      live.forEach(clearTimeout);
      live.clear();
    };
  }, [controller, store]);

  const curse = useCallback((id: string) => void controller.sabotage(id), [controller]);

  return (
    <div className="kitchen">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="main">
        <section className="stage" aria-label="Taberna">
          <div className="rail" aria-label="Comandas abiertas">
            {tickets.length === 0 && <span className="rail-empty">No hay comandas abiertas. Llegan nuevas solas.</span>}
            {tickets.map(({ order, phase, entering }) => (
              <Ticket
                key={order.orderId}
                order={order}
                phase={phase}
                entering={entering}
                players={players}
                myId={myId}
                mine={myOrderId === order.orderId}
                rush={rush}
                now={now}
                beaten={beaten[order.orderId]}
                onTake={(id) => void take(id)}
              />
            ))}
          </div>
          <KitchenCanvas />
        </section>
        <Ranking players={players} myId={myId} canCurse={canCurse} onCurse={curse} />
      </div>
    </div>
  );
}
