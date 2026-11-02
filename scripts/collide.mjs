// Interference audit of every subsystem pose on the real geometry, headless (no browser).
//   node scripts/collide.mjs linkage basket … explode   (ids from views.SUB_BUTTONS; none = all)
import {buildMachine, viewLook, obbs, newInterferences} from '../tests/model/obb.js';
import {createSession, typeText} from '../src/model.js';
import {accentOf} from '../src/views.js';
const m = buildMachine();
const S = createSession(); typeText(S, 'Now is the time for');
const s = S.stateAt(S.end + 1);
m.update(s, S, {});
const rest = obbs(m);
console.log('boxes', rest.length);
const subs = process.argv.slice(2).length ? process.argv.slice(2) : (await import('../src/views.js')).SUB_BUTTONS;
for (const id of subs) {
  m.update(s, S, viewLook(id));
  const hits = newInterferences(rest, obbs(m));
  console.log(`== ${id}: ${hits.length}`);
  const agg = {};
  for (const h of hits) { const k = h.a.replace(/#\d+/, '#*') + ' <> ' + h.b.replace(/#\d+/, '#*'); (agg[k] ||= {n: 0, max: 0}); agg[k].n++; agg[k].max = Math.max(agg[k].max, h.pen); }
  Object.entries(agg).sort((a, b) => b[1].max - a[1].max).slice(0, 14).forEach(([k, v]) => console.log(`   ${v.max.toFixed(1)} mm  x${v.n}  ${k}`));
}
