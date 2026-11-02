#!/usr/bin/env node
// Before/after pairs for the audit: left = before (validation/audit/before), right = after (validation/audit/after),
// one JPEG per visual repair in validation/audit/compare/. Needs both audit runs' frame folders (local, git-ignored).
//   node scripts/compare.mjs
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const B = 'validation/audit/before/frames';
const A = 'validation/audit/after/frames';
const OUT = 'validation/audit/compare';
fs.mkdirSync(OUT, {recursive: true});
const PAIRS = [
  ['D-03-full-explode', 'subs/sub_explode.png'],
  ['D-04-key-linkage', 'subs/sub_linkage.png'],
  ['D-04-typebar-basket', 'subs/sub_basket.png'],
  ['D-04-ribbon-feed', 'subs/sub_ribbonFeed.png'],
  ['D-04-universal-bar', 'subs/sub_ubar.png'],
  ['D-04-escapement', 'subs/sub_escapement.png'],
  ['D-04-carriage', 'subs/sub_carriage.png'],
  ['D-04-backspace', 'subs/sub_backspace.png'],
  ['D-04-margin-bell', 'subs/sub_bell.png'],
  ['D-04-ribbon-lift', 'subs/sub_ribbonLift.png'],
  ['D-08-callouts-side', 'cams/cam_side.png'],
  ['D-09-carriage-return', 'subs/sub_ret.png'],
  ['D-09-line-spacing', 'subs/sub_spacing.png'],
  ['D-09-platen', 'subs/sub_platen.png'],
  ['D-11-hood-decal', 'cams/cam_operator.png'],
  ['D-02-D-15-hero', 'cams/cam_hero.png'],
];
for (const [name, f] of PAIRS) {
  const a = path.join(B, f);
  const b = path.join(A, f);
  if (!fs.existsSync(a) || !fs.existsSync(b)) {
    console.log('skip', name);
    continue;
  }
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', a, '-i', b, '-filter_complex', '[0]scale=960:540[l];[1]scale=960:540[r];[l][r]hstack=inputs=2', '-q:v', '4', path.join(OUT, `${name}.jpg`)]);
  console.log('→', path.join(OUT, `${name}.jpg`));
}
// whole transition sheets: before above, after below
for (const s of ['explode', 'carriage', 'escapement', 'linkage', 'basket', 'ribbonFeed']) {
  const a = `validation/audit/before/trans-${s}.jpg`;
  const b = `validation/audit/after/trans-${s}.jpg`;
  if (!fs.existsSync(a) || !fs.existsSync(b)) continue;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', a, '-i', b, '-filter_complex', '[0]scale=1920:-2[t];[1]scale=1920:-2[u];[t][u]vstack=inputs=2', '-q:v', '5', path.join(OUT, `transition-${s}.jpg`)]);
  console.log('→', path.join(OUT, `transition-${s}.jpg`));
}
