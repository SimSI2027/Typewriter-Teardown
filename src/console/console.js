// The console: a fixed 1600 × 900 overlay around the machine. Title and the live column top left, readouts, the line
// on the paper, transport / sound / quality bottom left; the two live charts, the schematic and the camera buttons on
// the right; subsystem buttons along the bottom; callouts with thin leaders into the parts. update(frame) redraws
// every live element from the frame's state; nothing on screen is typed in.
import {CARRIAGE, LINE, PITCH} from '../params.js';
import {CAM_BUTTONS, SUB_BUTTONS, SUBSYSTEMS} from '../views.js';
import {drawKeyChart, drawEscChart} from './charts.js';
import {drawSchematic} from './schematic.js';

export const C = {ink: '#17181b', mute: '#8a8780', faint: '#cbc6bb', line: '#e2ddd2', panel: 'rgba(250,248,243,.93)', acc: '#b07a22', accSoft: 'rgba(176,122,34,.14)', red: '#a3262b', blue: '#3a6ea8'};
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.ui.hidden .pnl{display:none}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line};box-shadow:0 1px 2px rgba(40,32,20,.04)}
.cp{font-size:9.6px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap}
.mu{color:${C.mute}}
.tb{position:absolute;height:21px;padding:0 7px;display:flex;align-items:center;justify-content:center;font:600 8.8px Inter,sans-serif;letter-spacing:.9px;text-transform:uppercase;border:1px solid ${C.line};background:#fff;color:${C.ink};white-space:nowrap;pointer-events:auto;cursor:pointer;box-sizing:border-box;border-radius:0}
.tb:hover{border-color:${C.faint};background:#fbfaf6}
.tb:focus-visible{outline:2px solid ${C.acc};outline-offset:1px}
.tb.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.tb.acc{background:${C.acc};color:#fff;border-color:${C.acc}}
.rd{position:absolute;left:0;right:0;height:17.2px;display:flex;align-items:center;justify-content:space-between;padding:0 11px;font-size:9.4px}
.rd span:first-child{font-weight:600;letter-spacing:1.3px;color:${C.mute};text-transform:uppercase}
.rd span:last-child{font-weight:600;color:${C.ink};letter-spacing:.2px;text-align:right}
.rd.hot span:last-child{color:${C.acc}}
.call{position:absolute;white-space:nowrap;pointer-events:none}
.call b{display:inline-block;font-size:12px;font-weight:600;letter-spacing:.1px;background:rgba(250,248,243,.9);padding:1px 5px}
.call span{display:block;font-size:8.6px;font-weight:600;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;margin-top:1px;background:rgba(250,248,243,.9);padding:1px 5px;width:max-content}
.call[style*="text-align:right"] span{margin-left:auto}
.sl{position:absolute;height:22px;pointer-events:auto;cursor:ew-resize}
.sl:focus-visible{outline:2px solid ${C.acc};outline-offset:1px}
.sl i{position:absolute;left:0;right:0;top:10px;height:2px;background:#e2ddd2}
.sl b{position:absolute;top:5px;width:9px;height:12px;margin-left:-4.5px;background:${C.ink}}
.sl em{position:absolute;left:0;top:10px;height:2px;background:${C.acc}}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3));pointer-events:none}
.ring{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid ${C.acc};opacity:0;z-index:49;pointer-events:none}
.chip{position:absolute;left:800px;top:28px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:22px;padding:0 12px;border:1px solid ${C.line};background:rgba(255,255,255,.95);color:${C.ink};font:600 8.8px Inter,sans-serif;letter-spacing:1.3px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.chip i{display:block;width:6px;height:6px;border-radius:50%;background:${C.acc}}
.chip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
@media (prefers-reduced-motion: reduce){.chip.on i{animation:none}}
.paperline{font:500 11px 'JetBrains Mono',monospace;letter-spacing:0;white-space:pre;color:${C.ink}}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};

export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h, parent = ui) => {
    const n = el(h);
    parent.appendChild(n);
    return n;
  };
  const pnl = (h) => {
    const n = add(h);
    n.classList.add('pnl');
    return n;
  };
  const btn = {};
  // the accessible name is the visible text; camera and subsystem buttons that share a word get a distinct name
  const mkBtn = (key, label, x, y, w, extra = '', aria = '') => {
    const b = el(`<button class="tb pnl" type="button" style="left:${x}px;top:${y}px;width:${w}px;${extra}"${aria ? ` aria-label="${aria}"` : ''}>${label}</button>`);
    ui.appendChild(b);
    btn[key] = b;
    return b;
  };

  // ------------------------------------------------------------ title, live column, line gauge
  pnl(`<div style="position:absolute;left:32px;top:30px;width:44px;height:3px;background:${C.acc}"></div>`);
  pnl(`<div style="position:absolute;left:32px;top:42px;font-size:25px;font-weight:800;letter-spacing:.4px">UNDERWOOD NO. 5</div>`);
  pnl(`<div class="cp mu" style="position:absolute;left:33px;top:76px;font-weight:500;font-size:9px;letter-spacing:1.6px">FRONT STRIKE &nbsp;·&nbsp; CARRIAGE SHIFT &nbsp;·&nbsp; PICA 10 / IN</div>`);
  pnl(`<div class="cp" style="position:absolute;left:33px;top:103px;font-weight:600;letter-spacing:2px">COLUMN</div>`);
  const colBig = pnl(`<div style="position:absolute;left:30px;top:116px;font-size:64px;font-weight:800;letter-spacing:-3px;color:${C.acc};line-height:1"></div>`);
  const colSub = pnl(`<div class="cp mu" style="position:absolute;left:150px;top:146px;font-weight:500;line-height:1.5"></div>`);
  const gauge = pnl(`<svg style="position:absolute;left:32px;top:190px;overflow:visible" width="262" height="40"></svg>`);

  // ------------------------------------------------------------ readouts
  const RD = [
    ['char', 'Character'],
    ['phase', 'Phase'],
    ['key', 'Key travel'],
    ['bar', 'Typebar'],
    ['speed', 'Bar speed'],
    ['ribbon', 'Ribbon lift'],
    ['ub', 'Universal bar'],
    ['esc', 'Escapement'],
    ['car', 'Carriage travel'],
    ['spring', 'Mainspring'],
    ['platen', 'Platen'],
    ['line', 'Line'],
    ['shift', 'Shift'],
    ['margin', 'Margin'],
    ['feed', 'Ribbon feed'],
  ];
  const rdPanel = pnl(`<div class="pn" style="left:32px;top:238px;width:262px;height:${RD.length * 17.2 + 30}px"></div>`);
  add(`<div class="cp" style="position:absolute;left:11px;top:10px;font-weight:700">MACHINE STATE</div>`, rdPanel);
  const rdT = add(`<div class="cp mu" style="position:absolute;right:11px;top:10px;font-weight:500"></div>`, rdPanel);
  const rd = {};
  RD.forEach(([k, label], i) => {
    rd[k] = add(`<div class="rd" style="top:${26 + i * 17.2}px"><span>${label}</span><span></span></div>`, rdPanel);
  });

  // ------------------------------------------------------------ the line on the paper
  const lp = pnl(`<div class="pn" style="left:32px;top:536px;width:262px;height:62px;overflow:hidden"></div>`);
  add(`<div class="cp" style="position:absolute;left:11px;top:9px;font-weight:700">ON THE PAPER</div>`, lp);
  const lpInfo = add(`<div class="cp mu" style="position:absolute;right:11px;top:9px;font-weight:500"></div>`, lp);
  const lpText = add(`<div class="paperline" style="position:absolute;left:11px;top:28px;width:240px;height:28px;overflow:hidden"></div>`, lp);

  // ------------------------------------------------------------ transport, sound, quality
  const tp = pnl(`<div class="pn" style="left:32px;top:612px;width:262px;height:272px"></div>`);
  void tp;
  const X0 = 43;
  mkBtn('pause', 'PAUSE', X0, 622, 76, `background:${C.ink};color:#fff;border-color:${C.ink};height:26px`);
  mkBtn('stepB', 'STEP ◀', X0 + 80, 622, 56, 'height:26px');
  mkBtn('stepF', 'STEP ▶', X0 + 140, 622, 56, 'height:26px');
  mkBtn('reset', 'RESET', X0 + 200, 622, 41, 'height:26px');
  const sliders = {};
  const mkSlider = (key, label, y) => {
    pnl(`<div class="cp" style="position:absolute;left:${X0}px;top:${y}px;font-weight:500">${label}</div>`);
    const val = pnl(`<div class="cp" style="position:absolute;right:${1600 - 283}px;top:${y}px;font-weight:700"></div>`);
    const s = el(`<div class="sl pnl" tabindex="0" role="slider" aria-label="${label}" style="left:${X0}px;top:${y + 12}px;width:240px"><i></i><em></em><b></b></div>`);
    ui.appendChild(s);
    sliders[key] = {el: s, val, knob: s.querySelector('b'), fill: s.querySelector('em'), x: X0, w: 240, y: y + 23};
    return sliders[key];
  };
  mkSlider('speed', 'PLAYBACK SPEED', 658);
  mkSlider('time', 'TIMELINE', 696);
  mkBtn('slow', 'SLOW MOTION', X0, 738, 118);
  mkBtn('mute', 'SOUND ON', X0 + 122, 738, 118);
  mkSlider('vol', 'VOLUME', 766);
  pnl(`<div class="cp" style="position:absolute;left:${X0}px;top:808px;font-weight:500">QUALITY</div>`);
  const QN = [['auto', 'AUTO'], ['high', 'HIGH'], ['balanced', 'BALANCED'], ['low', 'LOW']];
  let qx = X0;
  for (const [k, l] of QN) {
    const w = Math.round(l.length * 6.3 + 16);
    mkBtn('q_' + k, l, qx, 822, w);
    qx += w + 4;
  }
  mkBtn('panels', 'HIDE PANELS', X0, 852, 118);
  mkBtn('tour', 'PLAY TOUR', X0 + 122, 852, 118);

  // ------------------------------------------------------------ right column: charts, schematic, cameras
  const RX = 1306;
  const ch1 = pnl(`<div class="pn" style="left:${RX}px;top:30px;width:262px;height:182px"></div>`);
  add(`<div class="cp" style="position:absolute;left:11px;top:10px;font-weight:700">KEY TO STRIKE</div>`, ch1);
  const ch1Info = add(`<div class="cp mu" style="position:absolute;right:11px;top:10px;font-weight:500"></div>`, ch1);
  const ch1Leg = add(`<div class="cp" style="position:absolute;left:11px;top:25px;font-weight:500;font-size:8.6px"></div>`, ch1);
  const ch1Svg = add(`<svg style="position:absolute;left:4px;top:40px" width="254" height="138"></svg>`, ch1);
  const ch2 = pnl(`<div class="pn" style="left:${RX}px;top:220px;width:262px;height:182px"></div>`);
  add(`<div class="cp" style="position:absolute;left:11px;top:10px;font-weight:700">CARRIAGE &amp; ESCAPEMENT</div>`, ch2);
  const ch2Info = add(`<div class="cp mu" style="position:absolute;right:11px;top:10px;font-weight:500"></div>`, ch2);
  const ch2Leg = add(`<div class="cp" style="position:absolute;left:11px;top:25px;font-weight:500;font-size:8.6px"></div>`, ch2);
  const ch2Svg = add(`<svg style="position:absolute;left:4px;top:40px" width="254" height="138"></svg>`, ch2);
  const sc = pnl(`<div class="pn" style="left:${RX}px;top:410px;width:262px;height:236px"></div>`);
  add(`<div class="cp" style="position:absolute;left:11px;top:10px;font-weight:700">SCHEMATIC</div>`, sc);
  const scInfo = add(`<div class="cp mu" style="position:absolute;right:11px;top:10px;font-weight:500"></div>`, sc);
  const scSvg = add(`<svg style="position:absolute;left:4px;top:26px" width="254" height="206"></svg>`, sc);
  pnl(`<div class="pn" style="left:${RX}px;top:654px;width:262px;height:126px"></div>`);
  pnl(`<div class="cp mu" style="position:absolute;left:${RX + 11}px;top:663px;font-weight:600">CAMERA</div>`);
  {
    let x = RX + 11;
    let y = 678;
    for (const k of CAM_BUTTONS) {
      const w = Math.round(k.length * 6.2 + 14);
      if (x + w > RX + 252) {
        x = RX + 11;
        y += 24;
      }
      mkBtn('cam_' + k, k.toUpperCase(), x, y, w, '', `Camera ${k}`);
      x += w + 4;
    }
  }
  pnl(`<div class="pn" style="left:${RX}px;top:788px;width:262px;height:96px"></div>`);
  pnl(`<div class="cp mu" style="position:absolute;left:${RX + 11}px;top:797px;font-weight:600">VIEW</div>`);
  mkBtn('xray', 'X-RAY', RX + 11, 812, 78);
  mkBtn('cutaway', 'CUTAWAY', RX + 93, 812, 78);
  mkBtn('reassemble', 'REASSEMBLE', RX + 175, 812, 76);
  pnl(`<div class="cp mu" style="position:absolute;left:${RX + 11}px;top:842px;font-weight:600">MACHINE</div>`);
  mkBtn('ret', 'RETURN', RX + 11, 856, 58);
  mkBtn('spacing', 'SPACING', RX + 73, 856, 58);
  mkBtn('color', 'RIBBON', RX + 135, 856, 58);
  mkBtn('lockBtn', 'LOCK', RX + 197, 856, 54);

  // ------------------------------------------------------------ subsystem buttons along the bottom
  {
    const items = SUB_BUTTONS.map((k) => ['sub_' + k, SUBSYSTEMS[k].label]);
    const perRow = 8;
    const x0 = 318;
    const W = 960;
    items.forEach(([k, label], i) => {
      const r = Math.floor(i / perRow);
      const j = i % perRow;
      const w = (W - (perRow - 1) * 5) / perRow;
      mkBtn(k, label, x0 + j * (w + 5), 812 + r * 26, w, '', `Subsystem ${label.toLowerCase()}`);
    });
  }
  const hint = pnl(`<div class="cp" style="position:absolute;left:318px;width:960px;top:870px;text-align:center;font-weight:500;color:${C.faint}">TYPE ON YOUR KEYBOARD &nbsp;·&nbsp; CLICK THE KEYS &nbsp;·&nbsp; ENTER RETURNS &nbsp;·&nbsp; DRAG TO ORBIT &nbsp;·&nbsp; SCROLL TO ZOOM &nbsp;·&nbsp; ESC HIDES PANELS</div>`);
  void hint;
  const viewTitle = pnl(`<div style="position:absolute;left:0;right:0;top:58px;text-align:center;font-size:13px;font-weight:700;letter-spacing:3px"></div>`);
  const viewSub = pnl(`<div class="cp mu" style="position:absolute;left:0;right:0;top:77px;text-align:center;font-weight:500"></div>`);
  const chip = add(`<button class="chip" aria-label="Auto tour"></button>`);

  // ------------------------------------------------------------ callouts, pointer
  const callSvg = add(`<svg style="position:absolute;inset:0;overflow:visible;pointer-events:none" width="1600" height="900"></svg>`);
  const callG = add(`<div style="position:absolute;inset:0;pointer-events:none"></div>`);
  const ring = add(`<div class="ring"></div>`);
  const cur = add(`<div class="cur"><svg width="22" height="22" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);

  const centre = (n) => {
    const x = parseFloat(n.style.left);
    const y = parseFloat(n.style.top);
    return [x + parseFloat(n.style.width) / 2, y + (parseFloat(n.style.height) || 21) / 2];
  };
  const spot = (k) => (btn[k] ? centre(btn[k]) : sliders[k] ? [sliders[k].x + sliders[k].w / 2, sliders[k].y] : [800, 450]);

  // memoised DOM writes
  const memo = new Map();
  const setText = (node, txt) => {
    if (memo.get(node) !== txt) {
      memo.set(node, txt);
      node.textContent = txt;
    }
  };
  const setHTML = (node, h) => {
    if (memo.get(node) !== h) {
      memo.set(node, h);
      node.innerHTML = h;
    }
  };
  const setClass = (node, cls, on) => {
    const k = `${cls}`;
    if (node.classList.contains(k) !== !!on) node.classList.toggle(k, !!on);
  };

  const pointer = (c) => {
    if (!c || c.x < -50) {
      cur.style.display = 'none';
    } else {
      cur.style.display = 'block';
      cur.style.transform = `translate(${(c.x - 3).toFixed(1)}px, ${(c.y - 2).toFixed(1)}px) scale(${c.press ? 0.86 : 1})`;
    }
    const r = c?.ring || 0;
    ring.style.left = `${(c?.ringX ?? 0).toFixed(1)}px`;
    ring.style.top = `${(c?.ringY ?? 0).toFixed(1)}px`;
    ring.style.opacity = String((r * 0.85).toFixed(3));
    ring.style.transform = `scale(${(0.35 + 0.9 * (1 - r)).toFixed(3)})`;
  };

  const f1 = (v, d = 1) => (Math.abs(v) < 0.5 * 10 ** -d ? (0).toFixed(d) : v.toFixed(d));

  function update(F) {
    const s = F.s;
    const heavy = F.heavy !== false;
    // title column
    setText(colBig, String(s.col));
    setHTML(colSub, `OF ${CARRIAGE.cols - 1}<br><span style="color:${C.ink}">${f1(s.colPos, 2)}</span> POSITION`);
    // gauge: the writing line, margins, bell column, the carriage pointer
    {
      const W = 262;
      const X = (c) => 4 + (c / (CARRIAGE.cols - 1)) * (W - 8);
      let h = `<line x1="${X(0)}" x2="${X(CARRIAGE.cols - 1)}" y1="14" y2="14" stroke="${C.faint}" stroke-width="1"/>`;
      for (let c = 0; c < CARRIAGE.cols; c += 5) h += `<line x1="${X(c).toFixed(1)}" x2="${X(c).toFixed(1)}" y1="${c % 10 ? 11 : 8}" y2="14" stroke="${C.faint}" stroke-width=".8"/>`;
      const L = CARRIAGE.leftMargin;
      const R = s.release ? Math.min(CARRIAGE.cols - 1, CARRIAGE.rightMargin + CARRIAGE.releaseExtra) : CARRIAGE.rightMargin;
      h += `<rect x="${X(L)}" y="12.5" width="${X(R) - X(L)}" height="3" fill="${C.line}"/>`;
      h += `<rect x="${X(L)}" y="12.5" width="${Math.max(0, X(s.colPos) - X(L)).toFixed(1)}" height="3" fill="${C.acc}"/>`;
      h += `<path d="M${X(L)} 18 l-4 7 h8z" fill="${C.ink}"/><path d="M${X(R)} 18 l-4 7 h8z" fill="${C.ink}"/>`;
      const bc = s.bellCol;
      h += `<circle cx="${X(bc)}" cy="21.5" r="3" fill="${s.bellRing > 0 ? C.acc : '#fff'}" stroke="${C.acc}" stroke-width="1.2"/>`;
      h += `<line x1="${X(s.colPos).toFixed(1)}" x2="${X(s.colPos).toFixed(1)}" y1="2" y2="17" stroke="${C.acc}" stroke-width="2"/>`;
      h += `<text x="${X(L)}" y="36" font-size="7.4" letter-spacing="1" text-anchor="middle" fill="${C.mute}">L ${L}</text><text x="${X(bc)}" y="6" font-size="7.4" letter-spacing="1" text-anchor="middle" fill="${C.acc}">BELL ${bc}</text><text x="${X(R)}" y="36" font-size="7.4" letter-spacing="1" text-anchor="middle" fill="${C.mute}">${s.release ? 'REL' : 'R'} ${R}</text>`;
      setHTML(gauge, h);
    }
    // readouts — every value from this frame's state
    const act = s.action;
    const ch = F.charNow;
    setText(rdT, `τ ${f1(s.t, 2)} S`);
    const set = (k, v, hot = false) => {
      setText(rd[k].lastChild, v);
      setClass(rd[k], 'hot', hot);
    };
    set('char', ch ? `${ch.ch === ' ' ? 'SPACE' : `"${ch.ch}"`}${ch.upper ? ' · UPPER' : ''}` : '—', act === 'char');
    set('phase', s.phase, !!act);
    set('key', `${f1(s.keyDepth || s.backDepth || s.spaceDepth, 1)} MM`, s.keyDepth > 0.05 || s.spaceDepth > 0.05);
    set('bar', s.slot >= 0 ? `${f1(s.barDeg, 1)}° · SLOT ${s.slot + 1}` : `${f1(s.barDeg, 1)}° AT REST`, s.slot >= 0);
    set('speed', `${Math.round(Math.abs(s.barSpeed))} °/S`, Math.abs(s.barSpeed) > 1);
    set('ribbon', `${f1(s.ribbonLift, 1)} MM · ${s.color.toUpperCase()}`, s.ribbonLift > 0.1);
    set('ub', `${f1(s.ub * 2.6, 2)} MM`, s.ub > 0.02);
    set('esc', s.escPhase, s.escPhase !== 'HELD ON LOOSE DOG');
    set('car', `${f1(s.carriageTravel, 1)} MM · ${f1(s.colPos, 2)}`, act === 'ret' || act === 'backspace' || Math.abs(s.colPos - Math.round(s.colPos)) > 0.003);
    set('spring', `${f1(s.tension, 2)} N`);
    set('platen', `${f1(s.platenDeg % 360, 1)}° · ${f1(s.feed, 1)} MM FED`, act === 'ret' && s.pawl > 0 && s.pawl < 1);
    set('line', `${s.printLine + 1} · SPACING ${s.spacing}`);
    set('shift', `${s.lock ? 'LOCKED' : s.shift > 0.5 ? 'UPPER' : 'LOWER'} · ${f1(s.shiftMM, 1)} MM`, act === 'shiftDown' || act === 'shiftUp' || act === 'lock');
    set('margin', s.lineLocked ? 'LINE LOCKED' : `${Math.max(0, Math.ceil(s.marginDist - 1e-6))} TO LOCK${s.colPos >= s.bellCol - 0.01 ? ' · BELL' : ''}`, s.bellRing > 0 || s.lineLocked);
    set('feed', `${s.ribbonDir > 0 ? '← LEFT' : 'RIGHT →'} · ${Math.round(s.ribbonPos)} MM`, !!s.feeding);
    // the line on the paper
    {
      const line = F.paperLine;
      setText(lpInfo, `LINE ${s.printLine + 1} · COL ${s.col}`);
      setHTML(lpText, line);
    }
    // transport
    setText(btn.pause, F.paused ? 'PLAY' : 'PAUSE');
    for (const [k, sl] of Object.entries(sliders)) {
      const v = F.sliders[k];
      if (!v) continue;
      sl.knob.style.left = `${(v.k * sl.w).toFixed(1)}px`;
      sl.fill.style.width = `${(v.k * sl.w).toFixed(1)}px`;
      setText(sl.val, v.text);
      sl.el.setAttribute('aria-valuetext', v.text);
    }
    setClass(btn.slow, 'acc', F.slow);
    setText(btn.mute, F.muted ? 'SOUND OFF' : 'SOUND ON');
    setClass(btn.mute, 'on', !F.muted);
    for (const [k] of QN) setClass(btn['q_' + k], 'on', F.quality === k);
    setText(btn.panels, F.panels ? 'HIDE PANELS' : 'SHOW PANELS');
    setText(btn.tour, F.tour ? 'STOP TOUR' : 'PLAY TOUR');
    setClass(btn.tour, 'acc', F.tour);
    for (const k of CAM_BUTTONS) setClass(btn['cam_' + k], 'on', F.camId === k && !F.sub);
    for (const k of SUB_BUTTONS) setClass(btn['sub_' + k], 'acc', F.sub === k);
    setClass(btn.xray, 'on', F.xray);
    setClass(btn.cutaway, 'on', F.cutaway);
    setText(btn.spacing, `SPACING ${s.spacing}`);
    setText(btn.color, s.color === 'black' ? 'BLACK' : s.color === 'red' ? 'RED' : 'STENCIL');
    setClass(btn.lockBtn, 'on', s.lock);
    // view title
    setText(viewTitle, F.sub ? SUBSYSTEMS[F.sub].label : F.camId.toUpperCase());
    setText(viewSub, F.viewSub || '');
    // chip
    if (memo.get(chip) !== F.tour) {
      memo.set(chip, F.tour);
      chip.classList.toggle('on', F.tour);
      chip.innerHTML = F.tour ? '<i></i>AUTO TOUR · CLICK ANYWHERE TO TAKE OVER' : '▶ &nbsp;RESUME TOUR';
    }
    // charts & schematic (the heavy part; thinned on the low tier)
    if (heavy) {
      drawKeyChart(ch1Svg, ch1Info, ch1Leg, F);
      drawEscChart(ch2Svg, ch2Info, ch2Leg, F);
      drawSchematic(scSvg, scInfo, F);
    }
    // callouts
    let lh = '';
    let chh = '';
    for (const c of F.callouts || []) {
      if (!c.at || c.o < 0.02) continue;
      const [ax, ay] = c.at;
      const [lx, ly] = c.label;
      const right = c.align === 'right';
      const ex = right ? lx + 6 : lx - 6;
      const tw = Math.max(c.name.length * 6.6, c.sub.length * 5.6);
      const ux = right ? lx + 8 + tw : lx - 8 - tw;
      lh += `<polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${ex.toFixed(1)},${(ly + 15).toFixed(1)} ${ux.toFixed(1)},${(ly + 15).toFixed(1)}" fill="none" stroke="${c.hot ? C.acc : C.mute}" stroke-width=".8" opacity="${c.o.toFixed(2)}"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="2.2" fill="${c.hot ? C.acc : C.ink}" opacity="${c.o.toFixed(2)}"/>`;
      chh += `<div class="call" style="${right ? `left:${(lx + 8).toFixed(1)}px` : `right:${(1600 - lx + 8).toFixed(1)}px;text-align:right`};top:${(ly - 12).toFixed(1)}px;opacity:${c.o.toFixed(2)}"><b style="color:${c.hot ? C.acc : C.ink}">${c.name}</b><span>${c.sub}</span></div>`;
    }
    setHTML(callSvg, lh);
    setHTML(callG, chh);
    pointer(F.cursor);
    if (memo.get(ui) !== F.panels) {
      memo.set(ui, F.panels);
      ui.classList.toggle('hidden', !F.panels);
    }
  }
  return {root: ui, btn, sliders, chip, spot, update, pointer, LINE, PITCH};
}
