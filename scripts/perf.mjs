// Frame-rate per quality tier on the integrated GPU (Chromium --force_low_power_gpu) or the discrete one.
// node scripts/perf.mjs [--gpu low|high] [--size 1600x900] [--dpr 1]
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const gpu = opt('gpu', 'low');
const [w, h] = opt('size', '1600x900').split('x').map(Number);
const srv = await serve({dir: 'dist', base: '/Typewriter-Teardown/'});
const b = await chromium.launch({headless: true, args: [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--ignore-gpu-blocklist', gpu === 'low' ? '--force_low_power_gpu' : '--force_high_performance_gpu', '--disable-frame-rate-limit', '--disable-gpu-vsync']});
const p = await b.newPage({viewport: {width: w, height: h}, deviceScaleFactor: Number(opt('dpr', 1))});
await p.goto(srv.url);
await p.waitForFunction(() => window.LIVE && window.SIM_SHOWN, null, {timeout: 90000});
const name = await p.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const e = gl.getExtension('WEBGL_debug_renderer_info');
  return gl.getParameter(e.UNMASKED_RENDERER_WEBGL);
});
console.log('gpu:', name);
const out = {gpu: name, size: `${w}x${h}`, tiers: {}};
for (const [label, key] of [['HIGH', 'high'], ['BALANCED', 'balanced'], ['LOW', 'low'], ['AUTO', 'auto']]) {
  await p.getByRole('button', {name: label, exact: true}).click();
  await p.evaluate(() => LIVE.startTour());
  await p.waitForTimeout(1500);
  const samples = [];
  for (let i = 0; i < 6; i++) {
    await p.waitForTimeout(600);
    samples.push(await p.evaluate(() => LIVE.fps));
  }
  const fps = samples.reduce((a, c) => a + c, 0) / samples.length;
  out.tiers[key] = {fps: +fps.toFixed(1), tier: await p.evaluate(() => LIVE.tier)};
  console.log(`${label.padEnd(9)} ${fps.toFixed(1)} fps (tier ${out.tiers[key].tier})`);
}
console.log(JSON.stringify(out));
await b.close();
await srv.close();
