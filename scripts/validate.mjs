#!/usr/bin/env node
// Validation renders (needs a build): the beat contact sheet, every transition scrubbed at 0.2 s, a full-tour scrub at
// 0.2 s split into sheets, and the views sheet. Output → validation/ (frame folders are git-ignored).
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {openFilm} from './capture.mjs';

const OUT = path.resolve('validation');
const tile = (dir, n, cols, out) =>
  new Promise((r) => spawn('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(dir, '%03d.png'), '-vf', `scale=480:270,tile=${cols}x${Math.ceil(n / cols)}:padding=3:color=0x333333`, '-frames:v', '1', out], {stdio: 'inherit'}).on('close', r));
const {page, info, errors, close} = await openFilm();
console.log(`gpu: ${info.gpu}`);
const label = (txt) =>
  page.evaluate((t) => {
    let el = document.getElementById('__t');
    if (!el) {
      el = document.createElement('div');
      el.id = '__t';
      el.style.cssText = 'position:fixed;right:10px;top:8px;z-index:9;font:600 26px monospace;color:#fff;background:rgba(0,0,0,.65);padding:3px 9px';
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, txt);
async function sheet(name, ts, cols = 5) {
  const dir = path.join(OUT, 'frames', name);
  fs.rmSync(dir, {recursive: true, force: true});
  fs.mkdirSync(dir, {recursive: true});
  for (const [i, t] of ts.entries()) {
    await page.evaluate((x) => window.SIM.render(x), t);
    await label(`t=${t.toFixed(2)}`);
    await page.screenshot({path: path.join(dir, `${String(i).padStart(3, '0')}.png`)});
  }
  const out = path.join(OUT, `${name}.png`);
  await tile(dir, ts.length, cols, out);
  console.log('→', out);
}
const range = (a, b, step = 0.2) => {
  const o = [];
  for (let t = a; t <= b + 1e-6; t += step) o.push(+t.toFixed(2));
  return o;
};
const D = info.duration;
// 1. beat contact sheet (0.9 s after every beat, when the view has settled)
await sheet('contact-sheet', [0, ...info.beats.map((b) => Math.min(D - 0.01, b + 0.9))], 4);
// 1b. the slow-motion strike of "r" around impact (11.92 s), every 0.05 s
await sheet('impact-sheet', range(11.7, 12.25, 0.05), 4);
// 2. full tour at 0.2 s, in sheets of 40 frames
const all = range(0, D - 0.05);
for (let i = 0, k = 1; i < all.length; i += 40, k++) await sheet(`scrub-${String(k).padStart(2, '0')}`, all.slice(i, i + 40), 8);
await close();
if (errors.length) {
  console.error('page errors:\n' + [...new Set(errors)].join('\n'));
  process.exit(1);
}
