// Entry. ?film → the capture page (window.SIM.render(t), frame by frame); otherwise the live page.
// Fonts must be ready before any canvas texture (legends, decals, the paper) is drawn.
import {runFilm} from './film.js';
import {runLive} from './live.js';

function fail(msg) {
  const b = document.getElementById('boot');
  if (b) b.textContent = msg;
}

async function boot() {
  await Promise.all([document.fonts.load('700 20px Inter'), document.fonts.load('800 20px Inter'), document.fonts.load('500 20px "JetBrains Mono"')]).catch(() => {});
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) {
    fail('This simulator needs WebGL, which this browser has turned off.');
    return;
  }
  const q = new URLSearchParams(location.search);
  if (q.has('film') || window.__CAPTURE) await runFilm();
  else await runLive();
}
boot().catch((e) => {
  console.error(e);
  fail('The simulator could not start: ' + (e?.message || e));
});
