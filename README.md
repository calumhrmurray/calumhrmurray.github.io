# calumhrmurray.github.io

Personal site of Calum Murray, observational cosmologist at CosmoStat, CEA Paris-Saclay.
Static HTML and CSS, no build step, served by GitHub Pages.

| Page | What it is |
| --- | --- |
| `index.html` | Research interests, and links into the rest of the site |
| `publications.html` | Publications and preprints |
| `software.html` | Public code: `cucount` spin correlations, `capish`, Lectern |
| `press-releases.html` | The UNIONS dark matter map: the globe animation and the July 2026 announcements. Linked from `outreach.html`, not from the nav |
| `unions_map.html` | The same convergence map in WebGL, interactive: drag, zoom, smoothing scale, colour map |
| `weak_lens.html` | An interactive gravitational lensing sandbox |
| `outreach.html`, `aot.html` | Public outreach and Astronomy on Tap Paris |

`press-releases.html` and `outreach.html` play a 3.3 MB looping animation from `assets/unions/` (a seamless 300-frame
rotation, so it tiles without a cut). `unions_map.html` loads three textures from the same
folder (a Gaia EDR3 background and two convergence maps, smoothed at 3.0 and 3.5) plus
`three.js` from a CDN; the textures are ~4 MB in total, which is why they are files rather
than base64 inlined into the page.

To work on it locally, serve the folder rather than opening the files directly, or the
WebGL textures will be blocked as cross-origin:

```bash
python3 -m http.server 8000
```

`script.js` draws a force-directed graph of research topics. It is not currently included
by any page: it was dropped from `index.html` in e23200f, a commit about removing a PDF,
so the removal looks accidental. Its styles (`.graph-card`, `.graph-shell`) are still in
`styles.css`.
