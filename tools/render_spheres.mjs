// Renders the film's sphere zoom-out without words or marks, then holds it zoomed out and turning.
// The film's own files are served unchanged except film.js, patched in memory.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
const root = process.argv[2], outDir = process.argv[3], mode = process.argv[4] || 'stills';
const { chromium } = createRequire(join(root, 'tools/'))('playwright-core');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.bin': 'application/octet-stream', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png' };
const patch = (s) => {
  const reps = [
    ["if (SWEEP === 'sphere' && t <= SETTLE0) return { ra: spin(t) + RA_HOLD, dec };", "if (SWEEP === 'sphere' && t <= SETTLE0) return { ra: spin(t) + RA_HOLD + (window.__ra || 0), dec };"],
    ["function drawSweepMarks(c, t, v) {", "function drawSweepMarks(c, t, v) { return;"],
    ["window.film = { duration: RUN,", "window.__warp = WARP; window.film = { duration: RUN,"],
  ];
  for (const [a, b] of reps) { if (!s.includes(a)) throw new Error('patch target missing: ' + a); s = s.replace(a, b); }
  return s;
};
const server = createServer(async (req, res) => {
  try { const u = decodeURIComponent(req.url.split('?')[0]); let body = await readFile(join(root, u)); if (u === '/film.js') body = patch(body.toString());
    res.writeHead(200, { 'content-type': TYPES[extname(u)] || 'application/octet-stream' }); res.end(body); }
  catch (e) { res.writeHead(404); res.end(); }
}).listen(0);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => { console.error('page error:', e.message); process.exit(1); });
await page.goto(`http://localhost:${server.address().port}/film.html?render&layer=picture`);
await page.waitForFunction(() => (window.film && window.film.ready) || window.filmError, null, { timeout: 0 });
const T0 = 22.0, T1 = 33.6;                       // film time: just before the zoom out, to just after it
const [r0, r1] = await page.evaluate(([a, b]) => [window.__warp.raw(a), window.__warp.raw(b)], [T0, T1]);
console.error('raw', r0, r1);
const shot = async (raw, ra) => Buffer.from(await page.evaluate(([raw, ra]) => { window.__ra = ra; window.film.seek(raw); return document.getElementById('film').toDataURL('image/jpeg', 0.95).split(',')[1]; }, [raw, ra]), 'base64');
await mkdir(outDir, { recursive: true });
if (mode === 'stills') {
  const list = [[r0, 0], [r0 + (r1 - r0) * 0.3, 0], [r0 + (r1 - r0) * 0.6, 0], [r1, 0], [r1, 120], [r1, 240]];
  for (let i = 0; i < list.length; i++) await writeFile(join(outDir, `s${i}.jpg`), await shot(...list[i]));
} else {
  // the turn at the end of the zoom out, measured, carried on at the same rate for one whole turn so the hold loops
  const fps = 30, dt = 1 / fps;
  // the turn carries on at the rate the zoom out ends with (9.2 deg/s on a clock running at 1/1.7), quickens over 4 s to
  // 10 deg/s, then makes one whole turn at that rate: the last 36 s loop without a seam
  const v0 = 9.2 / 1.7, v1 = 10, tr = 4, nA = Math.round((r1 - r0) * fps), nR = tr * fps, nB = 360 / v1 * fps;
  const ramp = (t) => { const u = t / tr, e = u * u * (3 - 2 * u), E = tr * (u ** 3 - u ** 4 / 2); return v0 * t + (v1 - v0) * E; };  // integral of the eased rate
  const a0 = ramp(tr);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', join(outDir, 'spheres_master_hi.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  const N = nA + nR + nB;
  for (let i = 0; i < N; i++) {
    const buf = i < nA ? await shot(r0 + i * dt, 0) : i < nA + nR ? await shot(r1, ramp((i - nA) * dt)) : await shot(r1, a0 + (i - nA - nR) * 360 / nB);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.error(`frame ${i}/${N}`);
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r));
  console.log(JSON.stringify({ loopStart: (nA + nR) / fps, total: N / fps }));
}
await browser.close(); server.close();
