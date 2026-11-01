#!/usr/bin/env node
// Production build: bundles src/main.js with esbuild into dist/assets, copies the two web fonts and the social
// preview, writes dist/index.html with relative asset paths (so it works at any base path, including GitHub Pages'
// /Typewriter-Teardown/). `--debug` skips minification. `--base <url>` sets the absolute site URL for Open Graph.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const argv = process.argv.slice(2);
const debug = argv.includes('--debug');
const SITE = (argv[argv.indexOf('--base') + 1] && argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : 'https://simsi2027.github.io/Typewriter-Teardown/').replace(/\/?$/, '/');

fs.rmSync(DIST, {recursive: true, force: true});
fs.mkdirSync(path.join(DIST, 'assets'), {recursive: true});

const res = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/main.js')],
  bundle: true,
  format: 'esm',
  minify: !debug,
  sourcemap: debug ? 'inline' : false,
  write: false,
  target: 'es2022',
  legalComments: 'none',
  logLevel: 'warning',
  define: {__BUILD__: JSON.stringify(new Date(0).toISOString())},
});
const js = res.outputFiles[0].contents;
const hash = crypto.createHash('sha256').update(js).digest('hex').slice(0, 10);
const jsName = `app-${hash}.js`;
fs.writeFileSync(path.join(DIST, 'assets', jsName), js);

const fonts = [
  ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'inter.woff2'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2', 'jbmono-500.woff2'],
];
for (const [src, dst] of fonts) fs.copyFileSync(path.join(ROOT, 'node_modules', src), path.join(DIST, 'assets', dst));
for (const f of ['social-preview.png', 'favicon.svg']) {
  const p = path.join(ROOT, 'public', f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(DIST, f));
}
const commit = process.env.GITHUB_SHA || (() => {
  try {
    return fs.readFileSync(path.join(ROOT, '.git', fs.readFileSync(path.join(ROOT, '.git/HEAD'), 'utf8').trim().replace('ref: ', '')), 'utf8').trim();
  } catch {
    return 'local';
  }
})();

const title = 'Underwood No. 5 — Teardown Simulator';
const desc = 'An interactive 3D teardown of an Underwood No. 5 typewriter: type on it, open every mechanism, watch one deterministic model drive keys, typebars, ribbon, escapement and carriage.';
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="#eeeae0">
<meta name="build-commit" content="${commit}">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="canonical" href="${SITE}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${SITE}">
<meta property="og:image" content="${SITE}social-preview.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="A gloss-black Underwood No. 5 typewriter model on a pale studio floor, surrounded by live instrument panels.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${SITE}social-preview.png">
<link rel="preload" href="assets/inter.woff2" as="font" type="font/woff2" crossorigin>
<style>
@font-face{font-family:'Inter';font-weight:100 900;font-style:normal;font-display:block;src:url(assets/inter.woff2) format('woff2')}
@font-face{font-family:'JetBrains Mono';font-weight:500;font-style:normal;font-display:block;src:url(assets/jbmono-500.woff2) format('woff2')}
html,body{margin:0;height:100%;background:#eeeae0;overflow:hidden}
#app{position:absolute;left:0;top:0;width:1600px;height:900px;transform-origin:0 0}
#gl{position:absolute;inset:0;width:1600px;height:900px;display:block}
#boot{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font:600 11px/1 Inter,system-ui,sans-serif;letter-spacing:2px;color:#8a857a;text-transform:uppercase}
noscript{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font:14px system-ui}
</style>
</head>
<body>
<div id="app"></div>
<div id="boot">Assembling the Underwood&hellip;</div>
<noscript>This simulator needs JavaScript and WebGL.</noscript>
<script type="module" src="assets/${jsName}"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(DIST, 'index.html'), html);
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
fs.writeFileSync(path.join(DIST, 'version.json'), JSON.stringify({commit, js: jsName}));
console.log(`dist/index.html ${(html.length / 1024).toFixed(1)} KB · assets/${jsName} ${(js.length / 1024).toFixed(0)} KB`);
