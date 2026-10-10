import type { EventPayloads, GameEvent } from '@sharping/shared';
import Phaser from 'phaser';
import type { GameState } from '../store/state.ts';
import type { GameStore } from '../store/store.ts';
import { serverNow } from '../store/time.ts';
import { ATLAS_URL } from './frames.ts';
import { chefX, heroForIndex, HEROES, MAX_CHEFS, type Hero } from './heroes.ts';
import { assignSlots, SCENE_H, SCENE_SCALE, SCENE_W, slotX } from './layout.ts';
import { ALL_MONSTERS, hashString, monsterFor, type Difficulty } from './monsters.ts';
import { isFull, isUrgent, MAX_DELIVERIES } from './points.ts';

/**
 * The tavern: back wall, 10 hero chefs behind a counter, monster customers on the floor in front.
 * It only DISPLAYS state. Steady state (who stands where, tints, rush, urgency) is read from the store;
 * one-shot effects (potions flying, bursts, floating numbers) come from live events.
 *
 * Scene coordinates are native pixels (320x192, 16 px tiles). The canvas is 960x576 and the main camera
 * zooms x3, so sprites stay crisp and text can be drawn at full resolution (see `floater`).
 */

export interface KitchenDeps {
  store: GameStore;
  /** Subscribes to live events (one-shot FX). Returns the unsubscribe function. */
  onLiveEvent: (listener: (e: GameEvent) => void) => () => void;
  /** Overrides `prefers-reduced-motion` (tests/debug). */
  reducedMotion?: boolean;
}

export const ATLAS_JSON_URL = '/assets/0x72/dungeon.json';
const KEY = 'dungeon';
const PX = 'px';
export const CANVAS_W = SCENE_W * SCENE_SCALE;
export const CANVAS_H = SCENE_H * SCENE_SCALE;

const COUNTER_Y = 92;
const CHEF_FOOT_Y = 100;
const CUSTOMER_FOOT_Y = 168;
const ARRIVE_SPEED = 0.09; // native px per ms
const LEAVE_SPEED = 0.11;

const D = { room: 0, chef: 10, marker: 12, counter: 20, customer: 30, potion: 31, fx: 40, projectile: 45, heart: 50, rush: 55, text: 60 } as const;

const C = {
  torch: 0xf0a64a,
  blood: 0xd6493f,
  curse: 0xa76be3,
  hitAdd: 0x999999,
  urgent: 0xff6a5e,
  ink: '#16121b',
} as const;

type FxName = 'deliverMine' | 'deliverOther' | 'curseBurst' | 'curseClear' | 'smoke' | 'trailGreen' | 'trailPurple';

const num = (hex: string) => parseInt(hex.slice(1), 16);
const palette = (...hex: string[]) => hex.map(num);

interface FxRecipe {
  tint: number[];
  speed: number; // px per frame at 60 fps (the mockup's unit)
  grav: number; // px per frame^2
  life: number;
  bias?: number; // upward kick, px per frame
}

const RECIPES: Record<FxName, FxRecipe> = {
  deliverMine: { tint: palette('#6cc36a', '#b6f0a0', '#ffffff', '#f0d060'), speed: 1.6, grav: 0.05, life: 600, bias: 0.6 },
  deliverOther: { tint: palette('#6cc36a', '#b6f0a0'), speed: 1, grav: 0.05, life: 600, bias: 0.6 },
  curseBurst: { tint: palette('#a76be3', '#5b2c8a', '#e0c0ff'), speed: 1.4, grav: 0.05, life: 600, bias: 0.6 },
  curseClear: { tint: palette('#a76be3', '#ffffff'), speed: 1, grav: 0.05, life: 600, bias: 0.6 },
  smoke: { tint: palette('#7a7a7a', '#9a9a9a', '#5a5a5a'), speed: 1, grav: -0.02, life: 900, bias: 0.6 },
  trailGreen: { tint: palette('#b6f0a0'), speed: 0, grav: 0, life: 250 },
  trailPurple: { tint: palette('#a76be3'), speed: 0, grav: 0, life: 250 },
};

const FPS = 60; // the mockup integrates per 16 ms frame
const perSec = (pxPerFrame: number) => pxPerFrame * FPS;

interface Chef {
  id: string;
  hero: Hero;
  sprite: Phaser.GameObjects.Sprite;
  cx: number;
  index: number;
  hitUntil: number;
  burnUntil: number;
  /** Sabotage flag from the store. */
  cursed: boolean;
  /** The curse only shows once the red potion landed. */
  curseFrom: number;
  skull?: Phaser.GameObjects.Image;
  anim: 'idle' | 'hit';
  fire?: Phaser.GameObjects.Particles.ParticleEmitter;
  smoke?: Phaser.GameObjects.Particles.ParticleEmitter;
}

interface Customer {
  orderId: string;
  seq: number;
  kind: string;
  slot: number;
  x: number;
  state: 'arrive' | 'idle' | 'leave';
  sprite: Phaser.GameObjects.Sprite;
  anim: 'idle' | 'run';
  potions: Phaser.GameObjects.Image[];
  /** Potions currently stacked (advances when a thrown potion lands, not when the state changes). */
  shown: number;
  /** Potions in flight towards this customer. */
  pending: number;
  happyUntil: number;
  fullStarted: boolean;
  mark: Phaser.GameObjects.Rectangle;
  order: GameState['orders'][number];
  dead: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** White blended towards `rgb` by t (a multiply tint that fades in). */
function mixWhite(rgb: number, t: number): number {
  const ch = (shift: number) => Math.round(lerp(255, (rgb >> shift) & 255, t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export class KitchenScene extends Phaser.Scene {
  private readonly deps: KitchenDeps;
  private reduce = false;
  private dirty = true;
  private ready = false;
  private unsubs: Array<() => void> = [];

  private chefs = new Map<string, Chef>();
  private customers = new Map<string, Customer>();
  private slots = new Map<string, number>();
  /** Orders whose customer already left (or never showed because the order was full): never spawn again. */
  private gone = new Set<string>();
  /** Orders announced by a live `order.opened`: their customer runs in instead of standing there already. */
  private arriving = new Set<string>();
  private customerSeq = 0;

  private fountains: Array<{ sprite: Phaser.GameObjects.Sprite; part: 'mid' | 'basin' }> = [];
  private rushOn = false;
  private rushOverlay!: Phaser.GameObjects.Rectangle;
  private rushBorders: Phaser.GameObjects.Rectangle[] = [];
  private arrow!: Phaser.GameObjects.Graphics;
  private fx = {} as Record<FxName, Phaser.GameObjects.Particles.ParticleEmitter>;

  constructor(deps: KitchenDeps) {
    super('kitchen');
    this.deps = deps;
  }

  preload() {
    this.load.atlas(KEY, ATLAS_URL, ATLAS_JSON_URL);
  }

  create() {
    this.reduce = this.deps.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const cam = this.cameras.main;
    cam.setZoom(SCENE_SCALE);
    cam.centerOn(SCENE_W / 2, SCENE_H / 2);

    this.makeAnimations();
    this.makeParticleTexture();
    this.buildRoom();
    this.buildCounter();
    this.buildFx();
    this.buildRush();
    this.arrow = this.add.graphics().setDepth(D.marker);

    this.unsubs.push(
      this.deps.store.subscribe(() => (this.dirty = true)),
      this.deps.onLiveEvent((e) => this.onLive(e)),
    );
    const cleanup = () => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.ready = true;
  }

  update(time: number, delta: number) {
    if (!this.ready) return;
    const state = this.deps.store.getState();
    if (this.dirty) {
      this.dirty = false;
      this.reconcile(state);
    }
    const dt = Math.min(50, delta);
    this.updateChefs(time, state);
    this.updateCustomers(time, dt, state);
    this.updateRush(time);
  }

  // ---------------------------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------------------------

  private frameNames = new Set<string>();

  private seq(base: string) {
    if (!this.frameNames.size) this.textures.get(KEY).getFrameNames().forEach((n) => this.frameNames.add(n));
    const out: Array<{ key: string; frame: string }> = [];
    for (let i = 0; this.frameNames.has(`${base}_f${i}`); i++) out.push({ key: KEY, frame: `${base}_f${i}` });
    return out.length ? out : [{ key: KEY, frame: base }];
  }

  private makeAnim(base: string, frameRate: number) {
    if (this.anims.exists(base)) return;
    this.anims.create({ key: base, frames: this.seq(base), frameRate, repeat: -1 });
  }

  private makeAnimations() {
    for (const h of HEROES) {
      this.makeAnim(`${h}_idle_anim`, 7);
      this.makeAnim(`${h}_hit_anim`, 7);
    }
    for (const m of ALL_MONSTERS) {
      this.makeAnim(`${m}_idle_anim`, 7);
      this.makeAnim(`${m}_run_anim`, 12);
    }
    for (const col of ['blue', 'red']) {
      this.makeAnim(`wall_fountain_mid_${col}_anim`, 6);
      this.makeAnim(`wall_fountain_basin_${col}_anim`, 6);
    }
  }

  /** Loops `key` on a sprite; with reduced motion it stays on one frame. */
  private loop(sprite: Phaser.GameObjects.Sprite, key: string, startFrame = 0) {
    sprite.play({ key, startFrame });
    if (this.reduce) sprite.anims.pause();
  }

  private makeParticleTexture() {
    if (this.textures.exists(PX)) return;
    const tex = this.textures.createCanvas(PX, 2, 2);
    if (!tex) return;
    const ctx = tex.getContext();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 2, 2);
    tex.refresh();
  }

  private img(name: string, x: number, y: number, depth: number) {
    return this.add.image(x, y, KEY, name).setOrigin(0, 0).setDepth(depth);
  }

  private buildRoom() {
    const floors = ['floor_2', 'floor_3', 'floor_4', 'floor_5', 'floor_6', 'floor_7', 'floor_8'];
    for (let r = 2; r < 12; r++) {
      for (let c = 0; c < 20; c++) {
        const h = hashString(`${r},${c}`);
        this.img(h % 4 === 0 ? floors[(h >>> 3) % floors.length]! : 'floor_1', c * 16, r * 16, D.room);
      }
    }
    for (let c = 0; c < 20; c++) {
      this.img('wall_top_mid', c * 16, 0, D.room);
      this.img('wall_mid', c * 16, 16, D.room);
    }
    for (const [c, n] of [[2, 'wall_banner_red'], [6, 'wall_banner_blue'], [13, 'wall_banner_green'], [17, 'wall_banner_yellow']] as const) {
      this.img(n, c * 16, 16, D.room + 1);
    }
    for (const c of [9, 10]) {
      this.img('wall_fountain_top_1', c * 16, 0, D.room + 1);
      for (const [part, y] of [['mid', 16], ['basin', 32]] as const) {
        const s = this.add.sprite(c * 16, y, KEY).setOrigin(0, 0).setDepth(D.room + 1);
        this.loop(s, `wall_fountain_${part}_blue_anim`);
        this.fountains.push({ sprite: s, part });
      }
    }
    this.img('crate', 0, 34, D.room + 1);
    this.img('crate', 304, 34, D.room + 1);
    this.img('skull', 290, 40, D.room + 1);
  }

  private buildCounter() {
    for (let c = 0; c < 20; c++) {
      this.img('wall_top_mid', c * 16, COUNTER_Y, D.counter);
      this.img('wall_mid', c * 16, COUNTER_Y + 16, D.counter);
    }
    for (const [name, x] of [['flask_blue', 60], ['flask_yellow', 128], ['weapon_cleaver', 192], ['flask_green', 250]] as const) {
      const h = this.textures.getFrame(KEY, name).height;
      this.img(name, x, 100 - h, D.counter + 1);
    }
  }

  private buildFx() {
    for (const [name, r] of Object.entries(RECIPES) as Array<[FxName, FxRecipe]>) {
      const v = perSec(r.speed);
      const bias = perSec(r.bias ?? 0);
      this.fx[name] = this.add
        .particles(0, 0, PX, {
          emitting: false,
          lifespan: { min: r.life * 0.6, max: r.life * 1.2 },
          speedX: { min: -v * 1.4, max: v * 1.4 },
          speedY: { min: -v * 1.4 - bias, max: v * 1.4 - bias },
          gravityY: r.grav * FPS * FPS,
          alpha: { start: 1, end: 0, ease: 'quad.in' },
          scale: { onEmit: () => (Math.random() < 0.3 ? 2 : 1) },
          tint: r.tint,
        })
        .setDepth(D.fx);
    }
  }

  private buildRush() {
    const make = (x: number, y: number, w: number, h: number) =>
      this.add.rectangle(x, y, w, h, C.blood).setOrigin(0, 0).setDepth(D.rush).setAlpha(0).setVisible(false);
    this.rushOverlay = make(0, 0, SCENE_W, SCENE_H);
    this.rushBorders = [make(0, 0, SCENE_W, 2), make(0, SCENE_H - 2, SCENE_W, 2), make(0, 0, 2, SCENE_H), make(SCENE_W - 2, 0, 2, SCENE_H)];
  }

  // ---------------------------------------------------------------------------------------------
  // Store -> scene (steady state)
  // ---------------------------------------------------------------------------------------------

  private reconcile(s: GameState) {
    // Chefs: one per player, in join order, centred behind the counter.
    const crew = s.players.slice(0, MAX_CHEFS);
    const keep = new Set<string>();
    crew.forEach((p, i) => {
      keep.add(p.playerId);
      let chef = this.chefs.get(p.playerId);
      if (!chef) chef = this.addChef(p.playerId, i, crew.length);
      const cx = chefX(i, crew.length);
      if (chef.cx !== cx) {
        chef.cx = cx;
        if (this.reduce) chef.sprite.x = cx;
        else this.tweens.add({ targets: chef.sprite, x: cx, duration: 250, ease: 'Sine.easeInOut' });
      }
      chef.index = i;
      chef.cursed = !!p.sabotage;
    });
    for (const [id, chef] of this.chefs) {
      if (keep.has(id)) continue;
      this.destroyChef(chef);
      this.chefs.delete(id);
    }

    this.setRush(s.rush);

    // Customers: one per open order that isn't full yet.
    const live = new Map(s.orders.map((o) => [o.orderId, o]));
    for (const id of [...this.gone]) if (!live.has(id)) this.gone.delete(id);
    for (const id of [...this.arriving]) if (!live.has(id)) this.arriving.delete(id);
    for (const o of s.orders) if (isFull(o) && !this.customers.has(o.orderId)) this.gone.add(o.orderId);

    const wanted = [...this.customers.keys(), ...s.orders.filter((o) => !this.customers.has(o.orderId) && !this.gone.has(o.orderId)).map((o) => o.orderId)];
    this.slots = assignSlots(this.slots, wanted);

    for (const o of s.orders) {
      const existing = this.customers.get(o.orderId);
      if (existing) {
        existing.order = o;
        if (existing.pending === 0) {
          const target = Math.min(MAX_DELIVERIES, o.deliveredBy.length);
          if (existing.shown !== target) {
            existing.shown = target;
            this.syncPotions(existing);
          }
        }
        this.maybeFull(existing);
        continue;
      }
      const slot = this.slots.get(o.orderId);
      if (slot === undefined || this.gone.has(o.orderId)) continue;
      this.spawnCustomer(o, slot, this.arriving.delete(o.orderId) && !this.reduce);
    }
    for (const c of this.customers.values()) {
      if (!live.has(c.orderId) && c.state !== 'leave') this.leave(c); // closed without us noticing (snapshot)
    }
  }

  private addChef(id: string, index: number, count: number): Chef {
    const hero = heroForIndex(index);
    const cx = chefX(index, count);
    const sprite = this.add.sprite(cx, CHEF_FOOT_Y, KEY).setOrigin(0.5, 1).setDepth(D.chef);
    this.loop(sprite, `${hero}_idle_anim`, index % 4);
    const chef: Chef = { id, hero, sprite, cx, index, hitUntil: 0, burnUntil: 0, cursed: false, curseFrom: 0, anim: 'idle' };
    this.chefs.set(id, chef);
    return chef;
  }

  private destroyChef(chef: Chef) {
    chef.skull?.destroy();
    chef.fire?.destroy();
    chef.smoke?.destroy();
    chef.sprite.destroy();
  }

  private spawnCustomer(order: Customer['order'], slot: number, arrive: boolean) {
    const kind = monsterFor(order.orderId, order.difficulty as Difficulty);
    const x = arrive ? SCENE_W + 30 : slotX(slot);
    const sprite = this.add.sprite(x, CUSTOMER_FOOT_Y, KEY).setOrigin(0.5, 1).setDepth(D.customer);
    const seq = ++this.customerSeq;
    const mark = this.add.rectangle(0, 170, 13, 1, C.torch).setOrigin(0, 0).setDepth(D.marker).setVisible(false);
    const c: Customer = {
      orderId: order.orderId,
      seq,
      kind,
      slot,
      x,
      state: arrive ? 'arrive' : 'idle',
      sprite,
      anim: arrive ? 'run' : 'idle',
      potions: [],
      shown: 0,
      pending: 0,
      happyUntil: 0,
      fullStarted: false,
      mark,
      order,
      dead: false,
    };
    sprite.setFlipX(arrive);
    this.loop(sprite, `${kind}_${c.anim}_anim`, seq % 4);
    this.customers.set(order.orderId, c);
    c.shown = arrive ? 0 : Math.min(MAX_DELIVERIES, order.deliveredBy.length);
    this.syncPotions(c);
    return c;
  }

  private syncPotions(c: Customer) {
    while (c.potions.length > c.shown) c.potions.pop()!.destroy();
    while (c.potions.length < c.shown) {
      const k = c.potions.length;
      c.potions.push(this.img('flask_green', c.x + 6 + k * 7, 154, D.potion));
    }
  }

  private setRush(on: boolean) {
    if (on === this.rushOn) return;
    this.rushOn = on;
    const col = on ? 'red' : 'blue';
    for (const f of this.fountains) this.loop(f.sprite, `wall_fountain_${f.part}_${col}_anim`);
    this.rushOverlay.setVisible(on);
    this.rushBorders.forEach((b) => b.setVisible(on));
  }

  // ---------------------------------------------------------------------------------------------
  // Per-frame
  // ---------------------------------------------------------------------------------------------

  private updateChefs(now: number, s: GameState) {
    this.arrow.clear();
    for (const chef of this.chefs.values()) {
      const hit = now < chef.hitUntil;
      const want = hit ? 'hit' : 'idle';
      if (want !== chef.anim) {
        chef.anim = want;
        this.loop(chef.sprite, `${chef.hero}_${want}_anim`, chef.index % 4);
      }
      const curse = chef.cursed && now >= chef.curseFrom;
      if (curse) {
        chef.sprite.setTint(mixWhite(C.curse, this.reduce ? 0.75 : 0.75 + 0.15 * Math.sin(now / 150))).setTintMode(Phaser.TintModes.MULTIPLY);
      } else if (hit) {
        chef.sprite.setTint(C.hitAdd).setTintMode(Phaser.TintModes.ADD);
      } else if (chef.sprite.isTinted) {
        chef.sprite.clearTint();
      }
      if (curse) {
        chef.skull ??= this.img('skull', 0, 0, D.marker).setAlpha(0.9);
        chef.skull.setVisible(true).setPosition(chef.cx - 8, 52 + (this.reduce ? 0 : Math.round(Math.sin(now / 220) * 2)) - 14);
      } else chef.skull?.setVisible(false);

      if (chef.id === s.playerId) {
        const y = 46 + (this.reduce ? 0 : Math.round(Math.sin(now / 180) * 2));
        this.arrow
          .fillStyle(C.torch)
          .fillRect(chef.cx - 3, y, 7, 2)
          .fillRect(chef.cx - 2, y + 2, 5, 1)
          .fillRect(chef.cx - 1, y + 3, 3, 1)
          .fillRect(chef.cx, y + 4, 1, 1);
      }
    }
  }

  private updateCustomers(now: number, dt: number, s: GameState) {
    const sNow = serverNow(s.clockOffset, Date.now());
    for (const c of [...this.customers.values()]) {
      const tx = slotX(c.slot);
      if (c.state === 'arrive') {
        c.x -= dt * ARRIVE_SPEED;
        if (c.x <= tx) {
          c.x = tx;
          c.state = 'idle';
        }
      } else if (c.state === 'leave') {
        c.x += dt * LEAVE_SPEED;
        if (c.x > SCENE_W + 40) {
          this.removeCustomer(c);
          continue;
        }
      }
      const moving = c.state !== 'idle';
      const want = moving ? 'run' : 'idle';
      if (want !== c.anim) {
        c.anim = want;
        c.sprite.setFlipX(c.state === 'arrive');
        this.loop(c.sprite, `${c.kind}_${want}_anim`, c.seq % 4);
      }

      let dx = 0;
      let tint = false;
      if (c.state === 'idle' && isUrgent(c.order.expiresAt - sNow)) {
        if (this.reduce) tint = true;
        else {
          dx = Math.round(Math.sin(now / 30));
          tint = Math.floor(now / 200) % 2 === 1;
        }
      }
      if (tint) c.sprite.setTint(C.urgent).setTintMode(Phaser.TintModes.MULTIPLY);
      else if (c.sprite.isTinted) c.sprite.clearTint();

      const dy = !this.reduce && now < c.happyUntil ? -Math.round(Math.abs(Math.sin((c.happyUntil - now) / 70)) * 4) : 0;
      c.sprite.setPosition(Math.round(c.x + dx), CUSTOMER_FOOT_Y + dy);
      c.potions.forEach((p, k) => p.setPosition(Math.round(c.x + 6 + k * 7), 154));
      const mine = c.state === 'idle' && s.me?.currentOrderId === c.orderId;
      c.mark.setVisible(mine).setPosition(Math.round(c.x - 6), 170);
    }
  }

  private updateRush(now: number) {
    if (!this.rushOn) return;
    const a = this.reduce ? 0.16 : 0.12 + 0.08 * Math.sin(now / 160);
    this.rushOverlay.setAlpha(a);
    this.rushBorders.forEach((b) => b.setAlpha(a + 0.15));
  }

  // ---------------------------------------------------------------------------------------------
  // Customers leaving
  // ---------------------------------------------------------------------------------------------

  private leave(c: Customer) {
    if (c.dead || c.state === 'leave') return;
    c.state = 'leave';
    c.mark.setVisible(false);
    c.shown = 0;
    this.syncPotions(c);
    this.gone.add(c.orderId);
    if (this.reduce) this.removeCustomer(c);
  }

  private removeCustomer(c: Customer) {
    c.dead = true;
    c.sprite.destroy();
    c.mark.destroy();
    c.potions.forEach((p) => p.destroy());
    c.potions = [];
    this.customers.delete(c.orderId);
  }

  /** 3/3: hearts, then the monster leaves (its ticket falls in the HTML rail at the same time). */
  private maybeFull(c: Customer) {
    if (c.fullStarted || c.dead || c.pending > 0 || c.shown < MAX_DELIVERIES || !isFull(c.order)) return;
    c.fullStarted = true;
    for (let k = 0; k < 5; k++) this.heart(c.x, k * 120);
    this.time.delayedCall(1100, () => this.leave(c));
  }

  // ---------------------------------------------------------------------------------------------
  // Live events -> one-shot FX
  // ---------------------------------------------------------------------------------------------

  private nick(id: string) {
    return this.deps.store.getState().players.find((p) => p.playerId === id)?.nickname ?? 'Alguien';
  }

  private isMe(id: string) {
    return this.deps.store.getState().playerId === id;
  }

  private onLive(e: GameEvent) {
    if (!this.ready) return;
    switch (e.type) {
      case 'order.opened':
        this.arriving.add((e.data as EventPayloads['order.opened']).orderId);
        break;
      case 'order.delivered':
        this.onDelivered(e.data as EventPayloads['order.delivered']);
        break;
      case 'order.expired':
        this.onExpired((e.data as EventPayloads['order.expired']).orderId);
        break;
      case 'dish.burned':
        this.onBurned(e.data as EventPayloads['dish.burned']);
        break;
      case 'sabotage.applied':
        this.onSabotage(e.data as EventPayloads['sabotage.applied']);
        break;
      case 'sabotage.cleared':
        this.onCleared((e.data as EventPayloads['sabotage.cleared']).playerId);
        break;
      case 'rush.started':
        this.shake(400);
        break;
    }
  }

  private shake(ms: number) {
    if (!this.reduce) this.cameras.main.shake(ms, 0.003);
  }

  private onDelivered(d: EventPayloads['order.delivered']) {
    const c = this.customers.get(d.orderId);
    if (!c || c.dead || c.state === 'leave') return;
    const chef = this.chefs.get(d.playerId);
    const mine = this.isMe(d.playerId);
    c.pending++;
    const land = () => {
      c.pending = Math.max(0, c.pending - 1);
      if (c.dead) return;
      c.shown = Math.min(MAX_DELIVERIES, c.shown + 1);
      this.syncPotions(c);
      if (!this.reduce) c.happyUntil = this.time.now + 700;
      if (mine) {
        this.floater(`+${d.points}`, c.x, 120, '#f0a64a', 30);
        this.burst('deliverMine', c.x, 140, 22);
      } else {
        this.floater(`${this.nick(d.playerId)} +${d.points}`, c.x, 124, '#cfc4d9', 15);
        this.burst('deliverOther', c.x, 140, 8);
      }
      this.maybeFull(c);
    };
    if (chef && !this.reduce) this.throwFlask('flask_big_green', 'trailGreen', { x: chef.cx, y: 78 }, { x: c.x, y: 140 }, 550, land);
    else land();
  }

  private onExpired(orderId: string) {
    const c = this.customers.get(orderId);
    if (!c || c.dead || c.state === 'leave') return;
    this.burst('smoke', c.x, 150, 18);
    this.floater('se fue', c.x, 130, '#a89db4', 18);
    this.leave(c);
  }

  private onBurned(d: EventPayloads['dish.burned']) {
    const chef = this.chefs.get(d.playerId);
    if (!chef) return;
    const now = this.time.now;
    chef.hitUntil = now + 500;
    chef.burnUntil = now + 1400;
    this.floater(`-${Math.abs(d.penalty)}`, chef.cx, 50, '#d6493f', this.isMe(d.playerId) ? 24 : 15);
    if (this.reduce) return;
    this.startFire(chef);
  }

  private startFire(chef: Chef) {
    chef.fire?.destroy();
    chef.smoke?.destroy();
    const fire = this.add
      .particles(chef.cx, 98, PX, {
        frequency: 16,
        quantity: 3,
        x: { min: -7, max: 7 },
        lifespan: { min: 380, max: 680 },
        speedX: { min: -0.15 * FPS, max: 0.15 * FPS },
        speedY: { min: perSec(-1.3), max: perSec(-0.5) },
        gravityY: -0.005 * FPS * FPS,
        alpha: { start: 1, end: 0, ease: 'quad.in' },
        scale: { onEmit: () => (Math.random() < 0.4 ? 2 : 1) },
        tint: palette('#ffdd57', '#f0a64a', '#e0552e', '#c2311f'),
      })
      .setDepth(D.fx);
    const smoke = this.add
      .particles(chef.cx, 76, PX, {
        frequency: 33,
        x: { min: -5, max: 5 },
        lifespan: 900,
        speedX: { min: -0.2 * FPS, max: 0.2 * FPS },
        speedY: -0.4 * FPS,
        gravityY: -0.004 * FPS * FPS,
        alpha: { start: 1, end: 0, ease: 'quad.in' },
        scale: 2,
        tint: palette('#4a4a4a', '#6a6a6a', '#2e2e2e'),
      })
      .setDepth(D.fx);
    chef.fire = fire;
    chef.smoke = smoke;
    this.time.delayedCall(1400, () => {
      fire.stop();
      smoke.stop();
      this.time.delayedCall(1000, () => {
        fire.destroy();
        smoke.destroy();
        if (chef.fire === fire) chef.fire = chef.smoke = undefined;
      });
    });
  }

  private onSabotage(d: EventPayloads['sabotage.applied']) {
    const from = this.chefs.get(d.fromPlayerId);
    const to = this.chefs.get(d.toPlayerId);
    const toMe = this.isMe(d.toPlayerId);
    const text = toMe ? `${this.nick(d.fromPlayerId)} te maldijo` : `${this.nick(d.fromPlayerId)} maldijo a ${this.nick(d.toPlayerId)}`;
    if (to) this.floater(text, to.cx, 30, '#a76be3', toMe ? 18 : 12);
    if (!to) return;
    const land = () => {
      this.burst('curseBurst', to.cx, 70, 24);
      to.hitUntil = this.time.now + 700;
      if (toMe) this.shake(250);
    };
    // The curse tint appears when the potion lands.
    to.curseFrom = this.time.now + (from && !this.reduce ? 700 : 0);
    if (from && !this.reduce) this.throwFlask('flask_big_red', 'trailPurple', { x: from.cx, y: 70 }, { x: to.cx, y: 70 }, 700, land);
    else land();
  }

  private onCleared(playerId: string) {
    const chef = this.chefs.get(playerId);
    if (!chef) return;
    chef.curseFrom = 0;
    this.burst('curseClear', chef.cx, 70, 12);
  }

  // ---------------------------------------------------------------------------------------------
  // FX helpers
  // ---------------------------------------------------------------------------------------------

  private burst(name: FxName, x: number, y: number, n: number) {
    if (this.reduce) return;
    this.fx[name].explode(n, x, y);
  }

  /** Text at full screen resolution: drawn big, scaled 1/3 (the camera zooms x3 back). */
  private floater(text: string, x: number, y: number, color: string, size = 24) {
    const t = this.add
      .text(Math.round(x), Math.round(y), text, { fontFamily: 'Silkscreen, monospace', fontSize: `${size}px`, color })
      .setOrigin(0.5, 1)
      .setScale(1 / SCENE_SCALE)
      .setShadow(3, 3, C.ink, 0, true, true)
      .setDepth(D.text);
    if (this.reduce) {
      this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 400, onComplete: () => t.destroy() });
      return;
    }
    this.tweens.add({ targets: t, y: y - 32, duration: 1300, ease: 'Linear' });
    this.tweens.add({ targets: t, alpha: 0, delay: 800, duration: 500, onComplete: () => t.destroy() });
  }

  private heart(x: number, delay: number) {
    const baseX = x + (Math.random() - 0.5) * 16;
    const h = this.add.image(baseX, 130, KEY, 'ui_heart_full').setDepth(D.heart).setAlpha(0);
    this.time.delayedCall(delay, () => {
      h.setAlpha(1);
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 1000,
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          h.setAlpha(1 - t);
          if (!this.reduce) h.setPosition(Math.round(baseX + Math.sin((t * 1000) / 120) * 3), Math.round(130 - t * 40));
        },
        onComplete: () => h.destroy(),
      });
    });
  }

  private throwFlask(sprite: string, trail: FxName, from: { x: number; y: number }, to: { x: number; y: number }, duration: number, onHit: () => void) {
    const img = this.add.image(from.x, from.y, KEY, sprite).setDepth(D.projectile);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        const x = lerp(from.x, to.x, t);
        const y = lerp(from.y, to.y, t) - Math.sin(t * Math.PI) * 38;
        img.setPosition(Math.round(x), Math.round(y)).setAngle(Math.round(t * 8) * 45);
        if (Math.random() < 0.6) this.fx[trail].explode(1, x, y);
      },
      onComplete: () => {
        img.destroy();
        onHit();
      },
    });
  }
}
