#!/usr/bin/env node
// The deterministic tour video: every frame rendered by window.SIM.render(t) in headless Chromium (no real-time
// recording), H.264 yuv420p faststart at 1920×1080 60 fps, with the soundtrack rendered offline from the same
// session's cues and normalised. Then a contact sheet of the encoded video at every beat.
//   npm run build && npm run video
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('validation/video');
fs.mkdirSync(OUT, {recursive: true});
const node = process.execPath;
const run = (args) => {
  const r = spawnSync(node, args, {stdio: 'inherit'});
  if (r.status !== 0) process.exit(r.status || 1);
};
const silent = path.join(OUT, 'tour-silent.mp4');
const wav = path.join(OUT, 'tour-score.wav');
const final = path.join(OUT, 'underwood-no5-tour.mp4');
run(['scripts/capture.mjs', '--audio', wav]);
run(['scripts/capture.mjs', '--video', silent, '--dpr', '1.2', '--fps', '60', '--crf', '17']);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', silent, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-af', 'loudnorm=I=-16:TP=-2:LRA=11', '-shortest', '-movflags', '+faststart', final], {stdio: 'inherit'});
const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,pix_fmt,sample_rate:format=duration', '-of', 'json', final]).toString();
fs.writeFileSync(path.join(OUT, 'probe.json'), probe);
console.log(probe);
// contact sheet from the encoded video: one tile per beat
const {BEATS} = await import('../src/tour.js');
const ts = [0.5, ...BEATS.filter((b) => b.click || b.type).map((b) => b.t + 0.9)];
const dir = path.join(OUT, 'sheet-frames');
fs.rmSync(dir, {recursive: true, force: true});
fs.mkdirSync(dir, {recursive: true});
ts.forEach((t, i) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', t.toFixed(2), '-i', final, '-frames:v', '1', '-vf', `scale=640:360,drawtext=text='t=${t.toFixed(1)}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6`, path.join(dir, `${String(i).padStart(3, '0')}.png`)]));
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(dir, '%03d.png'), '-vf', `tile=5x${Math.ceil(ts.length / 5)}:padding=4:color=0x333333`, '-frames:v', '1', path.join(OUT, 'video-contact-sheet.png')]);
console.log('→', final, '\n→', path.join(OUT, 'video-contact-sheet.png'));
