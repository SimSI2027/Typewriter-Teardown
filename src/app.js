// The frame core shared by the live page and the film: one call poses the machine from the model state, blends the
// view, draws the 3D frame, works out the callouts (projected from the parts themselves) and redraws the console.
import * as THREE from 'three';
import {CHAR_KEYS, FN} from './keyboard.js';
import {BELL, CARRIAGE, ESC, EXPLODE, KEYS, MAINSPRING, PITCH, PLATEN, PRINT, RIBBON, BASKET, PAPER} from './params.js';
import {barPose, keyLever, link, SEG_Y, RACK_Y} from './kinematics.js';
import {buildMachine} from './machine.js';
import {createStage} from './stage.js';
import {createConsole} from './console/console.js';
import {accentOf, viewAt} from './views.js';

const V = new THREE.Vector3();

// callouts per view: anchor name, label, sub-label, screen offset of the label from the part
const CALLOUTS = {
  hero: [['basket', 'Typebar basket', '42 BARS · FRONT STRIKE', [-190, 40]], ['wheel', 'Escapement', 'RACK · PINION · STAR WHEEL', [300, 40]], ['platen', 'Platen', '28-TOOTH LINE SPACE', [-200, -60]], ['spoolR', 'Ribbon spool', 'BLACK OVER RED', [150, 120]]],
  linkage: [['key', 'Glass key', 'NICKEL RIM · 14 MM DIP', [70, 60]], ['lever', 'Key lever', 'REAR FULCRUM', [-150, 70]], ['link', 'Sublever link', 'PULLS THE TYPEBAR HEEL', [140, -50]], ['bar', 'Typebar', 'SWINGS ON THE SEGMENT', [-170, -60]]],
  basket: [['bar', 'Typebar', 'IN FLIGHT TO THE PLATEN', [150, -60]], ['segment', 'Segment', 'SLOTTED PIVOT ARC', [-190, 30]], ['ubar', 'Universal bar', 'TRIPS THE ESCAPEMENT', [170, 70]]],
  impact: [['slug', 'Type slug', 'TWO CHARACTERS PER SLUG', [150, 60]], ['ribbonPt', 'Ribbon', 'LIFTED BY THE VIBRATOR', [-180, 50]], ['paperPt', 'Paper on platen', 'PRINTING POINT', [-170, -80]]],
  ribbonLift: [['vibrator', 'Ribbon vibrator', 'BLACK: UPPER HALF · RED: LOWER', [170, 70]], ['ribbonPt', 'Ribbon', 'CROSSES THE PRINTING POINT', [-190, -50]]],
  ribbonFeed: [['spoolL', 'Spool', 'WINDS AS THE FEED RATCHET TURNS', [-150, -60]], ['ratchet', 'Feed ratchet', 'ONE TOOTH PER STROKE', [-160, 70]], ['spoolR', 'Spool', 'AUTOMATIC REVERSE', [150, -60]]],
  ubar: [['ubar', 'Universal bar', 'EVERY HEEL PUSHES IT', [-170, 60]], ['trip', 'Rocker trip', 'TO THE ESCAPEMENT', [160, -50]]],
  escapement: [['wheel', 'Star wheel', '36 TEETH · 1 TOOTH = 1 SPACE', [-190, -50]], ['dogs', 'Loose & rigid dogs', 'ON THE ROCKER', [-170, 70]], ['pinion', 'Pinion', 'MESHES THE CARRIAGE RACK', [170, 60]], ['rackPt', 'Carriage rack', 'DRIVEN BY THE MAINSPRING', [160, -70]]],
  carriage: [['rails', 'Carriage rails', 'TWO ROUND RAILS', [170, 60]], ['rackPt', 'Rack', 'UNDER THE CARRIAGE', [-160, 70]], ['platen', 'Platen', 'ON THE SUBCARRIAGE', [-170, -60]]],
  mainspring: [['drum', 'Mainspring drum', 'PULLS THE CARRIAGE LEFT', [-160, 60]], ['band', 'Drawband', 'TO THE CARRIAGE END', [150, -60]]],
  shift: [['liftRod', 'Lift rod', 'RAISES THE SUBCARRIAGE', [150, 70]], ['subcar', 'Subcarriage', 'UP 5 MM FOR CAPITALS', [-160, -60]]],
  backspace: [['bsPawl', 'Backspace pawl', 'PUSHES THE RACK BACK ONE TOOTH', [-170, -60]], ['rackPt', 'Carriage rack', '', [160, 60]]],
  bell: [['bell', 'Margin bell', '7 SPACES BEFORE THE LOCK', [190, -40]], ['hammer', 'Hammer', 'TRIPPED BY THE MARGIN STOP', [180, 70]], ['stop', 'Margin stop', 'ON THE CARRIAGE', [-160, -60]]],
  ret: [['retLever', 'Return lever', 'LINE SPACE, THEN RETURN', [150, -60]], ['ratchet28', 'Line-space ratchet', '28 TEETH · 1/6 IN PER TOOTH', [-170, 60]], ['paperPt', 'Paper', 'FED BY THE PLATEN', [170, 70]]],
  spacing: [['ratchet28', 'Line-space ratchet', 'PAWL TURNS 1, 2 OR 3 TEETH', [150, 60]], ['spacingSel', 'Spacing selector', 'SINGLE · DOUBLE · TRIPLE', [-160, -60]]],
  platen: [['platen', 'Platen', 'RUBBER · Ø 37.7 MM', [160, -60]], ['knob', 'Platen knob', '', [-150, -40]], ['paperPt', 'Paper', 'WRAPS UNDER THE PLATEN', [150, 70]]],
  explode: [['basket', 'Typebars', '', [-150, -40]], ['wheel', 'Escapement', '', [160, 50]], ['platen', 'Carriage & platen', '', [-150, -60]], ['key', 'Keys', '', [-150, 50]]],
};

export function createApp({capture = false} = {}) {
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const machine = buildMachine();
  const st = createStage(canvas, machine, {capture});
  const ui = createConsole(app);
  const nodes = machine.nodes;
  const node = (a, i = 0) => nodes[a][i];

  /** a part's point (machine mm in its node's frame) → world (metres) */
  const world = (n, p) => n.localToWorld(V.set(p[0], p[1], p[2])).clone();
  const lastKeyOf = (S, s) => {
    if (s.activeKey >= 0) return s.activeKey;
    const g = S.glyphs[s.glyphCount - 1];
    return g ? g.key : CHAR_KEYS.findIndex((k) => k.lo === 'e');
  };

  /** world point of a named anchor for state s */
  function anchor(name, s, S) {
    const kid = lastKeyOf(S, s);
    const key = CHAR_KEYS[kid];
    const slot = s.slot >= 0 ? s.slot : key.slot;
    const deg = s.slot >= 0 ? s.barDeg : BASKET.restDeg;
    const half = CARRIAGE.frameLen / 2;
    switch (name) {
      case 'basket':
        return world(node('typebars'), barPose(14, BASKET.restDeg).tip);
      case 'bar':
        return world(node('typebars'), (() => {
          const b = barPose(slot, deg);
          return [(b.pivot[0] + b.tip[0]) / 2, (b.pivot[1] + b.tip[1]) / 2, (b.pivot[2] + b.tip[2]) / 2];
        })());
      case 'slug':
        return world(node('typebars'), barPose(slot, deg).tip);
      case 'segment':
        return world(node('segment'), barPose(8, 0).pivot);
      case 'ubar':
        return world(node('ubar'), [0, SEG_Y - 7, BASKET.segR + 9 + s.ub * 2.6]);
      case 'trip':
        return world(node('ubar'), [0, 152, -99]);
      case 'key': {
        const d = s.activeKey === kid ? s.keyDepth : 0;
        return world(machine.parts.keys.rowNodes[key.row], [key.x, key.y - d, key.z]);
      }
      case 'lever': {
        const L = keyLever(key, s.activeKey === kid ? s.keyDepth : 0);
        return world(node('levers'), [key.x, (L.front[1] + KEYS.leverY) / 2 - 3, (L.front[2] + KEYS.fulcrumZ) / 2]);
      }
      case 'link': {
        const ln = link(key, s.activeKey === kid ? s.sublever : 0, deg);
        return world(node('linkage'), [(ln.a[0] + ln.b[0]) / 2, (ln.a[1] + ln.b[1]) / 2, (ln.a[2] + ln.b[2]) / 2]);
      }
      case 'vibrator':
        return world(node('vibrator'), [11, PRINT.y + RIBBON.restTop - RIBBON.width + s.ribbonLift, RIBBON.z + 2]);
      case 'ribbonPt':
        return world(node('ribbon'), [20, PRINT.y + RIBBON.restTop - RIBBON.width * 0.5 + s.ribbonLift * 0.6, RIBBON.z]);
      case 'spoolL':
        return world(node('ribbon'), [-RIBBON.spoolX, RIBBON.spoolY + 16, RIBBON.spoolZ]);
      case 'spoolR':
        return world(node('ribbon'), [RIBBON.spoolX, RIBBON.spoolY + 16, RIBBON.spoolZ]);
      case 'ratchet':
        return world(node('ribbon'), [-RIBBON.spoolX + 10, RIBBON.spoolY - 9, RIBBON.spoolZ + 8]);
      case 'wheel':
        return world(node('escapement'), [0, ESC.axisY + ESC.wheelR, ESC.wheelZ]);
      case 'dogs':
        return world(node('escapement'), [0, ESC.axisY - ESC.wheelR - 6, ESC.wheelZ]);
      case 'pinion':
        return world(node('escapement'), [0, ESC.axisY - ESC.pinionR, ESC.pinionZ]);
      case 'rackPt':
        return world(node('rack'), [-s.carriageX + 30, RACK_Y + 4, ESC.pinionZ]);
      case 'rails':
        return world(node('rails'), [150, CARRIAGE.railY, CARRIAGE.railZ[1]]);
      case 'platen':
        return world(node('platen'), [-80, PRINT.y + PLATEN.r, PLATEN.z]);
      case 'knob':
        return world(node('platen'), [half + 20, PRINT.y + PLATEN.r, PLATEN.z]);
      case 'ratchet28':
        return world(node('platen'), [-(PLATEN.length / 2 + 6), PRINT.y + PLATEN.r + 3, PLATEN.z]);
      case 'paperPt':
        return world(node('paper'), [-s.carriageX + 18, PRINT.y + 5, 0.8]);
      case 'subcar':
        return world(node('platen'), [100, PRINT.y + 20, PLATEN.z + 22]);
      case 'retLever':
        return world(node('return'), [-half - 50, PRINT.y + 21, PLATEN.z + 72]);
      case 'spacingSel':
        return world(node('return'), [-half - 2, PRINT.y + 44, PLATEN.z - 18]);
      case 'bell':
        return world(node('bell', 1), [BELL.x - 14, BELL.y + 14, BELL.z]);
      case 'hammer':
        return world(node('bell', 1), [BELL.x, BELL.y + 4, BELL.z + BELL.r + 10]);
      case 'stop':
        return world(node('bell', 0), [machine.parts.carriage.stopX(CARRIAGE.rightMargin), CARRIAGE.railY + 22, -133]);
      case 'drum':
        return world(node('mainspring'), [MAINSPRING.drumX, MAINSPRING.drumY + 10, MAINSPRING.drumZ]);
      case 'band':
        return world(node('mainspring'), [(MAINSPRING.drumX + s.carriageX + half) / 2, MAINSPRING.bandY, MAINSPRING.drumZ + MAINSPRING.drumR]);
      case 'liftRod':
        return world(node('shift'), [176, 120 + s.shiftMM, -92]);
      case 'bsPawl':
        return world(node('backspace'), [34, 186 + s.backPawl * 6, -104]);
      case 'lever3d':
        return world(node('return'), [-half - 46, PRINT.y + 22, PLATEN.z + 70]);
      default:
        return null;
    }
  }

  /** the screen point of a 3D anchor for the tour cursor (a key cap, the return lever) */
  function pressPoint(kind, act, s, S) {
    let p = null;
    if (kind === 'key' && act.type === 'char') {
      const k = CHAR_KEYS[act.key];
      p = world(machine.parts.keys.rowNodes[k.row], [k.x, k.y, k.z]);
    } else if (kind === 'key' && act.type === 'space') {
      p = world(node('spacebar'), [60, KEYS.spacebar.y + 3, KEYS.spacebar.z]);
    } else if (kind === 'shift') {
      const k = FN.shiftL;
      p = world(machine.parts.keys.rowNodes[0], [k.x, k.y, k.z]);
    } else if (kind === 'lever') p = anchor('lever3d', s, S);
    return p ? st.projectWorld(p) : null;
  }

  /**
   * draw one frame.
   * F: {S, tau, viewEvents, viewT, camOverride, cursor(fn|obj), live fields for the console}
   */
  function frame(F) {
    const S = F.S;
    const s = S.stateAt(F.tau);
    const v = viewAt(F.viewEvents, F.viewT, EXPLODE, F.camOverride);
    const acc = accentOf(s);
    machine.update(s, S, {...v.look, accent: acc});
    st.frame(v.cam);
    machine.root.updateMatrixWorld(true);
    // callouts: label offsets from the projected part, fading in after a view change
    const list = CALLOUTS[v.sub || v.camId] || (v.camId === 'hero' || !v.sub ? CALLOUTS.hero : []);
    const vis = Math.min(1, Math.max(0, (v.since - 0.9) / 0.5)) * (F.callouts === false ? 0 : 1);
    const callouts = [];
    for (const [a, name, sub, off] of list) {
      const w = anchor(a, s, S);
      const at = w ? st.projectWorld(w) : null;
      if (!at) continue;
      const lx = Math.min(1270, Math.max(330, at[0] + off[0]));
      const ly = Math.min(770, Math.max(110, at[1] + off[1]));
      const asm = {basket: 'typebars', bar: 'typebars', slug: 'typebars', key: 'keys', lever: 'levers', link: 'linkage', wheel: 'escapement', dogs: 'escapement', pinion: 'escapement', rackPt: 'rack', platen: 'platen', ratchet28: 'platen', retLever: 'return', vibrator: 'vibrator', ribbonPt: 'ribbon', spoolL: 'ribbon', spoolR: 'ribbon', ratchet: 'ribbon', ubar: 'ubar', trip: 'ubar', bell: 'bell', hammer: 'bell', stop: 'bell', drum: 'mainspring', band: 'mainspring', liftRod: 'shift', subcar: 'shift', bsPawl: 'backspace', paperPt: 'paper', rails: 'rails'}[a];
      callouts.push({name, sub, at, label: [lx, ly], align: off[0] >= 0 ? 'right' : 'left', o: vis, hot: (acc[asm] || 0) > 0.5});
    }
    const cursor = typeof F.cursor === 'function' ? F.cursor((kind, act) => pressPoint(kind, act, s, S)) : F.cursor;
    // the line on the paper: printed glyphs on the current line, the carriage position marked
    const lineHtml = paperLine(S, s);
    const charNow = s.action === 'char' ? {ch: S.acts[s.actionIndex].glyph, upper: S.acts[s.actionIndex].upper} : s.action === 'space' ? {ch: ' '} : null;
    ui.update({
      ...F.ui,
      s,
      session: S,
      charNow,
      lastKey: lastKeyOf(S, s),
      paperLine: lineHtml,
      camId: v.camId,
      sub: v.sub,
      xray: v.xray,
      cutaway: v.cutaway,
      callouts,
      cursor,
      heavy: F.heavy,
    });
    frame.lastState = {s, S};
    return {s, v};
  }

  function paperLine(S, s) {
    const lines = s.lines;
    const cells = new Map();
    for (let i = 0; i < s.glyphCount; i++) {
      const g = S.glyphs[i];
      if (Math.abs(g.lines - Math.round(lines)) < 0.01) cells.set(g.col, g);
    }
    // a 34-column window that keeps the printing point in view
    const W = 34;
    const c0 = Math.max(0, Math.min(CARRIAGE.cols - W, s.col - 22));
    let h = '';
    for (let c = c0; c < c0 + W; c++) {
      const g = cells.get(c);
      const chr = g ? g.ch.replace('&', '&amp;').replace('<', '&lt;') : c === s.col ? '▏' : c === CARRIAGE.leftMargin || c === CARRIAGE.rightMargin ? '¦' : '·';
      const col = g ? (g.color === 'red' ? '#a3262b' : '#17181b') : c === s.col ? '#b07a22' : '#d4cfc4';
      h += `<span style="color:${col}">${chr}</span>`;
    }
    return h;
  }
  /** screen point of a key cap (tests, accessibility helpers) */
  const keyScreen = (k) => st.projectWorld(world(machine.parts.keys.rowNodes[k.row], [k.x, k.y, k.z]));
  const partScreen = (name) => {
    const s = frame.lastState;
    const w = s ? anchor(name, s.s, s.S) : null;
    return w ? st.projectWorld(w) : null;
  };
  /** validation: world boxes (mm) of every visible mesh, per instance for instanced meshes, grouped by assembly */
  const boxes = () => {
    machine.root.updateMatrixWorld(true);
    const out = {};
    const B = new THREE.Box3();
    const M = new THREE.Matrix4();
    const mm = (b, name, id) => [b.min.x * 1000, b.min.y * 1000, b.min.z * 1000, b.max.x * 1000, b.max.y * 1000, b.max.z * 1000, name, id];
    for (const [a, list] of Object.entries(nodes)) {
      const arr = (out[a] = []);
      for (const n of list)
        n.traverseVisible((o) => {
          if (!o.isMesh || !o.geometry) return;
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          if (o.isInstancedMesh) {
            for (let i = 0; i < o.count; i++) {
              o.getMatrixAt(i, M);
              B.copy(o.geometry.boundingBox).applyMatrix4(M.premultiply(o.matrixWorld));
              arr.push(mm(B, `${o.name || "inst"}#${i}`, `${o.id}#${i}`));
            }
          } else {
            B.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
            arr.push(mm(B, o.name || o.parent?.name || "", String(o.id)));
          }
        });
    }
    return out;
  };
  return {machine, st, ui, frame, anchor, keyScreen, partScreen, boxes, PITCH, PAPER};
}
