#!/usr/bin/env node
// Frame-accurate capture of the tour film (dist/index.html?film) in headless Chromium, after the teardown kit's
// sims/capture.mjs: window.SIM.render(t) for every frame → screenshot → ffmpeg. No real-time recording.
//
//   node scripts/capture.mjs --still 12.5 --out validation/still.png
//   node scripts/capture.mjs --stills beats [--sheet validation/contact-sheet.png] [--cols 4]
//   node scripts/capture.mjs --stills every:0.2 --from 3 --to 5 --sheet validation/scrub-3-5.png
//   node scripts/capture.mjs --video validation/video/tour-silent.mp4 [--fps 60] [--dpr 1.2]
//   node scripts/capture.mjs --audio validation/video/tour.wav
// --size is the CSS layout (default 1600x900); --dpr multiplies it (1.2 → 1920×1080).
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 ? d : argv[i + 1] ?? true;
};
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const [W, H] = String(opt('size', '1600x900')).split('x').map(Number);
const dpr = Number(opt('dpr', 1));
const GPU_ARGS = [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--hide-scrollbars', ...(opt('lowgpu', false) ? ['--force_low_power_gpu'] : ['--force_high_performance_gpu'])];

export async function openFilm({quality = '', dprOverride} = {}) {
  if (!fs.existsSync('dist/index.html')) throw new Error('no dist/: run npm run build first');
  const srv = await serve({dir: 'dist', base: '/Typewriter-Teardown/'});
  const browser = await chromium.launch({args: GPU_ARGS});
  const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: dprOverride ?? dpr});
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${srv.url}?film${quality ? '&' + quality : ''}`);
  await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 90000});
  await page.evaluate(() => document.fonts.ready);
  const info = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return {duration: window.SIM.duration, fps: window.SIM.fps, beats: window.SIM.beats, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'};
  });
  const close = async () => {
    await browser.close();
    await srv.close();
  };
  return {page, info, errors, close};
}

const run = async () => {
  const {page, info, errors, close} = await openFilm({quality: opt('lo', false) ? 'lo' : ''});
  console.log(`gpu: ${info.gpu}`);
  const draw = (t) => page.evaluate((x) => window.SIM.render(x), t);
  const end = Number(opt('to', info.duration));

  if (opt('audio')) {
    const out = path.resolve(opt('audio'));
    fs.mkdirSync(path.dirname(out), {recursive: true});
    const b64 = await page.evaluate(() => window.SIM.renderAudio());
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    console.log(`→ ${out}`);
  }

  const stills = opt('stills');
  if (stills) {
    let ts;
    if (stills === 'beats') ts = [0, ...info.beats.map((b) => b + 0.9)];
    else if (String(stills).startsWith('every:')) {
      const step = Number(String(stills).slice(6));
      ts = [];
      for (let t = Number(opt('from', 0)); t <= end + 1e-6; t += step) ts.push(+t.toFixed(3));
    } else ts = String(stills).split(',').map(Number);
    ts = [...new Set(ts.map((t) => Math.min(Math.max(t, 0), info.duration - 1 / 120).toFixed(2)))].map(Number).sort((a, b) => a - b);
    const sheet = path.resolve(opt('sheet', `validation/sheet-${String(stills).replace(/[^a-z0-9.]/gi, '_')}.png`));
    const dir = sheet.replace(/\.png$/, '-frames');
    fs.rmSync(dir, {recursive: true, force: true});
    fs.mkdirSync(dir, {recursive: true});
    for (const [i, t] of ts.entries()) {
      await draw(t);
      await page.evaluate((txt) => {
        const el = document.createElement('div');
        el.id = '__t';
        el.textContent = txt;
        el.style.cssText = 'position:fixed;right:10px;top:8px;z-index:2147483647;font:600 24px monospace;color:#fff;background:rgba(0,0,0,.65);padding:3px 9px;border-radius:4px';
        document.body.appendChild(el);
      }, `t=${t.toFixed(2)}`);
      await page.screenshot({path: path.join(dir, `${String(i).padStart(3, '0')}.png`)});
      await page.evaluate(() => document.getElementById('__t')?.remove());
    }
    const cols = Math.min(ts.length, Number(opt('cols', 4)));
    const tw = Math.round(W * 0.4);
    const th = Math.round(H * 0.4);
    await new Promise((r) =>
      spawn(FFMPEG, ['-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(dir, '%03d.png'), '-vf', `scale=${tw}:${th},tile=${cols}x${Math.ceil(ts.length / cols)}:padding=4:color=0x333333`, '-frames:v', '1', sheet], {stdio: 'inherit'}).on('close', r),
    );
    console.log(`→ ${sheet}  (${ts.length} frames in ${dir})`);
  }

  if (opt('still') !== undefined) {
    const out = path.resolve(opt('out', `validation/still-${opt('still')}.png`));
    fs.mkdirSync(path.dirname(out), {recursive: true});
    await draw(Number(opt('still')));
    await page.screenshot({path: out});
    console.log(`→ ${out}`);
  }

  if (opt('video')) {
    const out = path.resolve(opt('video'));
    fs.mkdirSync(path.dirname(out), {recursive: true});
    const fps = Number(opt('fps', 60));
    const from = Number(opt('from', 0));
    const frames = Math.round((end - from) * fps);
    const ff = spawn(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(opt('crf', 17)), '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-movflags', '+faststart', out], {stdio: ['pipe', 'inherit', 'inherit']});
    const t0 = Date.now();
    for (let i = 0; i < frames; i++) {
      await draw(from + i / fps);
      const buf = await page.screenshot({type: 'jpeg', quality: 95});
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % fps === 0) process.stdout.write(`\r${i}/${frames} frames  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    console.log(`\r${frames}/${frames} frames  ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}`);
  }
  if (errors.length) console.error('page errors:\n' + [...new Set(errors)].join('\n'));
  await close();
  if (errors.length && opt('strict', false)) process.exit(1);
};

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('capture.mjs')) run();
