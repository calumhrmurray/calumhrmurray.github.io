// The hero's four shells of galaxies, subsampled for a live render (assets/spherex/shells.bin, read by shells.js).
// Reproduces what the sphere film draws once it has drawn back (2611_catalogue_film: film.js drawSweepGL with
// SWEEP 'sphere', cloud.js): every third galaxy of the catalogue at its own distance, plus the galaxies nearer than
// the shells and the night sky's first shell; for each shell, a galaxy counts with the weight of the film's soft band
// round the shell's radius and is drawn on the shell. Here each shell keeps a random subset chosen with probability
// in proportion to that weight, so every kept galaxy weighs the same; shells.js gives each the opacity that makes the
// shell as dark overall as the film's.
//
//   node tools/prep_shells.mjs <film folder> [out file]
//
// Output, little-endian: 4 uint32, the points kept in each shell; 4 float32, each shell's radius (in units of the far
// edge of the outer shell); 4 float32, each shell's ink (the sum of its points' opacities in the film), which the
// renderer shares among the points it draws. Then each shell's points as uint16 pairs (ra / 2π, dec / π + 1/2, each
// scaled to 65535), shuffled, so that any leading part of a shell is a fair subset.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2], out = process.argv[3] || 'assets/spherex/shells.bin';
const meta = JSON.parse(readFileSync(join(root, 'data/shells.json')));
const parts = Array.from({ length: meta.parts }, (_, k) => readFileSync(join(root, `data/shells_${k}.bin`)));
const buf = Buffer.concat(parts), q = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2), N = meta.n;
const near = (() => { const b = readFileSync(join(root, 'data/near.bin')); return new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2); })();

// film.js: comoving distance (flat ΛCDM, Ωm = 0.311) in units of the far edge of the furthest shell
const lerp = (a, b, t) => a + (b - a) * t, clamp = (x) => Math.min(1, Math.max(0, x));
const chi = (() => {
  const n = 4000, zmax = 1.2, tab = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) {
    const E = (z) => 1 / Math.sqrt(0.311 * (1 + z) ** 3 + 0.689), z0 = (i - 1) / n * zmax, z1 = i / n * zmax;
    tab[i] = tab[i - 1] + (E(z0) + E(z1)) / 2 * (z1 - z0);
  }
  return (z) => { const x = clamp(z / zmax) * n, i = Math.min(n - 1, Math.floor(x)); return lerp(tab[i], tab[i + 1], x - i); };
})();
const DZ = meta.dz, LOQ = 65535 / meta.lo_scale, WQ = Math.ceil(meta.max_width * LOQ) + 1, CHI_REF = chi(0.34 + DZ);
const shellR = (lo) => chi(lo + DZ / 2) / CHI_REF;
const firstAbove = (x) => { let a = 0, b = N; while (a < b) { const m = (a + b) >> 1; if (q[4 * m + 2] < x) a = m + 1; else b = m; } return a; };

// the film's point set: every third galaxy at its distance, then the near galaxies, then the first shell's (pinned)
const pts = [];   // [index into q or near, kind, r0]
for (let i = 0; i < N; i += 3) pts.push([i, 0, chi((q[4 * i + 2] + q[4 * i + 3]) / 2 / LOQ + DZ / 2) / CHI_REF]);
for (let i = 0; i < near.length / 3; i++) pts.push([i, 1, chi(near[3 * i + 2] / 65535 * 0.5) / CHI_REF]);
const nMain = pts.length;
{
  const lq = 0.075 * LOQ, a = firstAbove(lq - WQ), b = firstAbove(Math.floor(lq) + 1), r = shellR(0.075);
  for (let i = a; i < b; i++) if (q[4 * i + 3] >= lq) pts.push([i, 0, r]);
}
console.error('points', pts.length, 'of which night set', pts.length - nMain);

// the four shells as the film draws them once drawn back: z = 0.1, 0.2, 0.3 (the outer shell's earlier places), and
// the outer shell itself (lo = 0.34, centred on z = 0.355), which does not include the night set
const thinA = (r) => clamp(r * r / 0.6 + 0.12);
const SHELLS = [
  { R: chi(0.1) / CHI_REF, a: 0.05, all: true }, { R: chi(0.2) / CHI_REF, a: 0.05, all: true },
  { R: chi(0.3) / CHI_REF, a: 0.05, all: true }, { R: shellR(0.34), a: 0.34, all: false },
].map((s) => ({ ...s, a: s.a * thinA(s.R) }));
const band = 0.035, smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// a fixed seed, so a rebuild gives the same file
let seed = 2611; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
// points kept in each shell at most: the outer shell carries most of the ink, so it keeps the most
const KEEP = (process.env.KEEP || '120000,120000,120000,400000').split(',').map(Number);
const outShells = SHELLS.map((s, si) => {
  const w = [], idx = [];
  const n = s.all ? pts.length : nMain;
  for (let j = 0; j < n; j++) { const x = 1 - smooth(band * 0.7, band, Math.abs(pts[j][2] - s.R)); if (x > 0) { w.push(x); idx.push(j); } }
  const W = w.reduce((t, x) => t + x, 0);
  // keep each with probability c w (at most 1): every kept point then stands for 1/c of the film's weight
  const c = Math.min(KEEP[si] / W, 1);   // the band weighs at most 1
  const kept = []; for (let k = 0; k < w.length; k++) if (rnd() < c * w[k]) kept.push(idx[k]);
  for (let k = kept.length - 1; k > 0; k--) { const m = Math.floor(rnd() * (k + 1)); [kept[k], kept[m]] = [kept[m], kept[k]]; }
  const ink = s.a * W;   // the film's total opacity in this shell
  console.error(`R ${s.R.toFixed(4)}  candidates ${w.length}  weight ${W.toFixed(0)}  kept ${kept.length}  alpha each ${(ink / kept.length).toFixed(4)}`);
  return { R: s.R, ink, kept };
});

const total = outShells.reduce((t, s) => t + s.kept.length, 0);
const head = new ArrayBuffer(48), hv = new DataView(head), body = new Uint16Array(total * 2);
let o = 0;
outShells.forEach((s, k) => {
  hv.setUint32(4 * k, s.kept.length, true); hv.setFloat32(16 + 4 * k, s.R, true); hv.setFloat32(32 + 4 * k, s.ink, true);
  for (const j of s.kept) {
    const [i, kind] = pts[j];
    body[o++] = kind ? near[3 * i] : q[4 * i];
    body[o++] = kind ? near[3 * i + 1] : q[4 * i + 1];
  }
});
writeFileSync(out, Buffer.concat([Buffer.from(head), Buffer.from(body.buffer)]));
console.log(JSON.stringify({ file: out, bytes: 48 + body.byteLength, shells: outShells.map((s) => ({ R: +s.R.toFixed(5), n: s.kept.length, alpha: +(s.ink / s.kept.length).toFixed(5) })) }));
