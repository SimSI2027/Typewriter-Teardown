#!/usr/bin/env node
// Audit captures (needs a build): full-resolution stills and sheets for a before/after comparison, plus a collision
// report for every subsystem pose. Frame folders are git-ignored; sheets and reports are kept.
//   node scripts/audit.mjs --out validation/audit/before [--only beats,cams,subs,actions,trans,scrub,collide]
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {openFilm} from './capture.mjs';
import {buildTourSession, tAtTau, BEATS} from '../src/tour.js';
import {TIMING} from '../src/model.js';
import {SUB_BUTTONS, CAM_BUTTONS} from '../src/views.js';

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const OUT = path.resolve(opt('out', 'validation/audit/before'));
const only = opt('only', 'beats,cams,subs,actions,trans,scrub,collide').split(',');
const FR = path.join(OUT, 'frames');
fs.mkdirSync(FR, {recursive: true});

const tile = (dir, n, cols, out, w = 480, h = 270) =>
  new Promise((r) => spawn('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(dir, '%03d.png'), '-vf', `scale=${w}:${h},tile=${cols}x${Math.ceil(n / cols)}:padding=3:color=0x333333`, '-frames:v', '1', '-q:v', '4', out], {stdio: 'inherit'}).on('close', r));

const {page, info, errors, close} = await openFilm();
console.log(`gpu: ${info.gpu}`);
const label = (txt) =>
  page.evaluate((t) => {
    let el = document.getElementById('__t');
    if (!el) {
      el = document.createElement('div');
      el.id = '__t';
      el.style.cssText = 'position:fixed;right:10px;top:8px;z-index:2147483647;font:600 22px monospace;color:#fff;background:rgba(0,0,0,.65);padding:3px 9px';
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, txt);

/** shots: [{name, draw: async () => {}}] → frames/<set>/NNN.png (+ named copies) and a sheet */
async function set(name, shots, cols = 4, keepNamed = false) {
  const dir = path.join(FR, name);
  fs.rmSync(dir, {recursive: true, force: true});
  fs.mkdirSync(dir, {recursive: true});
  for (const [i, s] of shots.entries()) {
    await s.draw();
    await label(s.name);
    const f = path.join(dir, `${String(i).padStart(3, '0')}.png`);
    await page.screenshot({path: f});
    if (keepNamed) fs.copyFileSync(f, path.join(dir, `${s.name.replace(/[^a-z0-9._-]/gi, '_')}.png`));
  }
  const out = path.join(OUT, `${name}.jpg`);
  await tile(dir, shots.length, cols, out);
  console.log('→', out);
}
const render = (t) => () => page.evaluate((x) => window.SIM.render(x), t);
const preview = (t, v) => () => page.evaluate(([a, b]) => window.SIM.preview(a, b), [t, v]);
const view = (t, ev, vt) => () => page.evaluate(([a, b, c]) => window.SIM.view(a, b, c), [t, ev, vt]);

// ------------------------------------------------------------ key moments of the tour (tour seconds)
const {S} = buildTourSession();
const acts = S.acts;
const charAct = (ch) => acts.find((a) => a.type === 'char' && a.glyph === ch);
const tOf = (a, p) => tAtTau(a.t0 + p * a.dur);
const r = charAct('r');
const aA = charAct('a');
const G = charAct('G');
const ret = acts.find((a) => a.type === 'ret');
const bell = acts.find((a) => a.after.bellAt > a.before.bellAt);
const M = {
  impact_r: tOf(r, 0.362),
  flight_r: tOf(r, 0.33),
  ribbonUp_r: tOf(r, 0.25),
  carriageStep_a: tOf(aA, (TIMING.STEP2[0] + TIMING.STEP2[1]) / 2),
  rigidDog_a: tOf(aA, (TIMING.STEP1[1] + TIMING.STEP2[0]) / 2),
  shiftRaised_G: tOf(G, 0.36),
  bell: tAtTau(bell.after.bellAt + 0.02),
  returnLever: tOf(ret, 0.12),
  returnMid: tOf(ret, 0.5),
};
const IMPACT = M.impact_r;
fs.writeFileSync(path.join(OUT, 'moments.json'), JSON.stringify(M, null, 1));

if (only.includes('beats')) await set('beats', [{name: 't=0.00', draw: render(0)}, ...info.beats.map((b) => ({name: `t=${Math.min(info.duration - 0.01, b + 0.9).toFixed(2)}`, draw: render(Math.min(info.duration - 0.01, b + 0.9))}))], 4, true);
if (only.includes('cams')) await set('cams', [...CAM_BUTTONS.map((c) => ({name: `cam_${c}`, draw: preview(IMPACT, {cam: c})})), {name: 'hero_xray', draw: preview(IMPACT, {cam: 'hero', xray: true})}, {name: 'hero_cutaway', draw: preview(IMPACT, {cam: 'hero', cutaway: true})}], 4, true);
if (only.includes('subs')) {
  const shots = [];
  for (const s of SUB_BUTTONS) {
    shots.push({name: `sub_${s}`, draw: preview(IMPACT, {sub: s})});
    shots.push({name: `sub_${s}_xray`, draw: preview(IMPACT, {sub: s, xray: true})});
    shots.push({name: `sub_${s}_cutaway`, draw: preview(IMPACT, {sub: s, cutaway: true})});
  }
  await set('subs', shots, 3, true);
}
if (only.includes('actions')) await set('actions', Object.entries(M).flatMap(([k, t]) => [{name: `${k}_tour`, draw: render(t)}, {name: `${k}_hero`, draw: preview(t, {cam: 'hero'})}]), 4, true);
if (only.includes('trans')) {
  for (const s of SUB_BUTTONS) {
    const shots = [];
    for (let k = 0; k <= 7; k++) shots.push({name: `${s} in ${(k * 0.2).toFixed(1)}`, draw: view(IMPACT, [{t: -99, cam: 'hero'}, {t: 0, sub: s}], k * 0.2)});
    for (let k = 0; k <= 7; k++) shots.push({name: `${s} out ${(k * 0.2).toFixed(1)}`, draw: view(IMPACT, [{t: -99, sub: s}, {t: 0, sub: 'reassemble', cam: 'hero'}], k * 0.2)});
    await set(`trans-${s}`, shots, 8);
  }
}
if (only.includes('scrub')) {
  const all = [];
  for (let t = 0; t <= info.duration - 0.05 + 1e-6; t += 0.2) all.push(+t.toFixed(2));
  for (let i = 0, k = 1; i < all.length; i += 40, k++) await set(`scrub-${String(k).padStart(2, '0')}`, all.slice(i, i + 40).map((t) => ({name: `t=${t.toFixed(2)}`, draw: render(t)})), 8);
}
if (only.includes('collide')) {
  // a pair of meshes from different assemblies whose boxes overlap in a subsystem pose but not at rest
  const pen = (a, b) => Math.min(a[3] - b[0], b[3] - a[0], a[4] - b[1], b[4] - a[1], a[5] - b[2], b[5] - a[2]);
  await page.evaluate((t) => window.SIM.preview(t, {cam: 'hero'}), IMPACT);
  const rest = await page.evaluate(() => window.SIM.boxes());
  const restPairs = new Set();
  const asms = Object.keys(rest);
  const key = (a, b) => `${a[7]}|${b[7]}`;
  for (let x = 0; x < asms.length; x++)
    for (let y = x + 1; y < asms.length; y++) {
      const A = asms[x];
      const B = asms[y];
      rest[A].forEach((a, i) => rest[B].forEach((b, j) => pen(a, b) > 0 && restPairs.add(key(a, b))));
    }
  const report = {};
  for (const s of SUB_BUTTONS) {
    await page.evaluate(([t, v]) => window.SIM.preview(t, v), [IMPACT, {sub: s}]);
    const bx = await page.evaluate(() => window.SIM.boxes());
    const hits = [];
    for (let x = 0; x < asms.length; x++)
      for (let y = x + 1; y < asms.length; y++) {
        const A = asms[x];
        const B = asms[y];
        (bx[A] || []).forEach((a, i) =>
          (bx[B] || []).forEach((b, j) => {
            const p = pen(a, b);
            if (p > 1.0 && !restPairs.has(key(a, b))) hits.push({a: `${A}/${a[6]}`, b: `${B}/${b[6]}`, pen: +p.toFixed(1)});
          }),
        );
      }
    hits.sort((u, v) => v.pen - u.pen);
    report[s] = {count: hits.length, top: hits.slice(0, 25)};
    console.log(`collide ${s}: ${hits.length}`);
  }
  // lowest point of every assembly in each pose (the desk is y = 0)
  fs.writeFileSync(path.join(OUT, 'collisions.json'), JSON.stringify(report, null, 1));
}
await close();
if (errors.length) console.error('page errors:\n' + [...new Set(errors)].join('\n'));
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify([...new Set(errors)], null, 1));
