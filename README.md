# calumhrmurray.github.io

Personal site of Calum Murray, cosmologist at CosmoStat, CEA Paris-Saclay.
Static HTML and CSS, no build step, served by GitHub Pages. Pages built with the help of Claude Code.

| Page | What it is |
| --- | --- |
| `index.html` | The first screen is the four shells of galaxies, drawn live, with a few words on it; then About, the catalogue and its cosmic web movie, the UNIONS map, every publication, and short lists that link into the pages below |
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
| `spherex/allsky_redshift_oldstyle_loop.mp4` (18 MB) | the CosmoStat group-meeting deck | on white; sweeps up and down in redshift without a pause, so it loops as it is. Also on `spherex-sky.html` |
| `unions/unions_globe.mp4` (3.3 MB) | | a seamless 300-frame rotation, so it tiles without a cut. A disc on black: on the light pages `clip-path` shows only the disc |

## The shells on the first screen

The home page no longer plays a film: the sphere film's held, zoomed-out view is drawn live by `shells.js` (WebGL, no
library) from `assets/spherex/shells.bin` (3.0 MB), so that each of the four shells (z = 0.1, 0.2, 0.3 and the outer
shell centred on 0.355) can be dragged round on its own. Each turns on the sky's pole at the film's 10°/s; a drag
turns the shell under the pointer (the smallest whose disc holds it, so each is taken by its own ring), a throw
carries on and dies away over about a second, and the shell's own turn comes back. With reduced motion nothing
turns unasked and a shell stops where it is let go. On a touch screen a touch that lands on the sphere turns it and
anywhere else scrolls the page. The ink is a paler navy than the film's, `#2b4a70` at 0.85 in place of `#16304f` at 1 (`INKS`, one per shell, and `PALE` at the top of `shells.js`).

`tools/prep_shells.mjs <film folder>` makes `shells.bin` from the film's `data/`: the same points and weights the
film's `cloud.js` draws once drawn back (every third galaxy of LSx v0.92's quality sample, the near galaxies and the
night sky's first shell; a galaxy counts towards a shell with the weight of the film's soft band round its radius),
kept at random in proportion to that weight, 120,000 in each inner shell and 400,000 in the outer, out of 3.6 million.
The file stores each shell's total ink, and `shells.js` shares it among the points it draws, so each shell keeps the
film's balance of darkness (then scaled by `PALE`). The camera, framing and dot size are the film's. `shells_poster.jpg` is the first live
frame on white, shown before the points arrive and wherever WebGL is missing. The sphere films it
replaced (`spheres.mp4`, `spheres_loop.mp4`, their small cuts and posters) were deleted; they are in the history up to
`6de7303`.

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

The SPHEREx movie and the shells' poster are on white and, like the shells' canvas, carry `mix-blend-mode: multiply` (`.onpaper`), so white becomes the page
and the ink stays: the page colour is `--paper` alone, and changing it needs no new encode.

## Publications and CV

`publications.html` and the lists on the home page were made from the First Principles dossier in the career
repository (`firstprinciples/dossier/cv/publications.tex`, compiled from arXiv on 30 October 2026), keeping only
what is on arXiv: the paper under internal review and the two in preparation are left out. "Second author papers"
are the co-authored ones where I am second in the author list; the home page shows first and second author only. `cv.pdf` is built from
`tools/cv.tex`: that dossier's `cv.tex` with the language written for an AI-research audience taken out (the
last sentence of the profile, the "AI-native research" section, the "agentic science paper" note), the LSx count
brought to 71 million, and the complete list pointed at `publications.html`. It needs the `needspace` package.
