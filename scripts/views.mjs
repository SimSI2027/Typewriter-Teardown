// Validation: every camera view and every subsystem view, rendered from the tour's machine at a chosen moment, tiled
// into one sheet. node scripts/views.mjs [--t 11.95] [--out validation/views-sheet.png] [--only sub_impact,cam_hero]
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {openFilm} from './capture.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const t = Number(opt('t', 11.95));
const out = path.resolve(opt('out', 'validation/views-sheet.png'));
const CAMS = ['hero', 'operator', 'keyboard', 'side', 'top', 'typebars', 'impact', 'escapement', 'ribbon', 'carriage', 'rear', 'platen', 'inside'];
const SUBS = ['linkage', 'basket', 'impact', 'ribbonLift', 'ribbonFeed', 'ubar', 'escapement', 'carriage', 'mainspring', 'shift', 'backspace', 'bell', 'ret', 'spacing', 'platen', 'explode'];
let list = [...CAMS.map((c) => ['cam_' + c, {cam: c}]), ...SUBS.map((s) => ['sub_' + s, {sub: s}]), ['xray', {cam: 'hero', xray: true}], ['cutaway', {cam: 'hero', cutaway: true}]];
const only = opt('only');
if (only) list = list.filter(([k]) => only.split(',').includes(k));
const {page, errors, close} = await openFilm();
const dir = out.replace(/\.png$/, '-frames');
fs.rmSync(dir, {recursive: true, force: true});
fs.mkdirSync(dir, {recursive: true});
for (const [i, [k, v]] of list.entries()) {
  await page.evaluate(([tt, vv]) => window.SIM.preview(tt, vv), [t, v]);
  await page.evaluate((txt) => {
    const el = document.createElement('div');
    el.id = '__t';
    el.textContent = txt;
    el.style.cssText = 'position:fixed;right:10px;top:8px;z-index:9;font:600 24px monospace;color:#fff;background:rgba(0,0,0,.65);padding:3px 9px';
    document.body.appendChild(el);
  }, k);
  await page.screenshot({path: path.join(dir, `${String(i).padStart(3, '0')}.png`)});
  await page.evaluate(() => document.getElementById('__t')?.remove());
}
await close();
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const lst = path.join(dir, 'list.txt');
const cols = Math.min(4, files.length);
await new Promise((r) => spawn('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '1', '-i', '%03d.png', '-vf', `scale=640:360,tile=${cols}x${Math.ceil(files.length / cols)}:padding=4:color=0x333333`, '-frames:v', '1', out], {cwd: dir, stdio: 'inherit'}).on('close', r));
void lst;
if (errors.length) console.error('page errors:\n' + [...new Set(errors)].join('\n'));
console.log('→', out);
