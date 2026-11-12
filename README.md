# calumhrmurray.github.io

Personal site of Calum Murray, cosmologist at CosmoStat, CEA Paris-Saclay.
Static HTML and CSS, no build step, served by GitHub Pages. Pages built with the help of Claude Code.

| Page | What it is |
| --- | --- |
| `index.html` | The first screen is the sphere film with a few words on it; then About, the catalogue and its cosmic web movie, the UNIONS map, every publication, and short lists that link into the pages below |
| `publications.html` | Publications and preprints |
| `software.html` | Public code: `cucount` spin correlations, `capish`, Lectern |
| `outreach.html` | Press releases and Astronomy on Tap Paris. `aot.html` only redirects here |
| `press-releases.html` | The UNIONS dark matter map: the globe animation and the July 2026 announcements |
| `unions_map.html` | The same convergence map in WebGL, interactive: drag, zoom, smoothing scale, colour map |
| `weak_lens.html` | An interactive gravitational lensing sandbox |
| `spherex-sky.html` | The SPHEREx catalogue as a movie through redshift, on its own page. Linked from the catalogue section of the home page and from a figure caption in the Cambridge application; still marked `noindex` and left out of the sitemap |
| `agentic-science.html` | The fellowship film (the Legacy SPHEREx Galaxy Catalogue built with agentic science), from `assets/film/`, re-encoded for the web from `career/firstprinciples/animation/film_sound.mp4`. Unlisted: shared by direct link only, marked `noindex` and left out of the sitemap |

The first four pages share `styles.css` (ink on paper, no cards; the typeface is DM Sans, self-hosted in `assets/fonts/` under the SIL Open Font License, set by the variables `--text` and `--label` at its top) and `site.js`, which plays a
film only while it is on screen, shows stills with the browser's play button to anyone who asks for reduced
motion, and opens any figure or film large on a click. The other pages carry their own styles and are left alone.

## The films

All are silent H.264 in `assets/`, each with a poster still. Their sources are in
`~/Documents/work/talks-and-visualisations/visualisations`.

| File | From | How |
| --- | --- | --- |
| `spherex/spheres.mp4` (74 MB), `spheres_small.mp4` (15 MB) | `2611_catalogue_film` | not a cut of `film.mp4`: a separate render of the journey out (film time 22 to 33.6 s) without words, rings or the "we are here" mark, then held zoomed out while the shells turn. The turn quickens to 10°/s over 4 s and makes one whole turn, so the last 36 s loop without a seam; `data-loop-from="23.733"` sends the film back there when it ends. The whole 16:9 frame, the sphere at its centre, its paper lifted to white. Two cuts: 1920×1080 at crf 28, and 1280×720 at crf 29 for screens under 1000 px, chosen by the `media` attribute on its `<source>` |
| `spherex/allsky_redshift_oldstyle_loop.mp4` (18 MB) | the CosmoStat group-meeting deck | on white; sweeps up and down in redshift without a pause, so it loops as it is. Also on `spherex-sky.html` |
| `unions/unions_globe.mp4` (3.3 MB) | | a seamless 300-frame rotation, so it tiles without a cut. A disc on black: on the light pages `clip-path` shows only the disc |

The sphere film was rendered by serving the film's folder with `film.js` patched in memory (a turn added to the
camera's RA, `drawSweepMarks` switched off, `layer=picture` for no words), so nothing in that repository changed.
Turning point clouds compress badly: at a quality where the galaxies still read, the large cut is about the floor (at crf 30 the web inside each shell turns to mush).
`tools/render_spheres.mjs <film folder> <out folder> movie` makes the master again.

`unions_map.html` loads three textures from `assets/unions/` (a Gaia EDR3 background and two convergence maps,
smoothed at 3.0 and 3.5) plus `three.js` from a CDN; the textures are ~4 MB in total, which is why they are files
rather than base64 inlined into the page.

To work on it locally, serve the folder rather than opening the files directly, or the
WebGL textures will be blocked as cross-origin:

```bash
python3 -m http.server 8000
```

Python's server does not answer range requests, so there a film that ends restarts from its beginning instead of
its loop point. GitHub Pages does answer them.

The two SPHEREx films are on white and carry `mix-blend-mode: multiply` (`.onpaper`), so white becomes the page
and the ink stays: the page colour is `--paper` alone, and changing it needs no new encode.

## Publications and CV

`publications.html` and the lists on the home page were made from the First Principles dossier in the career
repository (`firstprinciples/dossier/cv/publications.tex`, compiled from arXiv on 30 October 2026), keeping only
what is on arXiv: the paper under internal review and the two in preparation are left out. "Second author papers"
are the co-authored ones where I am second in the author list; the home page shows first and second author only. `cv.pdf` is built from
`tools/cv.tex`: that dossier's `cv.tex` with the language written for an AI-research audience taken out (the
last sentence of the profile, the "AI-native research" section, the "agentic science paper" note), the LSx count
brought to 71 million, and the complete list pointed at `publications.html`. It needs the `needspace` package.
