import type { OrderSummary, PlayerSummary } from '@sharping/shared';
import { useEffect, useRef } from 'react';
import type { FrameName } from '../kitchen/frames.ts';
import { difficultyLabel } from '../kitchen/labels.ts';
import { heroOf } from '../kitchen/heroes.ts';
import { monsterFor, type Difficulty } from '../kitchen/monsters.ts';
import { isFull, isUrgent, nextPoints, RANK_SHARES } from '../kitchen/points.ts';
import { heroFrame, monsterFrame } from '../kitchen/sprites.ts';
import { ticketPhase, type TicketPhase } from '../kitchen/tickets.ts';
import { formatClock, remainingMs } from '../store/time.ts';
import { Head, Sprite } from './Sprite.tsx';

export interface Beaten {
  text: string;
  until: number;
}

/** How long a ticket plays its "drop" animation after it appears. */
const ENTER_MS = 600;

interface Seen {
  firstAt: number;
  /** When we saw the order fill up; -Infinity if it was already full when first seen; null while not full. */
  fullAt: number | null;
}

/**
 * Tracks when each order showed up and when it filled, to run the drop-in animation and to hide full orders
 * once their fall animation is done (the API keeps listing them until they expire).
 */
export function useTicketLifecycle(orders: readonly OrderSummary[]) {
  const seen = useRef(new Map<string, Seen>());
  const initial = useRef(true);
  useEffect(() => {
    initial.current = false;
  }, []);

  const now = Date.now();
  const alive = new Set<string>();
  for (const o of orders) {
    alive.add(o.orderId);
    const full = isFull(o);
    let r = seen.current.get(o.orderId);
    if (!r) {
      r = { firstAt: initial.current ? -Infinity : now, fullAt: full ? -Infinity : null };
      seen.current.set(o.orderId, r);
    } else if (full && r.fullAt === null) {
      r.fullAt = now;
    }
  }
  for (const id of seen.current.keys()) if (!alive.has(id)) seen.current.delete(id);

  return orders.flatMap((order) => {
    const r = seen.current.get(order.orderId)!;
    const phase = ticketPhase(r.fullAt, now);
    if (phase === 'hidden') return [];
    return [{ order, phase, entering: now - r.firstAt < ENTER_MS }];
  });
}

export interface TicketProps {
  order: OrderSummary;
  phase: TicketPhase;
  entering: boolean;
  players: readonly PlayerSummary[];
  myId: string | null;
  mine: boolean;
  rush: boolean;
  now: number;
  beaten?: Beaten;
  onTake: (orderId: string) => void;
}

export function Ticket({ order, phase, entering, players, myId, mine, rush, now, beaten, onTake }: TicketProps) {
  const left = remainingMs(order.expiresAt, now);
  const done = !!myId && order.deliveredBy.includes(myId);
  const full = isFull(order);
  const urgent = isUrgent(left) && !full;
  const next = nextPoints(order, rush);
  const cookers = players.filter((p) => p.currentOrderId === order.orderId && !order.deliveredBy.includes(p.playerId));
  const kind = monsterFor(order.orderId, order.difficulty as Difficulty);
  const portrait: FrameName = monsterFrame(kind);
  const big = kind === 'big_demon' || kind === 'ogre' || kind === 'big_zombie';
  const showBeaten = beaten && beaten.until > Date.now();

  const cls = ['ticket'];
  if (entering && phase === 'show') cls.push('enter');
  if (urgent) cls.push('urgent');
  if (mine && !done) cls.push('mine');
  if (done) cls.push('done');
  if (showBeaten) cls.push('beaten');
  if (phase === 'leave') cls.push('leave');

  return (
    <article className={cls.join(' ')} data-order={order.orderId}>
      <div className="top">
        <span className="portrait-box">
          <Sprite name={portrait} scale={big ? 1 : 2} />
        </span>
        <div className="title">{order.title}</div>
      </div>
      <div className="row">
        <span className={`diff ${order.difficulty}`}>{difficultyLabel(order.difficulty)}</span>
        <span className="deliv">Entregas {order.deliveredBy.length}/{RANK_SHARES.length}</span>
      </div>
      <div className="slots">
        {RANK_SHARES.map((share, k) => {
          const who = order.deliveredBy[k];
          if (who === undefined) {
            return (
              <span key={k} className="slot">
                {Math.round(share * 100)}%
              </span>
            );
          }
          const name = players.find((p) => p.playerId === who)?.nickname ?? 'Alguien';
          return (
            <span key={k} className={`slot filled${who === myId ? ' me' : ''}`} title={`Nº${k + 1}: ${name}`}>
              <Head frame={heroFrame(heroOf(players, who))} />
            </span>
          );
        })}
      </div>
      <div className="cooking">
        {cookers.length > 0 && <span className="lbl">Cocinando</span>}
        {cookers.map((p) => (
          <Head key={p.playerId} frame={heroFrame(heroOf(players, p.playerId))} title={p.nickname} />
        ))}
      </div>
      <div className="meta">
        <span>{done ? 'Lista' : full ? 'Llena' : `${next} pts`}</span>
        <span className="time">{formatClock(left)}</span>
      </div>
      <button type="button" disabled={done || (full && !mine)} onClick={() => onTake(order.orderId)}>
        {done ? 'Ya entregaste' : full && !mine ? 'Llena' : mine ? 'Seguir' : 'Tomar'}
      </button>
      {showBeaten && (
        <div className="alert" key={beaten.until} role="status">
          {beaten.text}
        </div>
      )}
    </article>
  );
}
