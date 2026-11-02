// The live schematic: a side section through the working linkage (operator on the right), redrawn every frame from
// the same kinematics that pose the 3D parts — key, stem, key lever on its fulcrum, sublever, link, typebar on the
// segment (drawn in its own swing plane), the slug's path, ribbon and vibrator, paper and platen. An inset shows the
// escapement: star wheel, loose and rigid dogs, the carriage's direction.
import {CHAR_KEYS} from '../keyboard.js';
import {BASKET, ESC, KEYS, PLATEN, PRINT, RIBBON, CARRIAGE} from '../params.js';
import {barPose, keyLever, sublever, SEG_Y} from '../kinematics.js';
import {LINK_PULL} from '../model.js';

const C = {ink: '#17181b', mute: '#8a8780', faint: '#cbc6bb', line: '#e2ddd2', acc: '#b07a22', red: '#a3262b'};
const D2R = Math.PI / 180;
const S = 0.78;
const X = (z) => 10 + (z + 70) * S;
const Y = (y) => 198 - (y - 28) * S;
const f = (v) => v.toFixed(1);
const lastSvg = new WeakMap();

export function drawSchematic(svg, info, F) {
  const s = F.s;
  // the key whose linkage is drawn: the active one, else the last struck, else 'e'
  const kid = s.activeKey >= 0 ? s.activeKey : F.lastKey ?? CHAR_KEYS.findIndex((k) => k.lo === 'e');
  const key = CHAR_KEYS[kid];
  const active = s.activeKey === kid && s.action === 'char';
  const depth = active ? s.keyDepth : 0;
  const kk = active ? s.sublever : 0;
  const deg = active ? s.barDeg : BASKET.restDeg;
  const hot = (on) => (on ? C.acc : C.ink);
  let h = '';
  // the bar is drawn in its own radial plane, mapped onto the section: radial distance from the printing point → z
  const b = barPose(key.slot, deg);
  const rad = (p) => Math.hypot(p[0], p[2]);
  const bz = (p) => rad(p);
  // ------------------------------------------------------------ platen, paper, ribbon
  const pz = PLATEN.z;
  const py = PRINT.y + s.shiftMM;
  h += `<circle cx="${f(X(pz))}" cy="${f(Y(py))}" r="${f(PLATEN.r * S)}" fill="#2a2a2c" stroke="${C.ink}" stroke-width="1"/>`;
  // a radius on the platen that turns with it
  const pa = -s.platenDeg * D2R;
  h += `<line x1="${f(X(pz))}" y1="${f(Y(py))}" x2="${f(X(pz + PLATEN.r * Math.cos(pa)))}" y2="${f(Y(py + PLATEN.r * Math.sin(pa)))}" stroke="#8a8a8a" stroke-width="1"/>`;
  h += `<path d="M${f(X(0.4))} ${f(Y(py + 46))} L${f(X(0.4))} ${f(Y(py))} A${f(PLATEN.r * S + 0.3)} ${f(PLATEN.r * S + 0.3)} 0 0 1 ${f(X(pz - PLATEN.r * 0.8))} ${f(Y(py - PLATEN.r * 0.6))}" fill="none" stroke="#bdb6a6" stroke-width="1.6"/>`;
  const rTop = PRINT.y + RIBBON.restTop + s.ribbonLift;
  h += `<line x1="${f(X(RIBBON.z + 1))}" x2="${f(X(RIBBON.z + 1))}" y1="${f(Y(rTop))}" y2="${f(Y(rTop - RIBBON.width / 2))}" stroke="#17171a" stroke-width="2.6"/><line x1="${f(X(RIBBON.z + 1))}" x2="${f(X(RIBBON.z + 1))}" y1="${f(Y(rTop - RIBBON.width / 2))}" y2="${f(Y(rTop - RIBBON.width))}" stroke="${C.red}" stroke-width="2.6"/>`;
  h += `<line x1="${f(X(RIBBON.z + 3))}" x2="${f(X(RIBBON.z + 3))}" y1="${f(Y(rTop - RIBBON.width - 3))}" y2="${f(Y(SEG_Y + 8))}" stroke="${hot(s.ribbonLift > 0.3)}" stroke-width="1"/>`;
  // printing line marker
  h += `<line x1="${f(X(-4))}" x2="${f(X(10))}" y1="${f(Y(PRINT.y))}" y2="${f(Y(PRINT.y))}" stroke="${C.acc}" stroke-width=".7" stroke-dasharray="2 1.5"/>`;
  // ------------------------------------------------------------ segment, typebar, slug path
  const segZ = BASKET.segR;
  h += `<rect x="${f(X(segZ - 7))}" y="${f(Y(SEG_Y + 6))}" width="${f(11 * S)}" height="${f(13 * S)}" fill="#fff" stroke="${C.ink}" stroke-width="1"/>`;
  // slug path: the arc the slug face travels about the pivot
  const L = BASKET.L;
  const a0 = BASKET.restDeg * D2R;
  const a1 = BASKET.strikeDeg * D2R;
  const arcPt = (a) => [X(segZ + L * Math.cos(a)), Y(SEG_Y + L * Math.sin(a))];
  const [sx0, sy0] = arcPt(a0);
  const [sx1, sy1] = arcPt(a1);
  h += `<path d="M${f(sx0)} ${f(sy0)} A${f(L * S)} ${f(L * S)} 0 0 0 ${f(sx1)} ${f(sy1)}" fill="none" stroke="${C.faint}" stroke-width=".9" stroke-dasharray="2.5 2"/>`;
  const tipR = bz(b.tip) * (b.tip[2] >= 0 ? 1 : 1);
  const heelR = rad(b.heel);
  const sgn = (p) => (p[0] * b.u[0] + p[2] * b.u[2] >= 0 ? 1 : -1);
  const tz = sgn(b.tip) * tipR;
  const hz = sgn(b.heel) * heelR;
  h += `<line x1="${f(X(hz))}" y1="${f(Y(b.heel[1]))}" x2="${f(X(tz))}" y2="${f(Y(b.tip[1]))}" stroke="${hot(active)}" stroke-width="2"/>`;
  h += `<rect x="${f(X(tz) - 2)}" y="${f(Y(b.tip[1] + 5))}" width="4" height="${f(9 * S)}" fill="${hot(active)}"/>`;
  h += `<circle cx="${f(X(segZ))}" cy="${f(Y(SEG_Y))}" r="2.6" fill="#fff" stroke="${hot(active)}" stroke-width="1.3"/>`;
  // universal bar: a short blade pushed by the heel near the strike
  const ubz = BASKET.segR + 9 + s.ub * 2.6;
  h += `<line x1="${f(X(ubz))}" x2="${f(X(ubz))}" y1="${f(Y(SEG_Y - 4))}" y2="${f(Y(SEG_Y - 10))}" stroke="${hot(s.ub > 0.04)}" stroke-width="2.2"/>`;
  // ------------------------------------------------------------ key, stem, key lever, sublever, link
  const lev = keyLever(key, depth);
  h += `<line x1="${f(X(KEYS.fulcrumZ))}" y1="${f(Y(KEYS.leverY))}" x2="${f(X(lev.front[2]))}" y2="${f(Y(lev.front[1]))}" stroke="${hot(active)}" stroke-width="2.2"/>`;
  h += `<circle cx="${f(X(KEYS.fulcrumZ))}" cy="${f(Y(KEYS.leverY))}" r="2.6" fill="#fff" stroke="${C.ink}" stroke-width="1.3"/>`;
  h += `<line x1="${f(X(key.z))}" y1="${f(Y(KEYS.leverY - depth))}" x2="${f(X(key.z))}" y2="${f(Y(key.y - depth))}" stroke="${C.ink}" stroke-width="1.3"/>`;
  h += `<rect x="${f(X(key.z) - 6)}" y="${f(Y(key.y - depth) - 2)}" width="12" height="4" rx="2" fill="${active ? C.acc : '#efe8d4'}" stroke="${C.ink}" stroke-width="1"/>`;
  const sl = sublever(key, kk);
  h += `<line x1="${f(X(sl.pivot[2]))}" y1="${f(Y(sl.pivot[1]))}" x2="${f(X(sl.end[2]))}" y2="${f(Y(sl.end[1]))}" stroke="${hot(active)}" stroke-width="1.8"/>`;
  h += `<circle cx="${f(X(sl.pivot[2]))}" cy="${f(Y(sl.pivot[1]))}" r="2.2" fill="#fff" stroke="${C.ink}" stroke-width="1.2"/>`;
  h += `<line x1="${f(X(sl.end[2]))}" y1="${f(Y(sl.end[1]))}" x2="${f(X(hz))}" y2="${f(Y(b.heel[1]))}" stroke="${hot(active)}" stroke-width="1" stroke-dasharray="${active ? '' : '3 2'}"/>`;
  // labels
  const lab = (x, y, t, anchor = 'start') => (h += `<text x="${f(x)}" y="${f(y)}" font-size="6.4" letter-spacing=".9" text-anchor="${anchor}" fill="${C.mute}">${t}</text>`);
  lab(X(pz) - 2, Y(py) - PLATEN.r * S - 4, 'PLATEN', 'middle');
  lab(X(key.z) + 8, Y(key.y - depth) + 2, `KEY ${key.up}`);
  lab(X(KEYS.fulcrumZ) - 3, Y(KEYS.leverY) + 10, 'FULCRUM'); // D-15: no longer clipped at the panel edge
  lab(X(segZ) + 6, Y(SEG_Y) + 12, 'SEGMENT');
  lab(X(sl.pivot[2]) - 4, Y(sl.pivot[1]) - 5, 'SUBLEVER', 'end');
  lab(X(RIBBON.z) + 6, Y(rTop) - 2, 'RIBBON');
  // ------------------------------------------------------------ escapement inset (bottom left)
  const ex = 206;
  const ey = 58;
  const R = 22;
  h += `<rect x="${ex - 34}" y="${ey - 36}" width="68" height="76" fill="rgba(255,255,255,.6)" stroke="${C.line}"/>`;
  h += `<text x="${ex}" y="${ey - 27}" font-size="6.2" letter-spacing="1" text-anchor="middle" fill="${C.mute}">ESCAPEMENT</text>`;
  const n = ESC.wheelTeeth;
  let star = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + s.wheelDeg * D2R;
    const a2 = a + (Math.PI * 2) / n / 2;
    star += `${i ? 'L' : 'M'}${f(ex + (R - 3) * Math.cos(a))} ${f(ey + 2 + (R - 3) * Math.sin(a))}L${f(ex + R * Math.cos(a2 - 0.05))} ${f(ey + 2 + R * Math.sin(a2 - 0.05))}`;
  }
  h += `<path d="${star}Z" fill="#fff" stroke="${hot(s.escPhase !== 'HELD ON LOOSE DOG')}" stroke-width=".9"/>`;
  h += `<circle cx="${ex}" cy="${ey + 2}" r="2" fill="${C.ink}"/>`;
  // dogs below the wheel: drawn in or out of the wheel plane (solid in, faint out)
  const dog = (dx, inPlane, label, side) => {
    const op = 0.25 + 0.75 * inPlane;
    // labels outboard of their dog (the two dogs sit 13 px apart) — D-15
    h += `<rect x="${f(ex + dx - 2)}" y="${f(ey + 2 + R - 2)}" width="4" height="9" fill="${C.ink}" opacity="${op.toFixed(2)}"/><text x="${f(ex + dx + side * 4)}" y="${f(ey + 2 + R + 15)}" font-size="5.6" text-anchor="${side < 0 ? 'end' : 'start'}" fill="${C.mute}">${label}</text>`;
  };
  dog(-6 + s.dogCarry * 6, 1 - s.looseDog, 'LOOSE', -1);
  dog(7, s.rigidDog, 'RIGID', 1);
  // carriage direction
  const moving = s.action && Math.abs(s.colPos - Math.round(s.colPos)) > 0.002;
  const dir = s.action === 'ret' || s.action === 'backspace' ? 1 : -1;
  if (moving) h += `<path d="M${ex - 14} ${ey - 18} h28" stroke="${C.acc}" stroke-width="1.3"/><path d="M${dir > 0 ? ex + 14 : ex - 14} ${ey - 18} l${-dir * 5} -3 v6z" fill="${C.acc}"/>`;
  if (lastSvg.get(svg) !== h) {
    lastSvg.set(svg, h);
    svg.innerHTML = h; // D-14: only when the drawing changed
  }
  info.textContent = `KEY ${key.up} · SLOT ${key.slot + 1}`;
}
export {CARRIAGE};
