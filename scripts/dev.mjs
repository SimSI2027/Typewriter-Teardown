// Development: debug build (unminified, inline source maps), rebuild on change, serve on :5173.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {serve} from './serve.mjs';
const build = () => spawnSync(process.execPath, ['scripts/build.mjs', '--debug'], {stdio: 'inherit'});
build();
const s = await serve({dir: 'dist', port: 5173, base: '/Typewriter-Teardown/'});
console.log(`dev: ${s.url}  (rebuilds on save in src/)`);
let timer = null;
fs.watch('src', {recursive: true}, () => {
  clearTimeout(timer);
  timer = setTimeout(build, 150);
});
