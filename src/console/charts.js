// The two live charts. Neither is canned: each samples the authoritative session over the action that is running (or
// the last one that ran) and puts a cursor at the current moment. Chart 1 — key to strike: key travel, typebar angle,
// ribbon height, impact marker. Chart 2 — carriage and escapement: universal bar / rocker travel, escapement wheel
// position, carriage displacement, the one-space step.
import {BASKET, KEYS, PH, RIBBON} from '../params.js';
import {STRIKE_DEG} from '../model.js';

const C = {ink: '#17181b', mute: '#8a8780', faint: '#cbc6bb', line: '#e2ddd2', acc: '#b07a22', key: '#3a6ea8', ribbon: '#a3262b', grey: '#5e636b'};
const N = 72;
const cache = new Map();
// write markup only when it changed (the charts redraw every frame; at rest nothing changes) — D-14
const last = new WeakMap();
const put = (node, html, text = false) => {
  if (last.get(node) === html) return;
  last.set(node, html);
  if (text) node.textContent = html;
  else node.innerHTML = html;
};
// short escapement phase names for the chart header
const ESC_SHORT = {'HELD ON LOOSE DOG': 'LOOSE DOG', 'HELD ON RIGID DOG': 'RIGID DOG', 'ROCKER TILTING': 'TILTING', 'ADVANCING ONE TOOTH': 'STEPPING', 'PINION FREEWHEELS': 'FREEWHEEL'};

/** samples of the session over action i (cached per session id + action index) */
function samples(S, i) {
  const a0 = S.acts[i];
  const key = `${S.id}:${i}:${a0 ? `${a0.t0}:${a0.type}:${a0.key ?? ''}` : 0}`; // D-17
  let v = cache.get(key);
  if (v) return v;
  const a = S.acts[i];
  const out = [];
  for (let j = 0; j <= N; j++) out.push(S.stateAt(a.t0 + (j / N) * a.dur * 0.9999));
  v = {a, out};
  if (cache.size > 64) cache.clear();
  cache.set(key, v);
  return v;
}
/** the action the charts follow: the running one, else the most recent; prefer strokes (char / space) */
function followed(F) {
  const S = F.session;
  if (!S || !S.acts.length) return null;
  let i = S.indexAt(F.s.t);
  // follow the last stroke (a key, the space bar, backspace, return), not shift or setting changes
  while (i >= 0 && !['char', 'space', 'backspace', 'ret', 'locked'].includes(S.acts[i].type)) i--;
  if (i < 0) return null;
  return {i, p: Math.min(1, Math.max(0, (F.s.t - S.acts[i].t0) / S.acts[i].dur))};
}
const path = (pts) => pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');

function frame(W, H, padL, padB, labels) {
  let h = '';
  const X0 = padL;
  const X1 = W - 8;
  const Y0 = 10;
  const Y1 = H - padB;
  for (const v of [0, 0.5, 1]) {
    const y = Y1 - v * (Y1 - Y0);
    h += `<line x1="${X0}" x2="${X1}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${v ? C.line : C.ink}" stroke-width="${v ? 0.7 : 0.8}"/>`;
  }
  labels.forEach(([v, t]) => (h += `<text x="${X0 - 4}" y="${(Y1 - v * (Y1 - Y0) + 2.5).toFixed(1)}" font-size="6.5" text-anchor="end" fill="${C.mute}">${t}</text>`));
  return {h, X: (p) => X0 + p * (X1 - X0), Y: (v) => Y1 - v * (Y1 - Y0), Y0, Y1, X0, X1};
}

export function drawKeyChart(svg, info, leg, F) {
  const W = 254;
  const H = 138;
  const fol = followed(F);
  const g = frame(W, H, 20, 18, [[0, '0'], [0.5, '½'], [1, 'MAX']]);
  let h = g.h;
  const s = F.s;
  if (!fol) {
    put(svg, h + `<text x="${W / 2}" y="${H / 2}" font-size="8" text-anchor="middle" letter-spacing="1.4" fill="${C.mute}">PRESS A KEY</text>`);
    put(info, 'IDLE', true);
    return;
  }
  const {a, out} = samples(F.session, fol.i);
  const isChar = a.type === 'char';
  const keyN = (q) => (q.keyDepth || q.spaceDepth || q.backDepth || q.shiftKey * KEYS.travel * 0.8) / KEYS.travel;
  const barN = (q) => (q.slot >= 0 ? (q.barDeg - BASKET.restDeg) / (STRIKE_DEG - BASKET.restDeg) : 0);
  const ribN = (q) => q.ribbonLift / RIBBON.lift.red;
  const xs = out.map((_, j) => g.X(j / N));
  if (isChar) {
    const xi = g.X(PH.impact);
    h += `<line x1="${xi}" x2="${xi}" y1="${g.Y0}" y2="${g.Y1}" stroke="${C.acc}" stroke-width=".9" stroke-dasharray="2 2"/><text x="${xi + 3}" y="${g.Y0 + 6}" font-size="6.4" letter-spacing=".8" fill="${C.acc}">IMPACT</text>`;
  }
  h += `<path d="${path(out.map((q, j) => [xs[j], g.Y(keyN(q))]))}" fill="none" stroke="${C.key}" stroke-width="1.4"/>`;
  h += `<path d="${path(out.map((q, j) => [xs[j], g.Y(barN(q))]))}" fill="none" stroke="${C.ink}" stroke-width="1.5"/>`;
  h += `<path d="${path(out.map((q, j) => [xs[j], g.Y(ribN(q))]))}" fill="none" stroke="${C.ribbon}" stroke-width="1.3"/>`;
  // the current moment, drawn from this frame's state
  const cx = g.X(fol.p);
  h += `<line x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${g.Y0 - 4}" y2="${g.Y1}" stroke="${C.acc}" stroke-width="1.4"/>`;
  for (const [v, col] of [[keyN(s), C.key], [barN(s), C.ink], [ribN(s), C.ribbon]]) h += `<circle cx="${cx.toFixed(1)}" cy="${g.Y(v).toFixed(1)}" r="2.4" fill="${col}"/>`;
  h += `<text x="${g.X0}" y="${H - 5}" font-size="6.4" letter-spacing="1" fill="${C.mute}">0</text><text x="${g.X1}" y="${H - 5}" font-size="6.4" letter-spacing="1" text-anchor="end" fill="${C.mute}">${(a.dur * 1000).toFixed(0)} MS · ONE ${a.type === 'char' ? 'KEYSTROKE' : a.type.toUpperCase()}</text>`;
  put(svg, h);
  put(info, `P ${fol.p.toFixed(2)}`, true);
  put(leg, `<span style="color:${C.key}">—</span> KEY <b>${(s.keyDepth || s.spaceDepth || s.backDepth).toFixed(1)}</b> MM &nbsp;<span style="color:${C.ink}">—</span> BAR <b>${s.barDeg.toFixed(0)}°</b> &nbsp;<span style="color:${C.ribbon}">—</span> RIBBON <b>${s.ribbonLift.toFixed(1)}</b>`);
}

export function drawEscChart(svg, info, leg, F) {
  const W = 254;
  const H = 138;
  const fol = followed(F);
  const s = F.s;
  if (!fol) {
    const g = frame(W, H, 20, 18, []);
    put(svg, g.h);
    put(info, 'IDLE', true);
    return;
  }
  const {a, out} = samples(F.session, fol.i);
  const c0 = a.before.col;
  const w0 = a.before.wheel;
  const disp = out.map((q) => q.colPos - c0);
  let lo = Math.min(0, ...disp);
  let hi = Math.max(1, ...disp);
  if (hi - lo < 1.2) hi = lo + 1.2;
  const big = hi - lo > 3;
  const g = frame(W, H, 20, 18, big ? [[0, `${Math.round(lo)}`], [1, `+${Math.round(hi)}`]] : [[0, '0'], [(1 - lo) / (hi - lo), '1 SP'], [1, '']]);
  let h = g.h;
  const xs = out.map((_, j) => g.X(j / N));
  const yN = (v) => g.Y((v - lo) / (hi - lo));
  // one character: dashed line at +1 space (the step the escapement allows)
  if (!big) h += `<line x1="${g.X0}" x2="${g.X1}" y1="${yN(1).toFixed(1)}" y2="${yN(1).toFixed(1)}" stroke="${C.acc}" stroke-width=".8" stroke-dasharray="3 2"/>`;
  // universal bar / rocker (0..1, drawn in the lower band)
  h += `<path d="${path(out.map((q, j) => [xs[j], g.Y(q.ub * 0.45)]))}" fill="none" stroke="${C.grey}" stroke-width="1.2"/>`;
  // escapement wheel advance (teeth) and carriage displacement (spaces): equal by construction of the rack and pinion,
  // except during a return or a backspace, where the pinion freewheels and the wheel stays
  h += `<path d="${path(out.map((q, j) => [xs[j], yN(q.wheel - w0)]))}" fill="none" stroke="${C.key}" stroke-width="1.3" stroke-dasharray="${a.type === 'ret' || a.type === 'backspace' ? '2 2' : ''}"/>`;
  h += `<path d="${path(out.map((q, j) => [xs[j], yN(disp[j])]))}" fill="none" stroke="${C.ink}" stroke-width="1.6"/>`;
  // trip and reset markers from the samples (where the escapement phase changes)
  let prev = out[0].escPhase;
  out.forEach((q, j) => {
    if (q.escPhase !== prev) {
      if (q.escPhase === 'HELD ON RIGID DOG' || q.escPhase === 'ADVANCING ONE TOOTH') h += `<line x1="${xs[j]}" x2="${xs[j]}" y1="${g.Y1}" y2="${g.Y1 - 6}" stroke="${C.acc}" stroke-width="1.2"/>`;
      prev = q.escPhase;
    }
  });
  const cx = g.X(fol.p);
  h += `<line x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${g.Y0 - 4}" y2="${g.Y1}" stroke="${C.acc}" stroke-width="1.4"/>`;
  h += `<circle cx="${cx.toFixed(1)}" cy="${yN(s.colPos - c0).toFixed(1)}" r="2.6" fill="${C.ink}"/><circle cx="${cx.toFixed(1)}" cy="${yN(s.wheel - w0).toFixed(1)}" r="2" fill="${C.key}"/><circle cx="${cx.toFixed(1)}" cy="${g.Y(s.ub * 0.45).toFixed(1)}" r="2" fill="${C.grey}"/>`;
  h += `<text x="${g.X1}" y="${H - 5}" font-size="6.4" letter-spacing="1" text-anchor="end" fill="${C.mute}">${a.type === 'ret' ? 'CARRIAGE RETURN' : a.type === 'backspace' ? 'BACKSPACE' : 'ONE STROKE'} · COL ${c0} → ${a.after.col}</text>`;
  put(svg, h);
  put(info, ESC_SHORT[s.escPhase] || s.escPhase, true); // D-15: fits beside the title
  put(leg, `<span style="color:${C.ink}">—</span> CARR <b>${(s.colPos - c0).toFixed(2)}</b> &nbsp;<span style="color:${C.key}">—</span> WHEEL <b>${(s.wheel - w0).toFixed(2)}</b> &nbsp;<span style="color:${C.grey}">—</span> ROCKER <b>${s.rockerDeg.toFixed(1)}°</b>`);
}
