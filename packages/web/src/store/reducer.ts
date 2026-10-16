import type { EventPayloads, GameEvent, GameSnapshot, SabotageRule, Scores } from '@sharping/shared';
import { ruleLabel } from '../kitchen/labels.ts';
import { initialState, type GameState, type Toast } from './state.ts';

export const MAX_TOASTS = 5;
export const MAX_CONDIMENTS = 2;
/** Mirrors @sharping/game: every this many correct deliveries earn a condiment. */
export const SOLVES_PER_CONDIMENT = 3;

const nick = (s: GameState, id: string) => s.players.find((p) => p.playerId === id)?.nickname ?? 'Alguien';
const orderTitle = (s: GameState, id: string) => s.orders.find((o) => o.orderId === id)?.title ?? 'una comanda';

/** Scores are always replaced, never added (events carry the full table). */
function withScores(s: GameState, scores: Scores): GameState {
  return {
    ...s,
    players: s.players.map((p) => (p.playerId in scores ? { ...p, score: scores[p.playerId]! } : p)),
    me: s.me && s.me.playerId in scores ? { ...s.me, score: scores[s.me.playerId]! } : s.me,
  };
}

const pushToast = (s: GameState, e: GameEvent, kind: Toast['kind'], text: string): GameState => ({
  ...s,
  toasts: [...s.toasts, { id: `${e.seq}`, kind, text, at: e.at }].slice(-MAX_TOASTS),
});

const isMe = (s: GameState, id: string) => s.playerId === id;

/** Updates one player of the public list. */
const patchPlayer = (s: GameState, id: string, patch: Partial<GameState['players'][number]>): GameState => ({
  ...s,
  players: s.players.map((p) => (p.playerId === id ? { ...p, ...patch } : p)),
});

/** `playerId` takes position `rank` in `deliveredBy` (idempotent; never leaves holes). */
function withDelivery(by: readonly string[], playerId: string, rank: number): string[] {
  if (by[rank - 1] === playerId) return [...by];
  const rest = by.filter((id) => id !== playerId);
  rest.splice(Math.min(Math.max(rank - 1, 0), rest.length), 0, playerId);
  return rest;
}

/** Applies one event unconditionally (sequencing is `receiveEvent`'s job). Unknown types are ignored. */
export function reduceEvent(s: GameState, e: GameEvent): GameState {
  switch (e.type) {
    case 'player.joined': {
      const d = e.data as EventPayloads['player.joined'];
      if (s.players.some((p) => p.playerId === d.playerId)) return s;
      return pushToast(
        { ...s, players: [...s.players, { playerId: d.playerId, nickname: d.nickname, score: 0, currentOrderId: null, sabotage: null }] },
        e,
        'info',
        `${d.nickname} se unió`,
      );
    }
    case 'game.started': {
      const d = e.data as EventPayloads['game.started'];
      return { ...s, status: 'running', startedAt: d.startedAt, rushAt: d.rushAt, endsAt: d.endsAt, rush: false };
    }
    case 'order.opened': {
      const d = e.data as EventPayloads['order.opened'];
      if (s.orders.some((o) => o.orderId === d.orderId)) return s;
      const order = {
        orderId: d.orderId,
        title: d.title,
        difficulty: d.difficulty as GameState['orders'][number]['difficulty'],
        basePoints: d.basePoints,
        openedAt: e.at,
        expiresAt: d.expiresAt,
        deliveries: 0,
        deliveredBy: [],
      };
      return pushToast({ ...s, orders: [...s.orders, order] }, e, 'info', `Nueva comanda: ${d.title}`);
    }
    case 'order.taken': {
      const d = e.data as EventPayloads['order.taken'];
      const withPlayer = patchPlayer(s, d.playerId, { currentOrderId: d.orderId });
      const next = isMe(s, d.playerId) && s.me ? { ...withPlayer, me: { ...s.me, currentOrderId: d.orderId } } : withPlayer;
      return isMe(s, d.playerId) ? next : pushToast(next, e, 'info', `${nick(s, d.playerId)} está cocinando ${orderTitle(s, d.orderId)}`);
    }
    case 'order.delivered': {
      const d = e.data as EventPayloads['order.delivered'];
      const title = orderTitle(s, d.orderId);
      let n = patchPlayer(withScores(s, d.scores), d.playerId, { currentOrderId: null });
      n = {
        ...n,
        orders: n.orders.map((o) => {
          if (o.orderId !== d.orderId) return o;
          const deliveredBy = withDelivery(o.deliveredBy, d.playerId, d.rank);
          return { ...o, deliveredBy, deliveries: deliveredBy.length };
        }),
      };
      if (isMe(s, d.playerId)) {
        const mine = n.me?.currentOrderId === d.orderId;
        n = {
          ...n,
          me: n.me && mine ? { ...n.me, currentOrderId: null } : n.me,
          taken: mine ? null : n.taken,
        };
      }
      return pushToast(n, e, isMe(s, d.playerId) ? 'good' : 'info', `${nick(s, d.playerId)} entregó ${title} (Nº${d.rank}, +${d.points})`);
    }
    case 'dish.burned': {
      const d = e.data as EventPayloads['dish.burned'];
      return pushToast(withScores(s, d.scores), e, 'bad', `${nick(s, d.playerId)} sirvió un plato quemado (${d.penalty > 0 ? '-' : ''}${Math.abs(d.penalty)})`);
    }
    case 'order.expired': {
      const d = e.data as EventPayloads['order.expired'];
      const title = orderTitle(s, d.orderId);
      const mine = s.me?.currentOrderId === d.orderId;
      return pushToast(
        {
          ...s,
          orders: s.orders.filter((o) => o.orderId !== d.orderId),
          players: s.players.map((p) => (p.currentOrderId === d.orderId ? { ...p, currentOrderId: null } : p)),
          me: s.me && mine ? { ...s.me, currentOrderId: null } : s.me,
        },
        e,
        mine ? 'bad' : 'info',
        `El cliente se fue: ${title}`,
      );
    }
    case 'condiment.earned': {
      const d = e.data as EventPayloads['condiment.earned'];
      if (!isMe(s, d.playerId) || !s.me) return pushToast(s, e, 'info', `${nick(s, d.playerId)} ganó un condimento`);
      return pushToast(
        { ...s, me: { ...s.me, condiments: Math.min(MAX_CONDIMENTS, s.me.condiments + 1) } },
        e,
        'good',
        '¡Ganaste un condimento!',
      );
    }
    case 'sabotage.applied': {
      const d = e.data as EventPayloads['sabotage.applied'];
      const toMe = isMe(s, d.toPlayerId) && s.me;
      const fromMe = isMe(s, d.fromPlayerId) && s.me;
      let n = patchPlayer(s, d.toPlayerId, { sabotage: d.rule as SabotageRule });
      if (toMe) n = { ...n, me: { ...n.me!, sabotage: d.rule as SabotageRule } };
      if (fromMe) n = { ...n, me: { ...n.me!, condiments: Math.max(0, n.me!.condiments - 1) } };
      return pushToast(n, e, toMe ? 'bad' : 'info', `${nick(s, d.fromPlayerId)} saboteó a ${nick(s, d.toPlayerId)}: ${ruleLabel(d.rule)}`);
    }
    case 'sabotage.cleared': {
      const d = e.data as EventPayloads['sabotage.cleared'];
      const n = patchPlayer(s, d.playerId, { sabotage: null });
      return isMe(s, d.playerId) && n.me ? { ...n, me: { ...n.me, sabotage: null } } : n;
    }
    case 'rush.started':
      return pushToast({ ...s, rush: true }, e, 'bad', '¡Hora punta! Las comandas valen el doble');
    case 'game.finished': {
      const d = e.data as EventPayloads['game.finished'];
      return { ...withScores(s, d.scores), status: 'finished', podium: d.podium, awards: d.awards };
    }
    default:
      return s;
  }
}

/** Replays buffered events after a snapshot: drops seq <= snapSeq (already reflected), applies the rest in order. A gap un-syncs again. */
function replay(s: GameState, buffer: GameEvent[], snapSeq: number): GameState {
  const sorted = [...buffer].sort((a, b) => a.seq - b.seq);
  let cur = s;
  let last = snapSeq;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]!;
    if (e.seq <= last) continue; // included in the snapshot, or a duplicate
    if (e.seq !== last + 1) return { ...cur, synced: false, buffer: sorted.slice(i), lastSeq: last };
    last = e.seq;
    cur = reduceEvent(cur, e);
  }
  return { ...cur, lastSeq: last, buffer: [] };
}

/** Applies buffered events that are contiguous from lastSeq + 1 (state must be synced). */
function drain(s: GameState): GameState {
  if (s.lastSeq === null || !s.buffer.length) return s;
  const sorted = [...s.buffer].sort((a, b) => a.seq - b.seq);
  let cur = s;
  let last = s.lastSeq;
  let i = 0;
  for (; i < sorted.length; i++) {
    const e = sorted[i]!;
    if (e.seq <= last) continue;
    if (e.seq !== last + 1) break;
    cur = reduceEvent(cur, e);
    last = e.seq;
  }
  return { ...cur, lastSeq: last, buffer: sorted.slice(i) };
}

/** True while synced but waiting for missing seqs (the transport doesn't guarantee order within a batch). */
export const hasOpenGap = (s: GameState) => s.synced && s.buffer.length > 0;

/**
 * Sequencing front door for live events.
 * - not synced (snapshot pending): buffer; dup seqs dropped
 * - seq <= lastSeq: duplicate/old, ignored
 * - seq === lastSeq + 1: applied, then any contiguous buffered events are drained
 * - seq > lastSeq + 1: buffered while staying synced (reorder window). The controller gives the gap
 *   a short time to fill, then calls `markStale` to force a snapshot refetch.
 */
export function receiveEvent(s: GameState, e: GameEvent): GameState {
  if (s.buffer.some((b) => b.seq === e.seq)) return s;
  if (!s.synced || s.lastSeq === null) return { ...s, buffer: [...s.buffer, e] };
  if (e.seq <= s.lastSeq) return s;
  if (e.seq > s.lastSeq + 1) return { ...s, buffer: [...s.buffer, e] };
  return drain({ ...reduceEvent(s, e), lastSeq: e.seq });
}

/** The reorder window expired with the gap still open: wait for a fresh snapshot (buffer is kept). */
export const markStale = (s: GameState): GameState => ({ ...s, synced: false });

/** Marks that a snapshot fetch started: from now on events are buffered (they are replayed on top of it). */
export const beginSync = (s: GameState): GameState => ({ ...s, synced: false });

/**
 * Builds state from a snapshot (exact seq baseline: snap.seq) and replays the buffered events on top.
 * Live-only fields (taken, lastSubmit, toasts) survive; everything the server owns is replaced.
 */
export function applySnapshot(s: GameState, snap: GameSnapshot, offset: number): GameState {
  const base: GameState = {
    ...s,
    code: snap.code,
    clockOffset: offset,
    status: snap.status,
    hostPlayerId: snap.hostPlayerId,
    startedAt: snap.startedAt,
    rushAt: snap.rushAt,
    endsAt: snap.endsAt,
    rush: snap.rushAt !== null && snap.now >= snap.rushAt,
    players: snap.players,
    orders: snap.orders,
    me: snap.me ?? null,
    playerId: snap.me?.playerId ?? s.playerId,
    taken: snap.me?.currentOrderId && s.taken?.orderId === snap.me.currentOrderId ? s.taken : null,
    synced: true,
    lastSeq: snap.seq,
    buffer: [],
  };
  return replay(base, s.buffer, snap.seq);
}

export { initialState };
