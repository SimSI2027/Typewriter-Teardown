#!/usr/bin/env node
// Production tests in Chromium (Playwright) against dist/, served under the GitHub Pages base path.
//   npm run build && npm run test:e2e        [--url https://…/Typewriter-Teardown/] to test a deployed site
// Exercises every visible control, typing, the machine's keys, orbit/zoom, tour hand-over and recovery, quality tiers,
// responsive layouts and reduced motion; fails on console errors, failed requests or local-path leaks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {serve} from '../../scripts/serve.mjs';

const argv = process.argv.slice(2);
const remote = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : null;
const ARGS = [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
const results = [];
const shots = path.resolve('validation/e2e');
fs.mkdirSync(shots, {recursive: true});

let srv = null;
let BASE = remote;
if (!remote) {
  assert.ok(fs.existsSync('dist/index.html'), 'run npm run build first');
  srv = await serve({dir: 'dist', base: '/Typewriter-Teardown/'});
  BASE = srv.url;
}
const browser = await chromium.launch({args: ARGS});

async function open(opts = {}) {
  const ctx = await browser.newContext({viewport: opts.viewport || {width: 1600, height: 900}, reducedMotion: opts.reducedMotion || 'no-preference', hasTouch: !!opts.touch, isMobile: !!opts.mobile, deviceScaleFactor: opts.dpr || 1});
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('request failed: ' + r.url()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()}: ${r.url()}`));
  await page.goto(opts.url || BASE);
  await page.waitForFunction(() => window.LIVE && window.SIM_SHOWN, null, {timeout: 90000});
  await page.waitForTimeout(400);
  return {page, ctx, errors};
}
async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({name, ok: true, ms: Date.now() - t0});
    console.log(`✔ ${name}`);
  } catch (e) {
    results.push({name, ok: false, ms: Date.now() - t0, err: e.message});
    console.log(`✖ ${name}\n   ${e.message.split('\n').join('\n   ')}`);
  }
}
const L = (page, expr, arg) => page.evaluate(expr, arg);
/** stage px → page px */
const toPage = async (page, [x, y]) => {
  const r = await page.evaluate(() => document.getElementById('app').getBoundingClientRect().toJSON());
  const s = await L(page, () => LIVE.scale);
  return [r.left + x * s, r.top + y * s];
};
const clickBtn = async (page, label) => {
  const b = page.getByRole('button', {name: label, exact: true}).first();
  await b.click();
  await page.waitForTimeout(60);
};
const settle = (page, ms = 300) => page.waitForTimeout(ms);
const waitIdle = async (page, timeout = 20000) => {
  await page.waitForFunction(() => {
    const S = LIVE.session;
    return LIVE.state.t >= S.end - 1e-6;
  }, null, {timeout});
};

// ------------------------------------------------------------------ tests
const {page, errors} = await open();

await test('loads under the Pages base path with the tour running, no errors', async () => {
  assert.equal(await L(page, () => LIVE.tour), true);
  const fps = await L(page, () => LIVE.fps);
  assert.ok(fps > 5, `fps ${fps}`);
  const html = await page.content();
  assert.ok(!/file:\/\/|[A-Z]:\\\\/.test(html), 'local path in page');
  await page.screenshot({path: path.join(shots, '01-load.png')});
});

await test('bundle has no local-path dependencies and the entry HTML is small', async () => {
  if (remote) return;
  const files = fs.readdirSync('dist/assets').filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const s = fs.readFileSync(path.join('dist/assets', f), 'utf8');
    assert.ok(!/[A-Z]:\\\\(Users|ClaudeCode)|file:\/\/\//.test(s), `local path in ${f}`);
  }
  assert.ok(fs.statSync('dist/index.html').size < 1024 * 1024);
  for (const f of ['social-preview.png', 'favicon.svg', 'assets/inter.woff2', 'assets/jbmono-500.woff2']) assert.ok(fs.existsSync(path.join('dist', f)), f);
});

await test('a click hands the machine to the visitor; the tour paper carries over', async () => {
  await page.waitForTimeout(1500);
  const before = await L(page, () => LIVE.state.glyphCount); // glyphs printed so far by the tour
  await page.mouse.click(800, 400);
  await settle(page);
  assert.equal(await L(page, () => LIVE.tour), false);
  const after = await L(page, () => LIVE.session.glyphs.length);
  assert.ok(after >= before, 'printed glyphs carried over');
});

await test('physical typing prints at the carriage position; space, backspace, return', async () => {
  await waitIdle(page);
  const c0 = await L(page, () => LIVE.state.col);
  await page.keyboard.type('ab c');
  await waitIdle(page);
  let s = await L(page, () => ({col: LIVE.state.col, g: LIVE.session.glyphs.slice(-3).map((x) => x.ch).join('')}));
  assert.equal(s.g, 'abc');
  assert.equal(s.col, c0 + 4);
  await page.keyboard.press('Backspace');
  await waitIdle(page);
  assert.equal(await L(page, () => LIVE.state.col), c0 + 3);
  const lines = await L(page, () => LIVE.state.lines);
  await page.keyboard.press('Enter');
  await waitIdle(page);
  s = await L(page, () => ({col: LIVE.state.col, lines: LIVE.state.lines}));
  assert.equal(s.col, 10);
  assert.equal(s.lines, lines + 1);
});

await test('shift (held) prints upper case through carriage shift; caps lock locks it', async () => {
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyQ');
  await page.keyboard.up('Shift');
  await waitIdle(page);
  assert.equal(await L(page, () => LIVE.session.glyphs.at(-1).ch), 'Q');
  assert.equal(await L(page, () => LIVE.state.shift), 0);
  await page.keyboard.press('CapsLock');
  await page.keyboard.type('w');
  await waitIdle(page);
  assert.equal(await L(page, () => LIVE.state.lock), true);
  assert.equal(await L(page, () => LIVE.session.glyphs.at(-1).ch), 'W');
  await page.keyboard.press('CapsLock');
  await waitIdle(page);
  assert.equal(await L(page, () => LIVE.state.lock), false);
});

await test('unsupported characters fail safely', async () => {
  const n = await L(page, () => LIVE.session.glyphs.length);
  await page.keyboard.type('!é€');
  await settle(page, 400);
  assert.equal(await L(page, () => LIVE.session.glyphs.length), n);
});

await test('clicking the visible typewriter keys types them', async () => {
  await clickBtn(page, 'Camera hero');
  await settle(page, 1600);
  await waitIdle(page);
  const id = await L(page, () => LIVE.CHAR_KEYS.findIndex((k) => k.lo === 'k'));
  const pt = await L(page, (i) => LIVE.keyScreen(i), id);
  assert.ok(pt, 'key on screen');
  const [x, y] = await toPage(page, pt);
  await page.mouse.click(x, y);
  await waitIdle(page);
  assert.equal(await L(page, () => LIVE.session.glyphs.at(-1).ch), 'k');
});

await test('a mouse-clicked console button keeps no focus: Space and Enter still reach the typewriter (D-01)', async () => {
  await waitIdle(page);
  await clickBtn(page, 'Subsystem typebar basket');
  const focus = await L(page, () => document.activeElement?.tagName);
  assert.notEqual(focus, 'BUTTON', 'the clicked button took focus');
  const b = await L(page, () => ({col: LIVE.state.col, lines: LIVE.state.lines, n: LIVE.session.glyphs.length}));
  await page.keyboard.type('a b');
  await page.keyboard.press('Enter');
  await waitIdle(page);
  const a = await L(page, () => ({col: LIVE.state.col, lines: LIVE.state.lines, n: LIVE.session.glyphs.length, types: LIVE.session.acts.slice(-4).map((x) => x.type).join(',')}));
  assert.equal(a.n, b.n + 2, 'two characters printed');
  assert.equal(a.types, 'char,space,char,ret', `actions ${a.types}`);
  assert.equal(a.lines, b.lines + 1, 'return fed a line');
  assert.equal(a.col, 10, 'carriage back at the margin');
  await clickBtn(page, 'REASSEMBLE');
});

await test('every subsystem button isolates its assembly; reassemble restores', async () => {
  const subs = ['KEY LINKAGE', 'TYPEBAR BASKET', 'IMPACT', 'RIBBON LIFT', 'RIBBON FEED', 'UNIVERSAL BAR', 'ESCAPEMENT', 'CARRIAGE', 'MAINSPRING', 'SHIFT', 'BACKSPACE', 'MARGIN BELL', 'CARRIAGE RETURN', 'LINE SPACING', 'PLATEN', 'FULL EXPLODE'];
  const ids = ['linkage', 'basket', 'impact', 'ribbonLift', 'ribbonFeed', 'ubar', 'escapement', 'carriage', 'mainspring', 'shift', 'backspace', 'bell', 'ret', 'spacing', 'platen', 'explode'];
  for (const [i, label] of subs.entries()) {
    await clickBtn(page, `Subsystem ${label.toLowerCase()}`);
    await settle(page, 120);
    assert.equal(await L(page, () => LIVE.view.sub), ids[i], label);
  }
  await settle(page, 1300);
  await page.screenshot({path: path.join(shots, '02-explode.png')});
  await clickBtn(page, 'REASSEMBLE');
  await settle(page, 200);
  assert.equal(await L(page, () => LIVE.view.sub), null);
});

await test('every camera button moves to its view', async () => {
  for (const c of ['hero', 'operator', 'keyboard', 'side', 'top', 'typebars', 'impact', 'escapement', 'ribbon', 'carriage', 'rear', 'platen', 'inside']) {
    await clickBtn(page, `Camera ${c}`);
    await settle(page, 80);
    assert.equal(await L(page, () => LIVE.view.camId), c);
  }
  await clickBtn(page, 'Camera hero');
});

await test('x-ray and cutaway toggle', async () => {
  await clickBtn(page, 'X-RAY');
  assert.equal(await L(page, () => LIVE.view.xray), true);
  await clickBtn(page, 'CUTAWAY');
  assert.equal(await L(page, () => LIVE.view.cutaway), true);
  await settle(page, 1300);
  await page.screenshot({path: path.join(shots, '03-xray-cutaway.png')});
  await clickBtn(page, 'X-RAY');
  await clickBtn(page, 'CUTAWAY');
  assert.equal(await L(page, () => LIVE.view.xray), false);
  assert.equal(await L(page, () => LIVE.view.cutaway), false);
});

await test('machine buttons: return, spacing, ribbon colour, lock', async () => {
  const sp = await L(page, () => LIVE.state.spacing);
  await clickBtn(page, `SPACING ${sp}`);
  await waitIdle(page);
  assert.equal(await L(page, () => LIVE.state.spacing), (sp % 3) + 1);
  await clickBtn(page, 'BLACK');
  await waitIdle(page);
  assert.equal(await L(page, () => LIVE.state.color), 'red');
  await clickBtn(page, 'RED');
  await waitIdle(page);
  assert.equal(await L(page, () => LIVE.state.color), 'stencil', 'the selector reaches stencil (D-12)');
  await clickBtn(page, 'STENCIL');
  await waitIdle(page);
  assert.equal(await L(page, () => LIVE.state.color), 'black');
  await clickBtn(page, 'LOCK');
  await waitIdle(page);
  assert.equal(await L(page, () => LIVE.state.lock), true);
  await clickBtn(page, 'LOCK');
  await waitIdle(page);
  await page.keyboard.type('xyz');
  await waitIdle(page);
  const l0 = await L(page, () => LIVE.state.lines);
  await clickBtn(page, 'RETURN');
  await waitIdle(page);
  assert.ok((await L(page, () => LIVE.state.lines)) > l0);
  assert.equal(await L(page, () => LIVE.state.col), 10);
});

await test('pause, resume, step, slow motion, speed, timeline scrub', async () => {
  await clickBtn(page, 'PAUSE');
  assert.equal(await L(page, () => LIVE.paused), true);
  const t0 = await L(page, () => LIVE.state.t);
  await clickBtn(page, 'STEP ▶');
  const t1 = await L(page, () => LIVE.state.t);
  assert.ok(t1 > t0);
  await clickBtn(page, 'STEP ◀');
  assert.ok((await L(page, () => LIVE.state.t)) < t1);
  await clickBtn(page, 'PLAY');
  assert.equal(await L(page, () => LIVE.paused), false);
  await clickBtn(page, 'SLOW MOTION');
  await clickBtn(page, 'SLOW MOTION');
  // drag the timeline to its start: pauses and rewinds
  const tl = await page.locator('[aria-label="TIMELINE"]').boundingBox();
  await page.mouse.click(tl.x + 2, tl.y + tl.height / 2);
  assert.equal(await L(page, () => LIVE.paused), true);
  const tScrub = await L(page, () => LIVE.state.t);
  await page.mouse.click(tl.x + tl.width - 1, tl.y + tl.height / 2);
  assert.ok((await L(page, () => LIVE.state.t)) > tScrub);
  // speed slider by keyboard
  await page.locator('[aria-label="PLAYBACK SPEED"]').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await clickBtn(page, 'PLAY');
});

await test('reset clears the sheet and returns the carriage', async () => {
  await clickBtn(page, 'RESET');
  await settle(page);
  assert.equal(await L(page, () => LIVE.session.glyphs.length), 0);
  assert.equal(await L(page, () => LIVE.state.col), 10);
});

await test('sound: mute toggles, volume slider', async () => {
  await clickBtn(page, 'SOUND ON');
  assert.equal(await L(page, () => LIVE.muted), true);
  await clickBtn(page, 'SOUND OFF');
  assert.equal(await L(page, () => LIVE.muted), false);
  const v = await page.locator('[aria-label="VOLUME"]').boundingBox();
  await page.mouse.click(v.x + v.width * 0.25, v.y + v.height / 2);
  const vol = await L(page, () => LIVE.volume);
  assert.ok(vol > 0.15 && vol < 0.35, `volume ${vol}`);
});

await test('panels hide and show (button and Esc)', async () => {
  await clickBtn(page, 'HIDE PANELS');
  assert.equal(await L(page, () => LIVE.panels), false);
  await page.keyboard.press('Escape');
  assert.equal(await L(page, () => LIVE.panels), true);
});

await test('all quality modes render without errors', async () => {
  for (const [label, tier] of [['HIGH', 'high'], ['BALANCED', 'balanced'], ['LOW', 'low'], ['AUTO', null]]) {
    await clickBtn(page, label);
    await settle(page, 500);
    if (tier) assert.equal(await L(page, () => LIVE.tier), tier);
  }
  assert.equal(await L(page, () => LIVE.quality), 'auto');
});

await test('orbit and zoom', async () => {
  const o0 = await L(page, () => LIVE.offset);
  await page.mouse.move(700, 300);
  await page.mouse.down();
  await page.mouse.move(820, 330, {steps: 6});
  await page.mouse.up();
  await page.mouse.wheel(0, 300);
  await settle(page);
  const o1 = await L(page, () => LIVE.offset);
  assert.notEqual(o1.az, o0.az);
  assert.ok(o1.k > o0.k);
});

await test('tour button and chip restart the tour; inactivity resumes it, never mid-drag', async () => {
  await clickBtn(page, 'PLAY TOUR');
  assert.equal(await L(page, () => LIVE.tour), true);
  await page.mouse.click(800, 420);
  assert.equal(await L(page, () => LIVE.tour), false);
  // holding a drag: no resume
  await page.mouse.move(700, 350);
  await page.mouse.down();
  await L(page, () => LIVE.idleFor(30));
  await settle(page, 300);
  assert.equal(await L(page, () => LIVE.tour), false, 'tour must not resume while the visitor holds a drag');
  await page.mouse.up();
  await L(page, () => LIVE.idleFor(30));
  await settle(page, 300);
  assert.equal(await L(page, () => LIVE.tour), true, 'tour resumes after 25 s of quiet');
});

await test('taking over in the middle of a tour view change continues it without a jump (D-07)', async () => {
  await L(page, () => LIVE.startTour());
  await page.waitForFunction(() => LIVE.tour && LIVE.view.k > 0.2 && LIVE.view.k < 0.8, null, {timeout: 20000});
  const d = await L(page, () => {
    const a = LIVE.view;
    LIVE.takeOver();
    const b = LIVE.view;
    return {dd: Math.abs(a.cam.d - b.cam.d), daz: Math.abs(a.cam.az - b.cam.az), dk: Math.abs(a.k - b.k), sub: [a.sub, b.sub]};
  });
  assert.ok(d.dd < 1e-6 && d.daz < 1e-6 && d.dk < 1e-9, JSON.stringify(d));
  assert.equal(d.sub[0], d.sub[1]);
});

await test('callout labels stay between the side panels in every view (D-08)', async () => {
  const views = [...['hero', 'operator', 'keyboard', 'side', 'top', 'typebars', 'impact', 'escapement', 'ribbon', 'carriage', 'rear', 'platen', 'inside'].map((c) => `Camera ${c}`), ...['key linkage', 'typebar basket', 'impact', 'ribbon lift', 'ribbon feed', 'universal bar', 'escapement', 'carriage', 'mainspring', 'shift', 'backspace', 'margin bell', 'carriage return', 'line spacing', 'platen', 'full explode'].map((x) => `Subsystem ${x}`)];
  const bad = [];
  for (const v of views) {
    await clickBtn(page, v);
    await settle(page, 1700);
    const boxes = await L(page, () => {
      const app = document.getElementById('app').getBoundingClientRect();
      const s = LIVE.scale;
      return [...document.querySelectorAll('.call')].filter((n) => parseFloat(n.style.opacity) > 0.02).map((n) => {
        const r = n.getBoundingClientRect();
        return {t: n.textContent, l: (r.left - app.left) / s, r: (r.right - app.left) / s};
      });
    });
    for (const b of boxes) if (b.l < 298 || b.r > 1302) bad.push(`${v}: "${b.t}" ${b.l.toFixed(0)}–${b.r.toFixed(0)}`);
  }
  await clickBtn(page, 'REASSEMBLE');
  await clickBtn(page, 'Camera hero');
  assert.deepEqual(bad, []);
});

await test('controls are keyboard accessible with visible focus', async () => {
  await page.keyboard.press('Tab');
  const tag = await L(page, () => document.activeElement.tagName + ':' + (document.activeElement.getAttribute('aria-label') || ''));
  assert.ok(/BUTTON|DIV/.test(tag), tag);
  const outline = await L(page, () => getComputedStyle(document.activeElement).outlineStyle);
  assert.ok(outline !== 'none', `focus outline ${outline}`);
});

await test('no console errors or failed requests during the session', async () => {
  assert.deepEqual(errors, []);
});

// ------------------------------------------------------------------ layouts, reduced motion
for (const [w, h, name, extra] of [[1366, 768, 'laptop-1366'], [1280, 720, 'laptop-1280'], [1920, 1080, 'desktop-1080p'], [844, 390, 'phone-landscape', {mobile: true, touch: true, dpr: 2}], [390, 844, 'phone-portrait', {mobile: true, touch: true, dpr: 2}]]) {
  await test(`layout ${name} (${w}×${h}): fits, no page scroll, no errors`, async () => {
    const o = await open({viewport: {width: w, height: h}, ...(extra || {})});
    const m = await o.page.evaluate(() => ({sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight, r: document.getElementById('app').getBoundingClientRect().toJSON()}));
    assert.ok(m.sw <= m.iw + 1 && m.sh <= m.ih + 1, `scroll ${m.sw}×${m.sh} in ${m.iw}×${m.ih}`);
    assert.ok(m.r.width <= m.iw + 1 && m.r.height <= m.ih + 1, 'stage fits');
    // portrait phones get a readable hint to turn sideways; landscape and desktop do not (D-13)
    const hint = await o.page.evaluate(() => getComputedStyle(document.getElementById('rotate-hint')).display);
    assert.equal(hint, name === 'phone-portrait' ? 'block' : 'none', `rotate hint ${hint}`);
    if (extra?.touch) {
      await o.page.touchscreen.tap(m.iw / 2, m.ih / 2);
      await o.page.waitForTimeout(200);
      assert.equal(await o.page.evaluate(() => LIVE.tour), false, 'touch takes over');
    }
    await o.page.screenshot({path: path.join(shots, `layout-${name}.png`)});
    assert.deepEqual(o.errors, []);
    await o.ctx.close();
  });
}
await test('reduced motion: the tour does not start by itself, not even after 25 s of quiet (D-05)', async () => {
  const o = await open({reducedMotion: 'reduce'});
  assert.equal(await o.page.evaluate(() => LIVE.tour), false);
  await o.page.evaluate(() => LIVE.idleFor(30));
  await o.page.waitForTimeout(400);
  assert.equal(await o.page.evaluate(() => LIVE.tour), false, 'tour started after idle');
  await o.page.getByRole('button', {name: 'PLAY TOUR', exact: true}).click();
  assert.equal(await o.page.evaluate(() => LIVE.tour), true, 'PLAY TOUR still starts it');
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});
if (!remote) {
  await test('also works at the site root (base-path independent assets)', async () => {
    const s2 = await serve({dir: 'dist', base: '/'});
    const o = await open({url: s2.url});
    assert.deepEqual(o.errors, []);
    await o.ctx.close();
    await s2.close();
  });
}

await browser.close();
if (srv) await srv.close();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(shots, 'results.json'), JSON.stringify({date: new Date().toISOString(), base: BASE, results}, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
