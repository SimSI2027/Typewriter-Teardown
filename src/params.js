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
  railTopY: 37, // E  top of the front rail (the space bar rides above it)
  hoodZ: 132, // E  decal panel ("UNDERWOOD") in front of the basket
  deckOpenR: 142, // E  plan radius of the deck opening the typebars rise through (checked: bars cross the deck plane at ≤ 135 mm)
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
  frameLen: 300, // E  carriage frame length (end plate to end plate)
  railY: 204, // E  carriage rail level
  railZ: [-130, -60], // E  rear and front carriage rails
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
  axisZ: -112, // E  shaft; the star wheel sits behind, the pinion in front
  wheelZ: -120, // E
  pinionZ: -104, // E  pinion meshes with the carriage rack (same z)
  rackY: 0, // derived: rack pitch line = axisY + pinionR (computed in model)
  looseFrac: 0.22, // E  fraction of a tooth the wheel turns when the loose dog lets go (it then rests on the rigid dog)
  rockerTravel: 7, // E  rocker tilt, degrees, at full universal-bar travel
  tripAt: 0.94, // E  universal-bar travel (0..1) at which the loose dog clears the tooth
  resetAt: 0.45, // E  universal-bar travel on the way back at which the rigid dog lets go
};
export const MAINSPRING = {
  drumR: 22, // E
  drumX: -150, // E  drum (vertical axis) behind the rear left of the frame; the drawband runs to the carriage's right end
  drumY: 188,
  drumZ: -170,
  drumH: 16,
  bandY: 196, // E  drawband height
  tension0: 9.0, // E  N with the carriage at column 0 (spring most wound: the start of a line)
  rate: 0.012, // E  N lost per mm the carriage travels to the left (simplified linear spring)
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
  leverY: 44, // E  key lever top at rest (raised from 34: a depressed lever touched the base plate — found by tests/model/mechanics)
  leverW: 2.2, // E  lever thickness (they are flat bars on edge)
  leverH: 7,
  fulcrumZ: -66, // E  key lever fulcrum rod (rear)
  fulcrumY: 40,
  combZ: 118, // E  key lever comb (guides the levers near the front)
  sublever: {pivotZ: 40, pivotY: 52, arm: 22}, // E  sublever comb position and arm length
  linkPull: 6.8, // E  heel pull at full key travel (equal for every key: sublever ratios compensate the rows)
  spacebar: {z: 229, y: 50, w: 236, travel: 8}, // E
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
  z: 0.6, // E  ribbon plane in front of the paper (the slug presses it onto the paper at impact)
  spoolX: 165, // E  spool centres (vertical axes) left/right — outside the swing of the outer typebars (checked)
  spoolZ: 40,
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
// ------------------------------------------------------------ typebar drive and space bar (E; see docs/ASSUMPTIONS.md)
export const DRIVE = {
  barDeg: 88, // E  the sublever drives the bar to just short of vertical; it flies the rest to the platen
  ubFromDeg: 120, // E  the heel meets the universal bar over the last stretch of the swing (from this angle to the strike)
};
export const SPACE_PH = {down: [0, 0.34], up: [0.42, 0.85]}; // S  space bar stroke phases (fractions of its duration)
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

// ------------------------------------------------------------ explosion paths (mm), per assembly. A vector is a straight
// move over the whole teardown; {at: [[k, [x, y, z]], …]} is a staged path in teardown progress k (0..1) from home:
// parts wait for the ones in front of them, and leave a mount before they slide. Reassembly retraces it backwards.
export const EXPLODE = {
  // the platen rides in the carriage and the paper on the platen: their offsets add to the carriage's
  carriage: [0, 110, -40],
  platen: [0, 70, -10], // relative to the carriage
  paper: [0, 40, 10], // relative to the platen
  rack: [0, 0, 0], // stays screwed under the carriage and leaves with it
  rails: {at: [[0.4, [0, 40, 0]], [1, [0, 52, -40]]]}, // up off their brackets, clear of the bell trip, then back
  return: {at: [[0.4, [-90, 0, 0]], [1, [-90, 150, -30]]]}, // out to the left off the platen end, then up
  bell: [-130, 20, -20],
  mainspring: [-120, -10, -90],
  escapement: [0, -4, 0], // captive (rear cross member behind, universal-bar trip above): drops off its mount only
  ubar: [0, 0, 0], // stays: it is threaded through the fan of links and held under the segment flange (no free path)
  ribbon: [0, 85, 30],
  vibrator: [0, 50, 55],
  typebars: {at: [[0.45, [0, 40, 0]], [1, [0, 40, 70]]]}, // up through the deck opening, then forward (fanned)
  segment: [0, 0, 40], // slides forward under the deck (its bars lift off above it)
  linkage: [0, 0, 0], // stays on its sublevers: the links interlock with the universal bar (no free path)
  levers: [0, 0, 0], // stay on the fulcrum under their sublevers (the key-lever skeleton stays with the frame)
  keys: {at: [[0.4, [0, 0, 0]], [1, [0, 60, 70]]]}, // after the hood has passed over them
  spacebar: [0, 0, 0], // stays: its rear rod runs under every key lever (part of the key-lever skeleton)
  shift: [0, 0, 0], // stays on the frame: its lift rods run from the base to the deck at the sides, so no straight
  //                   path out exists (base, front rail and deck strip all cross it) — the side panels move away to show it
  backspace: [50, 5, 60], // forward and right, kept under the deck strip and clear of the space bar
  hood: {at: [[0.45, [0, 30, 200]]]}, // first: forward over the resting keys
  frame: [0, 0, 0],
  frameSides: [150, 0, 0], // side panels slide out sideways (mirrored)
};

// ------------------------------------------------------------ cameras: target (mm), azimuth from +z toward +x,
// elevation, distance (mm), screen shift (px of the 1600×900 stage)
export const CAMS = {
  hero: {t: [0, 150, 40], az: 36, el: 24, d: 1520, sx: 0, sy: -34},
  operator: {t: [0, 150, 70], az: 0, el: 30, d: 1450, sx: 0, sy: -30},
  keyboard: {t: [0, 105, 150], az: 16, el: 44, d: 1000, sx: 0, sy: -20},
  side: {t: [0, 160, 40], az: 90, el: 8, d: 1500, sx: 0, sy: -30},
  top: {t: [0, 150, 40], az: 0, el: 82, d: 1500, sx: 0, sy: -20},
  typebars: {t: [0, 200, 50], az: 24, el: 34, d: 780, sx: 0, sy: -20},
  impact: {t: [0, 224, 12], az: 22, el: 28, d: 410, sx: 0, sy: -20},
  escapement: {t: [0, 172, -114], az: 168, el: 16, d: 520, sx: 0, sy: -20},
  ribbon: {t: [0, 220, 30], az: 18, el: 30, d: 640, sx: 0, sy: -20},
  carriage: {t: [0, 225, -50], az: 150, el: 28, d: 1250, sx: 0, sy: -30},
  rear: {t: [0, 170, -40], az: 180, el: 20, d: 1450, sx: 0, sy: -30},
  platen: {t: [-30, 250, -30], az: -32, el: 24, d: 950, sx: 0, sy: -20},
  inside: {t: [0, 130, 50], az: 64, el: 14, d: 640, sx: 0, sy: -20},
};
// cameras that only subsystem views use (same form)
export const SUBCAMS = {
  linkage: {t: [10, 115, 70], az: 64, el: 16, d: 920, sx: 0, sy: -20},
  ubar: {t: [0, 172, -10], az: 120, el: 30, d: 680, sx: 0, sy: -20},
  feed: {t: [0, 210, 40], az: 10, el: 56, d: 920, sx: 0, sy: -20},
  shift: {t: [10, 165, -20], az: 82, el: 12, d: 1120, sx: 0, sy: -20},
  backspace: {t: [50, 172, -80], az: 142, el: 24, d: 760, sx: 0, sy: -20},
  bell: {t: [-150, 140, -50], az: -80, el: 10, d: 720, sx: 0, sy: -20},
  ret: {t: [-110, 245, -10], az: -34, el: 24, d: 950, sx: 0, sy: -20},
  spacing: {t: [-150, 245, -20], az: -64, el: 18, d: 640, sx: 0, sy: -20},
  mainspring: {t: [-90, 190, -130], az: -150, el: 28, d: 900, sx: 0, sy: -20},
  explode: {t: [0, 240, 30], az: 36, el: 22, d: 2250, sx: 0, sy: -30},
  ribbonLift: {t: [0, 222, 12], az: 14, el: 20, d: 470, sx: 0, sy: -20},
};
// typebar fan (alternate bars raised 8° / 26° at 1) and key-row lift for the views that spread them
export const VIEW_SPREAD = {linkage: {rows: 0.6}, basket: {fan: 0.6}, explode: {fan: 1, rows: 1}};
export const VIEW_T = 1.25; // S  seconds for a view change (camera, explode, ghosting)

// ------------------------------------------------------------ how far each subsystem view explodes its assemblies:
// a number scales that assembly's EXPLODE vector, an array is a vector (mm) of its own. FULL EXPLODE uses 1 for all.
export const VIEW_EXPLODE = {
  linkage: {frameSides: 1, keys: 0.25}, // keys lift off their levers; levers stay on the fulcrum
  basket: {hood: 1}, // the bars fan on their own segment (VIEW_SPREAD); nothing else needs to move
  ribbonLift: {}, // isolated in place (hood cut): the vibrator works between the platen and the carriage's front tie
  //               rod with under a millimetre either side, and the spools sit under that rod
  ribbonFeed: {ribbon: [0, 30, 60], vibrator: [0, 30, 60]}, // spools and vibrator together (the ribbon stays threaded), forward past the return lever
  ubar: {}, // isolated in place (hood and sides cut): the bar sits between the segment flange and the links, so any
  //          move would pass through one of them
  escapement: {escapement: [0, -4, 0]}, // the foot drops off the rear cross member's underside and the pinion leaves the
  //                rack; the train is captive (cross member behind, universal-bar trip above the shaft), so it goes no further
  carriage: {vibrator: {at: [[0.3, [0, -25, 0]]]}, carriage: {at: [[0.3, [0, 0, 0]], [1, [0, 54, -18]]]}}, // the vibrator
  //                steps down out of the way, then the carriage lifts off its rails
  mainspring: {mainspring: 0.3},
  backspace: {backspace: [22, 0, 0]},
  bell: {bell: [-14, 0, -6]}, // the margin rack travels with it: it may not reach the carriage end plate
  ret: {},
  spacing: {return: 0.18},
  platen: {platen: 0.6, paper: 0.5, return: [0, 60, 0]}, // the return lever steps up out of the platen's way
};

// ------------------------------------------------------------ the visitor experience (S: interaction timings, seconds of
// wall-clock time while the page is visible; see src/experience.js)
export const EXPERIENCE = {
  idleHint: 8, // S  quiet in manual mode before the status starts counting down to the automatic resume
  idleResume: 25, // S  quiet in manual mode before the tour resumes from where it was interrupted
  completeHold: 8, // S  the finished tour holds its last frame at least this long before it loops from the start
  resumeBlend: 1.1, // S  camera and look blend from the visitor's view into the tour's on resume / restart
  dragStart: 4, // S  px of pointer travel before a press on the machine becomes an orbit drag (a takeover)
};
