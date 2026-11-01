// The keyboard of the represented machine: a four-bank, 42-key, 84-character US pica layout of the 1920s Underwood
// No. 5 (no "1" or "!" — the period convention is a lower-case l and an apostrophe over a period). The character set
// is ESTIMATED as representative; the 42-key / 84-character count is VERIFIED (Museums Victoria, Xavier POLT).
// Each character key carries two characters on one slug: lower case and, 5 mm above it at impact, upper case.
import {BASKET, KEYS} from './params.js';

// rows front (0) to back (3); [lower, upper]
const ROWS = [
  [['z', 'Z'], ['x', 'X'], ['c', 'C'], ['v', 'V'], ['b', 'B'], ['n', 'N'], ['m', 'M'], [',', ','], ['.', '.'], ['/', '?']],
  [['a', 'A'], ['s', 'S'], ['d', 'D'], ['f', 'F'], ['g', 'G'], ['h', 'H'], ['j', 'J'], ['k', 'K'], ['l', 'L'], [';', ':']],
  [['q', 'Q'], ['w', 'W'], ['e', 'E'], ['r', 'R'], ['t', 'T'], ['y', 'Y'], ['u', 'U'], ['i', 'I'], ['o', 'O'], ['p', 'P'], ['¢', '@']],
  [['2', '"'], ['3', '#'], ['4', '$'], ['5', '%'], ['6', '_'], ['7', '&'], ['8', "'"], ['9', '('], ['0', ')'], ['-', '*'], ['½', '¼']],
];

export const CHAR_KEYS = [];
ROWS.forEach((row, r) => {
  row.forEach(([lo, up], i) => {
    CHAR_KEYS.push({
      id: CHAR_KEYS.length,
      kind: 'char',
      row: r,
      lo,
      up,
      x: KEYS.rowX0[r] + i * KEYS.pitchX,
      z: KEYS.rowZ[r],
      y: KEYS.rowY[r],
    });
  });
});

// Typebar slots: keys taken left to right across the keyboard (ties: front row first) fill the segment from the left.
// This keeps the sublever links a fan without crossings — the real machine's slot order is a similar interleave.
{
  const order = [...CHAR_KEYS].sort((a, b) => a.x - b.x || a.row - b.row);
  order.forEach((k, i) => (k.slot = i));
}
export const SLOT_KEY = [];
CHAR_KEYS.forEach((k) => (SLOT_KEY[k.slot] = k.id));

/** plan angle (degrees from the front centre toward +x) of typebar slot i */
export const slotDeg = (i) => -BASKET.span + (i * 2 * BASKET.span) / (BASKET.count - 1);

// function keys: position, label on the cap, the action they start
export const FN_KEYS = [
  {id: 'shiftL', kind: 'fn', label: 'SHIFT', row: 0, x: KEYS.rowX0[0] - 27, z: KEYS.rowZ[0], y: KEYS.rowY[0], action: 'shift', w: KEYS.shiftKey.w},
  {id: 'shiftR', kind: 'fn', label: 'SHIFT', row: 0, x: KEYS.rowX0[0] + 9 * KEYS.pitchX + 27, z: KEYS.rowZ[0], y: KEYS.rowY[0], action: 'shift', w: KEYS.shiftKey.w},
  {id: 'lock', kind: 'fn', label: 'LOCK', row: 1, x: KEYS.rowX0[1] - 24, z: KEYS.rowZ[1], y: KEYS.rowY[1], action: 'lock'},
  {id: 'back', kind: 'fn', label: 'BACK', row: 3, x: KEYS.rowX0[3] + 10 * KEYS.pitchX + 24, z: KEYS.rowZ[3], y: KEYS.rowY[3], action: 'backspace'},
  {id: 'mrel', kind: 'fn', label: 'M R', row: 3, x: KEYS.rowX0[3] - 24, z: KEYS.rowZ[3], y: KEYS.rowY[3], action: 'release'},
];
export const FN = Object.fromEntries(FN_KEYS.map((k) => [k.id, k]));

/** a printable character → {key, upper}, or null if this keyboard cannot type it */
const CHAR_MAP = new Map();
for (const k of CHAR_KEYS) {
  if (!CHAR_MAP.has(k.lo)) CHAR_MAP.set(k.lo, {key: k.id, upper: false});
  if (!CHAR_MAP.has(k.up)) CHAR_MAP.set(k.up, {key: k.id, upper: true});
}
// period conventions: "1" is a lower-case l; "!" would need an overstrike, so it is refused
CHAR_MAP.set('1', {key: CHAR_MAP.get('l').key, upper: false});
export const charToKey = (ch) => CHAR_MAP.get(ch) || null;
export const glyphOf = (keyId, upper) => {
  const k = CHAR_KEYS[keyId];
  return k ? (upper ? k.up : k.lo) : '';
};
