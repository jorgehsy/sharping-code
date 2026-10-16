/**
 * Records the three lobby "Cómo se juega" clips into public/assets/howto/.
 *
 * Needs the mock dev server running (VITE_MOCK_ORDERS=true, the `web-mock` launch config) and the deployed API,
 * since creating/starting the game is real; orders, bots and condiments come from the mock.
 *
 *   BASE_URL=http://localhost:5175 pnpm --filter @sharping/web record:howto
 *
 * Plays one game in a single page (the mock lives in memory, so no reloads) and captures each clip with the
 * Chrome DevTools screencast, then encodes them with ffmpeg (must be on PATH).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type CDPSession, type Locator, type Page } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5175';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../public/assets/howto');
/** Small viewport so the UI reads big in the lobby panel; 2x pixels keeps the text sharp. */
const SIZE = { width: 1024, height: 576 };
const SCALE = 2;
/** Output width; height keeps 16:9. */
const OUT_WIDTH = 1024;

/** One-liners that read well on screen; the mock accepts anything with `return`. */
const SOLUTIONS: Record<string, string> = {
  'Suma de pares': 'return nums.reduce((a, b) => a + b, 0);',
  'Invertir palabras': "return s.split(' ').reverse().join(' ');",
  'Racha más larga': 'return Math.max(0, ...(s.match(/(.)\\1*/g) ?? []).map((r) => r.length));',
};

/** Fake cursor + click ripple: headless recordings don't draw the real pointer. */
const CURSOR = `
addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = \`
    #rec-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; transform: translate(-50px, -50px); }
    .rec-ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 36px; height: 36px; margin: -18px 0 0 -18px;
      border: 3px solid #f0a64a; border-radius: 50%; animation: rec-ripple 0.45s ease-out forwards; }
    @keyframes rec-ripple { from { transform: scale(0.3); opacity: 1; } to { transform: scale(1.2); opacity: 0; } }\`;
  document.head.append(style);
  const c = document.createElement('div');
  c.id = 'rec-cursor';
  c.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.6 L11 13.3 L17.5 13.3 Z" fill="#fff" stroke="#16121b" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.append(c);
  addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
  addEventListener('mousedown', (e) => {
    const r = document.createElement('div');
    r.className = 'rec-ripple';
    r.style.left = e.clientX + 'px';
    r.style.top = e.clientY + 'px';
    document.body.append(r);
    setTimeout(() => r.remove(), 500);
  }, true);
});`;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), 'howto-'));
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: SCALE });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  const rec = new Recorder(await context.newCDPSession(page), tmp);
  mkdirSync(OUT, { recursive: true });

  let mouse = { x: SIZE.width / 2, y: SIZE.height / 2 };
  const moveTo = async (target: Locator, steps = 30) => {
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    mouse = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(mouse.x, mouse.y, { steps });
  };
  const click = async (target: Locator) => {
    await moveTo(target);
    await pause(250);
    await page.mouse.down();
    await page.mouse.up();
  };

  try {
    await page.goto(BASE_URL);
    await page.getByLabel('Apodo').fill('Tú');
    await page.getByRole('button', { name: 'Crear partida' }).click();
    await page.getByRole('button', { name: 'Empezar partida' }).click({ timeout: 15_000 });
    await page.locator('.ticket').nth(3).waitFor({ timeout: 15_000 });
    await page.mouse.move(mouse.x, mouse.y);
    // Let the bots join and start cooking so the tickets look alive.
    await pause(5000);

    // 1. Look at the orders and take one.
    await rec.start();
    const tickets = page.locator('.ticket');
    for (let i = 0; i < Math.min(3, await tickets.count()); i++) {
      await moveTo(tickets.nth(i).locator('.title'), 25);
      await pause(500);
    }
    const first = await pickTicket(page, Object.keys(SOLUTIONS));
    await click(first.locator('button'));
    await page.locator('.monaco-editor .view-line', { hasText: 'TODO' }).waitFor();
    await pause(1200);
    await rec.stop('1-comandas');

    // 2. Write the solution, taste, deliver.
    await rec.start();
    const title = (await page.locator('.statement h2').textContent())!.trim();
    await moveTo(page.locator('.statement .examples'), 25);
    await pause(900);
    await click(page.locator('.monaco-editor .view-line', { hasText: 'TODO' }));
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.type(SOLUTIONS[title] ?? 'return 0;', { delay: 45 });
    await page.keyboard.press('Escape'); // close any suggestion popup
    await pause(500);
    await click(page.getByRole('button', { name: /^Degustar/ }));
    await page.locator('.work .result table').waitFor();
    await pause(1600);
    await click(page.getByRole('button', { name: /^Entregar/ }));
    // The editor empties right after a delivery; stop while the result and the toast are on screen.
    await page.locator('.result.good').waitFor();
    await pause(300);
    await rec.stop('2-codigo');

    // Off camera: two more deliveries; the third earns a condiment.
    await deliverQuickly(page);
    await deliverQuickly(page);
    await page.keyboard.press('Alt+KeyK');
    const curse = page.locator('.board .curse-btn').first();
    await curse.waitFor();

    // 3. Curse a rival with the condiment.
    await rec.start();
    await pause(400);
    await moveTo(page.locator('.hud .flasks'), 25);
    await pause(1200);
    await click(curse);
    await page.locator('.board .cursed').first().waitFor();
    await moveTo(page.locator('.board .cursed').first(), 20);
    await pause(2500);
    await rec.stop('3-condimentos');
  } catch (e) {
    const shot = join(tmp, 'failure.png');
    await page.screenshot({ path: shot }).catch(() => {});
    console.error(`Failed; screenshot at ${shot}`);
    throw e;
  } finally {
    await context.close();
    await browser.close();
  }
  rmSync(tmp, { recursive: true, force: true });
}

/** DevTools screencast: frames arrive only when the screen changes, each with its own timestamp. */
class Recorder {
  private frames: { data: string; t: number }[] = [];
  private n = 0;
  private readonly cdp: CDPSession;
  private readonly tmp: string;

  constructor(cdp: CDPSession, tmp: string) {
    this.cdp = cdp;
    this.tmp = tmp;
    cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      this.frames.push({ data, t: metadata.timestamp ?? Date.now() / 1000 });
      void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
  }

  async start() {
    this.frames = [];
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: SIZE.width * SCALE, maxHeight: SIZE.height * SCALE });
  }

  async stop(name: string) {
    const end = Date.now() / 1000;
    await this.cdp.send('Page.stopScreencast');
    const dir = join(this.tmp, String(this.n++));
    mkdirSync(dir);
    // ffmpeg concat list: every frame lasts until the next one arrives.
    const lines: string[] = [];
    this.frames.forEach((f, i) => {
      const file = join(dir, `${i}.jpg`);
      writeFileSync(file, Buffer.from(f.data, 'base64'));
      const next = this.frames[i + 1]?.t ?? end;
      lines.push(`file '${file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(3)}`);
    });
    lines.push(`file '${join(dir, `${this.frames.length - 1}.jpg`)}'`);
    const list = join(dir, 'list.txt');
    writeFileSync(list, lines.join('\n'));
    const out = join(OUT, `${name}.mp4`);
    execFileSync('ffmpeg', [
      '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list,
      '-vf', `fps=24,scale=${OUT_WIDTH}:-2:flags=lanczos`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
      out,
    ]);
    const secs = this.frames.length ? end - this.frames[0]!.t : 0;
    console.log(`${out} (${secs.toFixed(1)}s, ${this.frames.length} frames)`);
  }
}

/** A ticket I can still take, preferring the given titles. */
async function pickTicket(page: Page, prefer: string[]): Promise<Locator> {
  const open = page.locator('.ticket').filter({ has: page.getByRole('button', { name: 'Tomar' }) });
  for (const t of prefer) {
    const hit = open.filter({ has: page.locator('.title', { hasText: t }) });
    if (await hit.count()) return hit.first();
  }
  await open.first().waitFor();
  return open.first();
}

async function replaceSource(page: Page) {
  await page.locator('.monaco-editor .view-line', { hasText: 'TODO' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.insertText('return 1;');
}

async function deliverQuickly(page: Page) {
  await page.keyboard.press('Alt+KeyK');
  await page.locator('.ticket').first().waitFor();
  const t = await pickTicket(page, []);
  await t.locator('button').click();
  await replaceSource(page);
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.locator('.result.good').waitFor();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
