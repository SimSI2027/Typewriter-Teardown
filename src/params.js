// The parameter block. Every dimension, clearance, pivot, ratio, timing, explosion vector and camera target of the
// simulator lives here. Units: millimetres, degrees, seconds of machine time.
//
// Coordinates: x to the operator's right, y up from the desk, z toward the operator. The printing point (the front
// face of the platen at its equator, lower-case, unshifted) is the origin in x and z.
//
// Every value is tagged:  V = VERIFIED (reliable source, see docs/SOURCES.md)
//                         E = ESTIMATED (consistent inference from photographs and proportions)
//                         S = SIMPLIFIED (deliberately adjusted for clarity, performance or feasibility)

export const SRC = {
  pitch: 'V  TM 10-601 §28a: pica type has 10 letters per inch of writing line',
  lineSpace: 'V  TM 10-601 §V: line space mechanism spaces 1, 2 or 3 lines in one operation',
  shift: 'V  TM 10-601 §3: the Underwood standard is a carriage shift machine (subcarriage rises, §54-55)',
  bell: 'V  TM 10-601 §XIII d(8): bell rings 7 spaces before the line lock',
  escapement: 'V  TM 10-601 §24: key lever → sublever → type bar; heel pushes universal bar; rocker; loose dog releases, rigid dog catches, rigid dog releases on return',
  ribbon: 'V  TM 10-601 §43: black raises upper half, red raises lower half, stencil no lift',
  typebars: 'V  Museums Victoria 388645: 42 typebars, curved typebasket, front strike, 4-row 42-key keyboard',
  platenWidth: 'V  Science Museum Group co38184: cylindrical platen ~252 mm (10 in)',
};

// ------------------------------------------------------------ overall body (E: proportions from side/front photos)
export const BODY = {
  width: 392, // E  outer width of the cast frame at the side panels
  sideX: 186, // E  inner face of each side panel
  sideT: 11, // E  side panel thickness
  rearZ: -150, // E  rear face of the frame
  frontZ: 96, // E  front face of the main box (hood / decal panel)
  deckY: 200, // E  top of the side frames (carriage rail level)
  footH: 16, // E  rubber foot height
  baseY: 16, // E  underside of the cast base
  railFrontZ: 236, // E  front of the keyboard rail ("No 5  UNDERWOOD STANDARD TYPEWRITER")
};

// ------------------------------------------------------------ printing point, platen, paper
export const PRINT = {y: 230}; // E  printing line height (platen equator, unshifted)
export const PLATEN = {
  teeth: 28, // E  line-space ratchet teeth; one tooth = one single line
  linesPerInch: 6, // V  standard typewriter line pitch (1/6 in) — period convention
  length: 252, // V  ~10 in platen
  // r follows from teeth and line pitch: circumference = teeth × 25.4/6
  get r() {
    return (this.teeth * 25.4) / this.linesPerInch / (2 * Math.PI);
  }, // E  ≈ 18.9 mm (Ø 37.7 mm)
  get z() {
    return -this.r;
  }, // axis sits one radius behind the printing point
  knobR: 19, // E
  knobLen: 26, // E
};
export const LINE = {
  get pitch() {
    return 25.4 / PLATEN.linesPerInch;
  }, // 4.233 mm
  spacings: [1, 2, 3], // V
  maxLines: 54, // E  usable lines on the represented sheet before the paper runs out
};
export const PAPER = {
  width: 216, // E  US letter
  length: 279, // E
  leftEdgeCol: -6, // E  paper left edge sits 6 columns left of column 0
  topMargin: 18, // E  first line printed 18 mm below the top edge
  insertFeed: 0, // where the sheet stands at session start (the top edge at the printing line + topMargin)
};

// ------------------------------------------------------------ escapement, carriage
export const PITCH = 25.4 / 10; // V  2.54 mm per character (pica)
export const CARRIAGE = {
  cols: 85, // E  writing line of 85 pica spaces on the 10 in carriage
  centreCol: 42, // the carriage is centred over the frame at column 42
  leftMargin: 10, // E  default margin stops
  rightMargin: 72, // E  line lock column (right margin stop)
  bellBefore: 7, // V  bell 7 spaces before the line lock
  lineLockGrace: 0, // S  keys lock exactly at the right margin until MARGIN RELEASE
  releaseExtra: 8, // E  spaces available past the margin with MARGIN RELEASE
  frameLen: 404, // E  carriage frame length (end plate to end plate)
  railY: 204, // E  carriage rail level
  railZ: [-112, -64], // E  front and rear carriage rails
  shiftTravel: 5.0, // E  subcarriage lift for upper case (separation of the two characters on a slug)
  // carriage x offset for a column position: the paper's column c sits over the printing point
  x: (col) => -(col - 42) * PITCH,
};
export const ESC = {
  wheelTeeth: 36, // E  escapement (star) wheel teeth; one tooth = one space
  pinionTeeth: 12, // E
  get pinionR() {
    return (this.wheelTeeth * PITCH) / (2 * Math.PI);
  }, // pitch radius that makes 1 wheel tooth = 1 pica space
  wheelR: 17, // E
  axisY: 176, // E  escapement shaft height (axis along z)
  axisZ: -118, // E
  rackY: 0, // derived: rack pitch line = axisY + pinionR (computed in model)
  looseFrac: 0.22, // E  fraction of a tooth the wheel turns when the loose dog lets go (it then rests on the rigid dog)
  rockerTravel: 7, // E  rocker tilt, degrees, at full universal-bar travel
  tripAt: 0.94, // E  universal-bar travel (0..1) at which the loose dog clears the tooth
  resetAt: 0.45, // E  universal-bar travel on the way back at which the rigid dog lets go
};
export const MAINSPRING = {
  drumR: 22, // E
  drumX: -156, // E  drum at the rear left of the frame
  drumY: 120,
  drumZ: -136,
  tension0: 6.0, // E  N at the right end of travel (carriage fully returned)
  rate: 0.022, // E  N per mm of carriage travel to the left (simplified linear spring)
};

// ------------------------------------------------------------ keyboard, key levers, linkage (E from photographs)
export const KEYS = {
  rows: 4,
  pitchX: 19.4, // E  key spacing across a row
  rowZ: [214, 192, 170, 148], // E  front (Z row) to back (number row)
  rowY: [66, 82, 98, 114], // E  key-top heights — the stepped bank
  rowX0: [-91, -99, -106, -103], // E  x of the first key in each row (stagger)
  capR: 7.0, // E  glass top radius (Ø 14 mm)
  rimR: 7.8, // E  nickel rim outer radius
  capH: 3.4, // E
  stemR: 1.3, // E
  travel: 14, // E  key dip (~9/16 in)
  leverY: 34, // E  key lever top at rest
  leverW: 2.2, // E  lever thickness (they are flat bars on edge)
  leverH: 7,
  fulcrumZ: -66, // E  key lever fulcrum rod (rear)
  fulcrumY: 30,
  combZ: 118, // E  key lever comb (guides the levers near the front)
  sublever: {pivotZ: 40, pivotY: 52, arm: 22}, // E  sublever comb position and arm length
  linkPull: 6.8, // E  heel pull at full key travel (equal for every key: sublever ratios compensate the rows)
  spacebar: {z: 236, y: 52, w: 236, travel: 9}, // E
  shiftKey: {w: 26}, // E
};

// ------------------------------------------------------------ typebar basket (E, geometry checked in tests)
export const BASKET = {
  count: 42, // V
  segR: 60, // E  plan radius of the pivot arc about the printing point
  segDrop: 45, // E  pivots sit this far below the printing line
  span: 84, // E  ± degrees of the slot arc from the front centre
  // bar length from pivot to type face: equidistant from the printing point (that is why the segment is an arc)
  get L() {
    return Math.hypot(this.segR, this.segDrop);
  }, // 75 mm
  restDeg: -12, // E  rest elevation (outward, slug end slightly low: the basket's bowl)
  get strikeDeg() {
    return 180 - (Math.atan2(this.segDrop, this.segR) * 180) / Math.PI;
  }, // 143.13°: pointing inward and up at the printing point
  heelArm: 7.5, // E  tail behind the pivot that the sublever link pulls
  barT: 1.5, // E  bar thickness (in the swing plane's normal)
  barH: 4.2, // E
  slugLen: 9, // E  slug face height (two characters, stacked)
  slugW: 3.6, // E
  slugT: 3.0, // E
  charSep: 5.0, // = CARRIAGE.shiftTravel: upper-case character sits 5 mm above the lower-case one at impact
  throwFrac: 0.78, // E  fraction of the swing driven by the linkage; the rest is free flight to the platen
  restPadY: -3, // E  typebar rest pad below the bars' rest line
};

// ------------------------------------------------------------ ribbon (E; colour logic V)
export const RIBBON = {
  width: 12.7, // E  1/2 in ribbon, two halves (black over red)
  restTop: -6.0, // E  ribbon top edge relative to the printing line at rest (writing stays visible)
  // lift so the chosen half's centre covers the printing line: black → upper half, red → lower half, stencil none
  lift: {black: 6.0 + 3.2, red: 6.0 + 9.5, stencil: 0}, // E
  z: 1.4, // E  ribbon plane in front of the paper
  spoolX: 148, // E  spool centres (vertical axes) left/right
  spoolZ: 22,
  spoolY: 201,
  spoolCoreR: 9,
  spoolFullR: 27,
  length: 9000, // E  ribbon length between full spools (mm), sets when the automatic reverse trips
  feedPerStroke: 0.9, // E  ribbon advance per keystroke (mm) through the feed ratchet
  ratchetTeeth: 48, // E
  guideX: 52, // E  ribbon guide posts either side of the vibrator
};

// ------------------------------------------------------------ bell & margin (V for 7 spaces)
export const BELL = {
  x: -160, // E  bell on the inside of the left side frame (chrome dome visible through the side window)
  y: 112,
  z: -40,
  r: 26,
  ringDur: 0.9, // E  visible hammer rebound / ring decay window (s)
};

// ------------------------------------------------------------ action timings (S: study speed — 1× is a deliberate
// typist; the PLAYBACK slider scales machine time. Phase boundaries are fractions of each action's duration.)
export const T = {
  char: 0.34,
  space: 0.24,
  backspace: 0.32,
  shiftDown: 0.22,
  shiftUp: 0.22,
  ret: 1.15,
  spacing: 0.25,
  color: 0.25,
  release: 0.28,
  lock: 0.28, // a locked key: dips a little and comes back
};
export const PH = {
  // character stroke
  keyDown: [0.0, 0.3],
  keyHold: [0.3, 0.44],
  keyUp: [0.44, 0.8],
  impact: 0.36, // E  slug meets ribbon, paper and platen (glyph appears at this instant)
  dwell: 0.025, // contact
  barBack: [0.385, 0.86], // typebar falls back to the rest
  ribbonUp: [0.1, 0.3], // ribbon reaches print height before impact
  ribbonDown: [0.46, 0.72],
  feed: [0.56, 0.74], // ribbon feed pawl advances the ratchet on the return stroke
  // carriage return
  retLever: [0.0, 0.2], // lever throw: line space pawl turns the ratchet
  retTravel: [0.18, 0.84], // carriage slides to the left margin
  retLeverBack: [0.84, 1.0],
};

// ------------------------------------------------------------ explosion vectors (mm), per assembly
export const EXPLODE = {
  carriage: [0, 120, -40],
  platen: [0, 165, -10],
  paper: [0, 205, 10],
  rack: [0, 70, -70],
  rails: [0, 52, -40],
  return: [-90, 150, -30],
  bell: [-130, 20, -20],
  mainspring: [-120, -10, -90],
  escapement: [0, -10, -130],
  ubar: [0, -30, -60],
  ribbon: [0, 85, 30],
  vibrator: [0, 50, 55],
  typebars: [0, 40, 70], // fanned further in subsystem view
  segment: [0, 18, 40],
  linkage: [0, -45, 30],
  levers: [0, -75, 20],
  keys: [0, 60, 70],
  spacebar: [0, -20, 90],
  shift: [0, -40, 60],
  backspace: [60, 40, 40],
  hood: [0, 30, 140],
  frame: [0, 0, 0],
  frameSides: [150, 0, 0], // side panels slide out sideways (mirrored)
};

// ------------------------------------------------------------ cameras: target (mm), azimuth from +z toward +x,
// elevation, distance (mm), screen shift (px of the 1600×900 stage)
export const CAMS = {
  hero: {t: [0, 150, 30], az: 38, el: 24, d: 1380, sx: 40, sy: 0},
  operator: {t: [0, 150, 60], az: 0, el: 30, d: 1250, sx: 40, sy: 0},
  keyboard: {t: [0, 100, 160], az: 14, el: 46, d: 720, sx: 40, sy: 0},
  side: {t: [0, 140, 30], az: 90, el: 10, d: 1300, sx: 40, sy: 0},
  top: {t: [0, 150, 20], az: 0, el: 80, d: 1300, sx: 40, sy: 0},
  typebars: {t: [0, 200, 60], az: 28, el: 34, d: 640, sx: 40, sy: 0},
  impact: {t: [0, 228, 10], az: 40, el: 18, d: 330, sx: 40, sy: 0},
  escapement: {t: [0, 180, -110], az: 150, el: 22, d: 520, sx: 40, sy: 0},
  ribbon: {t: [0, 215, 20], az: 20, el: 40, d: 620, sx: 40, sy: 0},
  carriage: {t: [0, 225, -60], az: 150, el: 30, d: 1050, sx: 40, sy: 0},
  rear: {t: [0, 160, -40], az: 180, el: 22, d: 1250, sx: 40, sy: 0},
  platen: {t: [-120, 235, -20], az: -50, el: 22, d: 640, sx: 40, sy: 0},
  inside: {t: [0, 120, 40], az: 62, el: 14, d: 560, sx: 40, sy: 0},
};
