// The opening "blocks" slides, painted in watercolour. Any <svg data-blocks="…"> in the deck is filled
// by this script: "wall" is the neat, slightly higgledy-piggledy wall; "anim" plays it apart, once,
// into the nest: the rest of the wall fades away, leaving blocks that overlap, contain one another,
// and a small block that opens onto a large one; "life" starts from the nest and lets it run on its
// own: blocks are painted in, grow, shrink, collapse, crumble and fade, at random. Each slide starts
// where the one before ends, so they can never drift apart.
//
// How the watercolour is made: every edge of a block is its own brush stroke, a polygon whose width
// swells and tapers and whose ends overshoot the corners; the pale fills are wobbly polygons. SVG
// filters then do what water does: a low-frequency displacement for the ragged edge, an eroded copy
// subtracted from the shape so pigment pools at the rim, a large-scale noise for blooms, and a fine
// noise for the paper's grain. Each shape is filtered on its own, so overlapping washes glaze darker.
// The noise along a stroke is fixed per block, so a moving block keeps its brushwork instead of boiling.
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1280, H = 720;
  const BLUES = ['#1f5d96', '#2a6fab', '#1a4a78', '#3580bf', '#24619c'];
  const WASH = ['#3d8ad0', '#2f7cc4', '#5299d6', '#2a6db0'];
  const f1 = (v) => Math.round(v * 10) / 10;

  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // a smooth wobble along t in [0, 1]: three sines with fixed random frequencies and phases
  function wobble(r, fmax = 6) {
    const k = [0, 1, 2].map(() => ({ f: 0.5 + r() * (fmax - 0.5), p: r() * 6.28, a: 0.5 + r() * 0.5 }));
    return (t) => k.reduce((s, c) => s + c.a * Math.sin(c.f * 6.28 * t + c.p), 0) / 1.6;
  }

  // ---- the layout ----

  function makeBrick(r, x, y, w, h, opt = {}) {
    return {
      x, y, w, h, rot: opt.rot ?? (r() - 0.5) * 3,
      ink: opt.ink ?? BLUES[Math.floor(r() * BLUES.length)],
      wash: opt.wash ?? (r() < 0.32), washA: 0.55 + r() * 0.35,
      width: opt.width ?? 5.2 + r() * 1.6,
      strokes: [0, 1, 2, 3].map(() => ({ wob: wobble(r, 2.2), thick: wobble(r, 3), o0: -2 + r() * 8, o1: -2 + r() * 9, tilt: (r() - 0.5) * 0.012, drift: (r() - 0.5) * 2.4 })),
      edge: wobble(r), seed: Math.floor(r() * 1000),
    };
  }

  function buildWall(r, x0, x1, bottom, courses, ch, gap, raggedTop, scale = 1) {
    const out = [];
    for (let row = 0; row < courses; row++) {
      const y = bottom - (row + 1) * (ch + gap);
      let x = x0 - r() * 70 * scale;
      let lo = x0, hi = x1;
      if (raggedTop && row === courses - 1) { lo = x0 + (0.05 + r() * 0.2) * (x1 - x0); hi = x1 - (0.15 + r() * 0.2) * (x1 - x0); }
      if (raggedTop && row === courses - 2) { hi = x1 - r() * 0.1 * (x1 - x0); }
      while (x < x1) {
        const w = (88 + r() * 120) * scale;
        const a = Math.max(x, lo), b = Math.min(x + w, hi);
        if (b - a > 34 * scale) {
          out.push(makeBrick(r, a + (r() - 0.5) * 5 * scale, y + (r() - 0.5) * 5 * scale, b - a - gap, ch + (r() - 0.5) * 4 * scale,
            scale < 1 ? { width: 2.4 + r() * 0.8, rot: (r() - 0.5) * 2.5 } : {}));
        }
        x += w;
      }
    }
    return out;
  }

  const r = rng(20261002);
  const wall = buildWall(r, 130, 1150, 676, 7, 56, 7, true);

  // the nest: [x, y, w, h, rot, wash]
  const NEST = {
    L1: [146, 232, 452, 336, -0.6, true],
    a: [182, 266, 150, 96, 1.4, true],
    b: [298, 300, 132, 84, -1.8, false],
    c: [194, 392, 236, 152, 0.5, false],
    d: [212, 420, 74, 52, -1.2, true],
    e: [304, 436, 98, 76, 2.2, false],
    f: [326, 458, 44, 32, -2.5, true],
    g: [458, 262, 108, 186, 0.9, false],
    h: [548, 470, 172, 128, -1.2, true],
    B1: [664, 214, 252, 160, 1.1, true],
    B2: [814, 284, 232, 190, -1.4, true],
    B3: [966, 236, 140, 100, 2.4, false],
    S: [752, 616, 66, 48, -2.6, true],
  };
  const Z = [866, 498, 316, 190, 0.6];

  // each nest block is lifted off the wall brick nearest to it
  const free = new Set(wall.map((_, i) => i));
  const movers = Object.entries(NEST).map(([name, [x, y, w, h, rot, wash]]) => {
    let best = -1, bd = Infinity;
    for (const i of free) {
      const b = wall[i];
      const d = Math.hypot(b.x + b.w / 2 - x - w / 2, b.y + b.h / 2 - y - h / 2) + Math.abs(b.w - w) * 0.3;
      if (d < bd) { bd = d; best = i; }
    }
    free.delete(best);
    const src = wall[best];
    return { name, src, from: { x: src.x, y: src.y, w: src.w, h: src.h, rot: src.rot }, to: { x, y, w, h, rot }, wash };
  });
  const S = movers.find((m) => m.name === 'S');
  S.ink = '#173f68';
  const zoom = makeBrick(r, ...Z.slice(0, 4), { rot: Z[4], wash: true, ink: '#1f5d96', width: 6 });
  zoom.washA = 0.35;
  const mini = buildWall(r, Z[0] + 18, Z[0] + Z[2] - 14, Z[1] + Z[3] - 14, 5, 22, 5, false, 0.36);
  const lineR = rng(77);
  const zoomLines = [makeBrick(lineR, 0, 0, 0, 0, { width: 2.4 }), makeBrick(lineR, 0, 0, 0, 0, { width: 2.4 })];

  // ---- geometry: a block's brush strokes and wash as polygons ----

  function place(b, rect) {
    const { x, y, w, h, rot } = rect;
    const cx = x + w / 2, cy = y + h / 2, a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return (px, py) => [cx + (px - w / 2) * c - (py - h / 2) * s, cy + (px - w / 2) * s + (py - h / 2) * c];
  }

  // one stroke from p to q: a polygon whose half-width swells after the press and thins as the brush lifts;
  // upto < 1 is the stroke still being painted, only that far along, with the brush's tip rounding it off
  function stroke(p, q, st, width, N = 22, upto = 1) {
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const nx = -uy + st.tilt, ny = ux;
    const a = [p[0] - ux * st.o0, p[1] - uy * st.o0], len = L + st.o0 + st.o1;
    const left = [], right = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N * upto;
      let half = width / 2 * (0.42 + 0.58 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.35)) * (1.12 - 0.3 * t) * (1 + 0.22 * st.thick(t));
      if (upto < 1) half *= Math.min(1, 0.35 + (upto - t) * len / 9);
      const off = st.wob(t) * 1.1 + st.drift * t;
      const cx = a[0] + ux * len * t + nx * off, cy = a[1] + uy * len * t + ny * off;
      left.push([cx + nx * half, cy + ny * half]);
      right.push([cx - nx * half, cy - ny * half]);
    }
    const pts = left.concat(right.reverse());
    return 'M' + pts.map((v) => f1(v[0]) + ' ' + f1(v[1])).join('L') + 'Z';
  }

  // progress paints the four edges one after another, as a hand would
  function outline(b, rect, scale = 1, progress = 1) {
    const P = place(b, rect), { w, h } = rect;
    const corners = [P(0, 0), P(w, 0), P(w, h), P(0, h)];
    return [0, 1, 2, 3].map((i) => {
      const u = Math.min(1, progress * 4 - i);
      return u > 0.02 ? stroke(corners[i], corners[(i + 1) % 4], b.strokes[i], b.width * scale, 22, u) : '';
    }).join(' ');
  }

  function washPath(b, rect) {
    const P = place(b, rect), { w, h } = rect, pts = [], N = 40;
    for (let i = 0; i < N; i++) {
      const t = i / N, side = Math.floor(t * 4), u = t * 4 - side;
      let px, py;
      if (side === 0) { px = u * w; py = 0; } else if (side === 1) { px = w; py = u * h; } else if (side === 2) { px = w - u * w; py = h; } else { px = 0; py = h - u * h; }
      const e = b.edge(t) * 2.2, cx = w / 2 - px, cy = h / 2 - py, d = Math.hypot(cx, cy) || 1;
      pts.push(P(px + cx / d * (2.5 + e), py + cy / d * (2.5 + e)));
    }
    return 'M' + pts.map((v) => f1(v[0]) + ' ' + f1(v[1])).join('L') + 'Z';
  }

  // ---- the filters ----

  const DEFS = `
  <filter id="wc-line" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="2" seed="4" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="3" xChannelSelector="R" yChannelSelector="G" result="shape"/>
    <feGaussianBlur in="shape" stdDeviation="0.55" result="soft"/>
    <feMorphology in="soft" operator="erode" radius="1.1" result="inner"/>
    <feGaussianBlur in="inner" stdDeviation="1" result="innerSoft"/>
    <feComposite in="soft" in2="innerSoft" operator="out" result="rim"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="3" seed="11" result="blot"/>
    <feColorMatrix in="blot" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2 1.75" result="blotA"/>
    <feComposite in="soft" in2="blotA" operator="in" result="body"/>
    <feComponentTransfer in="body" result="bodyT"><feFuncA type="linear" slope="0.72"/></feComponentTransfer>
    <feMerge result="paint"><feMergeNode in="bodyT"/><feMergeNode in="rim"/></feMerge>
    <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="1" seed="2" result="grain"/>
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.45 1.18"/>
    <feComposite in="paint" operator="in"/>
  </filter>
  <filter id="wc-wash" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="7" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="9" xChannelSelector="R" yChannelSelector="G" result="shape"/>
    <feGaussianBlur in="shape" stdDeviation="1.2" result="soft"/>
    <feMorphology in="soft" operator="erode" radius="3" result="inner"/>
    <feGaussianBlur in="inner" stdDeviation="5" result="innerSoft"/>
    <feComposite in="soft" in2="innerSoft" operator="out" result="rim"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="4" seed="23" result="bloom"/>
    <feColorMatrix in="bloom" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.5 1.3" result="bloomA"/>
    <feComposite in="soft" in2="bloomA" operator="in" result="body"/>
    <feComponentTransfer in="body" result="bodyT"><feFuncA type="linear" slope="0.32"/></feComponentTransfer>
    <feComponentTransfer in="rim" result="rimT"><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
    <feMerge result="paint"><feMergeNode in="bodyT"/><feMergeNode in="rimT"/></feMerge>
    <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="5" result="grain"/>
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.5 1.2"/>
    <feComposite in="paint" operator="in"/>
  </filter>
  <filter id="wc-paper" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="31" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.62  0 0 0 0 0.56  0 0 0 0 0.46  0.7 0 0 0 -0.3"/>
  </filter>`;

  // the filters live once in the page, outside any slide, so a slide reveal has hidden can't take
  // them with it, and the HTML title can use the text filter too
  function ensureFilters() {
    if (document.getElementById('wc-text')) return;
    const host = document.createElementNS(NS, 'svg');
    host.setAttribute('width', '0'); host.setAttribute('height', '0');
    host.setAttribute('style', 'position:absolute');
    host.setAttribute('aria-hidden', 'true');
    host.innerHTML = DEFS + `
    <filter id="wc-text" x="-10%" y="-25%" width="120%" height="150%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="4" result="warp"/>
      <feDisplacementMap in="SourceGraphic" in2="warp" scale="5" xChannelSelector="R" yChannelSelector="G" result="shape"/>
      <feGaussianBlur in="shape" stdDeviation="0.7" result="soft"/>
      <feMorphology in="soft" operator="erode" radius="2" result="inner"/>
      <feGaussianBlur in="inner" stdDeviation="2" result="innerSoft"/>
      <feComposite in="soft" in2="innerSoft" operator="out" result="rim"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="4" seed="12" result="blot"/>
      <feColorMatrix in="blot" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.7" result="blotA"/>
      <feComposite in="soft" in2="blotA" operator="in" result="body"/>
      <feComponentTransfer in="body" result="bodyT"><feFuncA type="linear" slope="0.62"/></feComponentTransfer>
      <feMerge result="paint"><feMergeNode in="bodyT"/><feMergeNode in="rim"/></feMerge>
      <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="2" result="grain"/>
      <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.6 1.2"/>
      <feComposite in="paint" operator="in"/>
    </filter>`;
    document.body.prepend(host);
  }


  // ---- drawing ----

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // a painted block: its wash under its outline, each with its own filter
  function blockNode(parent, b, ink) {
    const g = el('g', {}, parent);
    const wash = el('path', { fill: WASH[(b.seed % WASH.length)], filter: 'url(#wc-wash)' }, g);
    const line = el('path', { fill: ink || b.ink, filter: 'url(#wc-line)' }, g);
    return { g, wash, line };
  }
  // washOn is how much of the block's wash shows, 0 to 1, so a wash can fade in as a block moves.
  // Nothing is touched when nothing has changed: re-setting a path, even to the same value, makes the
  // browser run its filters again
  function drawBlock(n, b, rect, opacity = 1, washOn = b.wash ? 1 : 0, scale = 1, progress = 1) {
    const key = opacity <= 0.001 ? 'off' : [opacity, washOn, progress, rect.x, rect.y, rect.w, rect.h, rect.rot].map((v) => v.toFixed(2)).join();
    if (n.key === key) return;
    n.key = key;
    n.g.style.display = opacity <= 0.001 ? 'none' : '';
    if (opacity <= 0.001) return;
    n.g.style.opacity = opacity;
    n.line.setAttribute('d', outline(b, rect, scale, progress));
    if (washOn > 0.01) { n.wash.setAttribute('d', washPath(b, rect)); n.wash.style.opacity = b.washA * washOn; n.wash.style.display = ''; }
    else n.wash.style.display = 'none';
  }

  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const clamp = (t) => Math.max(0, Math.min(1, t));
  const ramp = (T, a, b) => clamp((T - a) / (b - a));
  const lerpRect = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, w: p.w + (q.w - p.w) * t, h: p.h + (q.h - p.h) * t, rot: p.rot + (q.rot - p.rot) * t });
  const rectOf = (b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, rot: b.rot });

  // the order the movers paint in: containers first, so what they contain sits on top of them
  const ORDER = ['L1', 'h', 'g', 'a', 'b', 'c', 'd', 'e', 'f', 'B1', 'B2', 'B3', 'S'];
  const MOV = ORDER.map((k) => movers.find((m) => m.name === k));

  // the timeline, in seconds: hold the wall, let the rest of it fade away while the movers lift
  // off one after another, open the small block onto the large one, fill it with a wall, and stop there
  const END = 8.2;

  // three layers, each its own svg: the paper, the rest of the wall, and the blocks that change. The
  // middle one only ever fades as a whole, which the browser does by compositing, without running its
  // filters again; only the blocks that change are repainted frame by frame
  function layers(svg) {
    const layer = (cls) => { const e = el('svg', { class: 'wc ' + cls, viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }); svg.before(e); return e; };
    const paper = layer('wc-paper');
    paper.innerHTML = `<rect width="${W}" height="${H}" filter="url(#wc-paper)"/>`;
    const live = layer('wc-fade');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.classList.add('wc-top');
    svg.innerHTML = '';
    const moving = new Set(movers.map((m) => m.src));
    wall.filter((b) => !moving.has(b)).forEach((b) => drawBlock(blockNode(live, b), b, rectOf(b)));
    return { live, top: el('g', {}, svg) };
  }

  // run frame(seconds since the slide appeared) while the slide is showing; reset() when it is left
  function whileShown(svg, frame, reset) {
    const section = svg.closest('section');
    let start = null, raf = 0;
    const tick = (now) => {
      if (start === null) start = now;
      raf = frame((now - start) / 1000) === false ? 0 : requestAnimationFrame(tick);
    };
    const sync = () => {
      if (section && section.classList.contains('present')) { if (!raf) { start = null; raf = requestAnimationFrame(tick); } }
      else { cancelAnimationFrame(raf); raf = 0; reset(); }
    };
    if (window.Reveal && Reveal.on) { Reveal.on('ready', sync); Reveal.on('slidechanged', sync); }
    sync();
  }

  // ---- "wall" and "anim": the wall comes apart into the nest ----

  function paintNest(svg, mode) {
    const { live, top } = layers(svg);
    // a block that has landed goes down to a still layer, as in "life" below, so what moves after it
    // doesn't make the browser repaint it
    const still = el('svg', { class: 'wc', viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' });
    svg.before(still);
    const lines = zoomLines.map((b) => ({ b, n: blockNode(top, b, '#1a4a78') }));
    const zoomN = blockNode(top, zoom);
    const minis = mini.map((b) => ({ b, n: blockNode(top, b) }));
    const mov = MOV.map((m, i) => ({ m, i, n: blockNode(top, m.src, m.ink) }));

    function frame(T) {
      const settle = mode === 'wall' ? 0 : ease(ramp(T, 1.0, 2.4));
      live.style.opacity = (1 - settle).toFixed(3);
      let moved = false;
      for (const mv of mov) {
        const t = ease(ramp(T, 1.4 + mv.i * 0.17, 3.6 + mv.i * 0.17));
        drawBlock(mv.n, mv.m.src, lerpRect(mv.m.from, mv.m.to, t), 1, (mv.m.src.wash ? 1 - t : 0) + (mv.m.wash ? t : 0));
        const layer = t >= 1 ? still : top;
        if (mv.layer !== layer) { mv.layer = layer; moved = true; }
      }
      // keep the painting order: containers first, then what they contain
      if (moved) for (const mv of mov.slice().reverse()) mv.layer.insertBefore(mv.n.g, mv.layer.firstChild);
      // the small block opens: the lines run out from its corners, the large block grows out of it
      const s = S.to, open = ease(ramp(T, 5.6, 7.0));
      const zr = lerpRect({ ...s }, rectOf(zoom), open);
      drawBlock(zoomN, zoom, zr, ramp(T, 5.6, 5.9));
      const P = place(zoom, s), Q = place(zoom, zr);
      const ends = [[P(s.w, 0), Q(0, 0)], [P(s.w, s.h), Q(0, zr.h)]];
      lines.forEach(({ b, n }, k) => {
        const [p, q] = ends[k], key = open > 0.02 ? open.toFixed(3) : 'off';
        if (n.key === key) return;
        n.key = key;
        n.g.style.opacity = 0.55;
        n.g.style.display = open > 0.02 ? '' : 'none';
        if (open > 0.02) n.line.setAttribute('d', stroke(p, q, b.strokes[0], 2.4, 30));
      });
      const fill = ramp(T, 6.9, 7.9);
      minis.forEach(({ b, n }, k) => drawBlock(n, b, rectOf(b), clamp(fill * minis.length * 0.25 - k * 0.25), b.wash && k % 2 === 0 ? 1 : 0, 0.5));
      return T < END;
    }

    frame(0);
    // a breath on the wall, then it plays once and stays on the nest
    if (mode === 'anim') whileShown(svg, (t) => frame(Math.max(0, t - 0.6)), () => frame(0));
    svg._blocksFrame = frame;
  }

  // ---- "life": the nest left to itself ----
  //
  // Many things happen at once, each to one block, chosen at random: a block is painted in (often
  // inside a bigger one), grows, shrinks, collapses under its own weight, crumbles into shards, or fades
  // away. How likely each is leans on how many blocks there are, so the slide neither empties nor silts
  // up. The shards fall and stay, piling up along the bottom. A click stops anything new being made and
  // the blocks all fail within a few seconds, leaving only the piles.
  //
  // At this pace a block painted with live SVG filters costs too much to repaint, so life paints each
  // block once into a bitmap, at the size it has at rest, and draws the slide on a canvas. Moving,
  // resizing, squashing and fading a block are then transforms of its bitmap; a block being painted in
  // is its bitmap revealed edge by edge; a crumbling block is its own painted bitmap cut into pieces. A
  // block that has changed size is painted again at its new size once it comes to rest.

  const AREA = { x0: 130, x1: 1170, y0: 210, y1: 684 }, FLOOR = 694, GRAVITY = 1500;
  // SPEED is how much faster than the durations below life runs; BUSY is how many blocks can be changing
  // at once; FALL is the speed-up for the falling pieces, gentler than SPEED so they can still be seen
  const SPEED = 10, BUSY = 10, FALL = 3;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
  const fit = (r) => {
    const w = Math.min(r.w, AREA.x1 - AREA.x0, 680), h = Math.min(r.h, AREA.y1 - AREA.y0, 420);
    return { w, h, rot: r.rot, x: Math.max(AREA.x0, Math.min(AREA.x1 - w, r.x + (r.w - w) / 2)), y: Math.max(AREA.y0, Math.min(AREA.y1 - h, r.y + (r.h - h) / 2)) };
  };

  // paths painted with the filters into a bitmap k times the slide's resolution; vb is the viewBox
  function bitmap(paths, vb, k) {
    const [x, y, w, h] = vb;
    const svg = `<svg xmlns="${NS}" width="${Math.ceil(w * k)}" height="${Math.ceil(h * k)}" viewBox="${x} ${y} ${w} ${h}"><defs>${DEFS}</defs>` +
      paths.map((q) => `<path d="${q.d}" fill="${q.fill}" filter="url(#${q.filter})"/>`).join('') + '</svg>';
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return img.decode().then(() => (window.createImageBitmap ? createImageBitmap(img) : img)).catch(() => img);
  }

  // a block's outline and wash as two bitmaps, drawn at the origin, unrotated, with room around for the
  // brush's overshoot and the filters' spread
  function paintBlock(it, k) {
    const { w, h } = it.rect, p = 16, r0 = { x: 0, y: 0, w, h, rot: 0 }, vb = [-p, -p, w + 2 * p, h + 2 * p];
    const token = (it.token = (it.token || 0) + 1);
    return Promise.all([
      bitmap([{ d: outline(it.b, r0, it.scale), fill: it.ink, filter: 'wc-line' }], vb, k),
      it.hasWash ? bitmap([{ d: washPath(it.b, r0), fill: WASH[it.b.seed % WASH.length], filter: 'wc-wash' }], vb, k) : null,
    ]).then(([line, wash]) => { if (it.token === token) it.img = { line, wash, w, h, p }; return it.img; });
  }

  function drawItem(ctx, it) {
    const im = it.img, { rect } = it;
    if (!im || it.opacity <= 0.001) return;
    const { w, h, p } = im;
    ctx.save();
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.rotate(rect.rot * Math.PI / 180);
    ctx.scale(rect.w / w, rect.h / h);
    ctx.translate(-w / 2, -h / 2);
    if (im.wash && it.wash > 0.01) {
      ctx.globalAlpha = it.opacity * it.b.washA * it.wash;
      ctx.drawImage(im.wash, -p, -p, w + 2 * p, h + 2 * p);
    }
    ctx.globalAlpha = it.opacity;
    if (it.progress < 1) {
      // the four edges revealed one after another, as a hand would paint them
      const u = (i) => clamp(it.progress * 4 - i);
      ctx.beginPath();
      ctx.rect(-p, -p, (w + 2 * p) * u(0), 2 * p);
      ctx.rect(w - p, -p, 2 * p, (h + 2 * p) * u(1));
      ctx.rect(w + p - (w + 2 * p) * u(2), h - p, (w + 2 * p) * u(2), 2 * p);
      ctx.rect(-p, h + p - (h + 2 * p) * u(3), 2 * p, (h + 2 * p) * u(3));
      ctx.clip();
    }
    ctx.drawImage(im.line, -p, -p, w + 2 * p, h + 2 * p);
    ctx.restore();
  }

  function paintLife(svg) {
    const { live } = layers(svg);
    live.remove();
    const canvas = document.createElement('canvas');
    canvas.className = 'wc';
    svg.after(canvas);
    const ctx = canvas.getContext('2d');
    const k = Math.min(3, Math.max(1, (window.devicePixelRatio || 1) * Math.max(innerWidth / W, innerHeight / H)));
    canvas.width = Math.round(W * k); canvas.height = Math.round(H * k);

    // the nest as life starts from it, painted once when the page loads
    const start = [
      ...MOV.map((m) => ({ b: m.src, rect: { ...m.to }, wash: m.wash ? 1 : 0, ink: m.ink })),
      { b: zoom, rect: rectOf(zoom), wash: 1 },
      ...mini.map((b, i) => ({ b, rect: rectOf(b), wash: b.wash && i % 2 === 0 ? 1 : 0, scale: 0.5 })),
    ];
    const item = (d) => ({ b: d.b, rect: { ...d.rect }, wash: d.wash ?? (d.b.wash ? 1 : 0), hasWash: (d.wash ?? (d.b.wash ? 1 : 0)) > 0, scale: d.scale ?? 1, ink: d.ink || d.b.ink, opacity: 1, progress: 1, anim: null, img: null });
    const startImgs = start.map((d) => paintBlock(item(d), k));
    let linesImg = null;
    const s0 = S.to, z0 = rectOf(zoom), P = place(zoom, s0), Q = place(zoom, z0);
    bitmap(zoomLines.map((b, i) => ({ d: stroke(P(s0.w, i ? s0.h : 0), Q(0, i ? z0.h : 0), b.strokes[0], 2.4, 30), fill: '#1a4a78', filter: 'wc-line' })), [0, 0, W, H], k).then((im) => { linesImg = im; });

    let items = [], bits = [], clock = 0, next = 0, shown = 0, failing = null;

    // the shards that have come to rest are painted once into the rubble, and the floor's height at each
    // few pixels remembers them, so later shards land on top and the pile grows
    const rubble = document.createElement('canvas');
    rubble.width = canvas.width; rubble.height = canvas.height;
    const rctx = rubble.getContext('2d');
    const BIN = 4, heights = new Float32Array(Math.ceil(W / BIN) + 1), PILE = 150;
    const bin = (x) => Math.max(0, Math.min(heights.length - 1, Math.round(x / BIN)));
    function ground(x0, x1) { let m = 0; for (let i = bin(x0); i <= bin(x1); i++) m = Math.max(m, heights[i]); return FLOOR - m; }
    // a shard's half-extents on screen, from its visible length and thickness and its angle
    function extent(bit) {
      const a = (bit.rot + bit.axis) * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
      return [0.5 * (bit.len * c + bit.thick * s), 0.5 * (bit.len * s + bit.thick * c)];
    }
    function drawBit(c, bit) {
      c.save();
      c.globalAlpha = bit.alpha;
      c.translate(bit.x, bit.y);
      c.rotate(bit.rot * Math.PI / 180);
      c.scale(bit.fx, bit.fy);
      c.drawImage(bit.img, bit.sx * bit.kx, bit.sy * bit.ky, bit.sw * bit.kx, bit.sh * bit.ky, -bit.sw / 2, -bit.sh / 2, bit.sw, bit.sh);
      c.restore();
    }
    // a shard comes to rest lying nearly flat on whatever is below it, and the pile slumps to a slope
    function settle(bit) {
      const a = bit.rot + bit.axis;
      bit.rot = Math.round(a / 180) * 180 + rand(-16, 16) - bit.axis;
      const [ex] = extent(bit), g = ground(bit.x - ex, bit.x + ex);
      // lying in the pile, not perched on its highest point: shards pack, so each adds a little height
      bit.y = g - Math.min(bit.thick, 8) * 0.5 + rand(0, 4);
      rctx.setTransform(k, 0, 0, k, 0, 0);
      drawBit(rctx, bit);
      const add = Math.min(bit.thick, 8) * 0.3;
      for (let i = bin(bit.x - ex); i <= bin(bit.x + ex); i++) heights[i] = Math.min(PILE, heights[i] + add);
      for (let pass = 0; pass < 3; pass++) {
        for (let i = bin(bit.x - ex - 80); i < bin(bit.x + ex + 80); i++) {
          const d = heights[i] - heights[i + 1];
          if (Math.abs(d) > 3) { const m = (Math.abs(d) - 3) / 2 * Math.sign(d); heights[i] -= m; heights[i + 1] += m; }
        }
      }
    }

    function reset() {
      items = start.map(item);
      Promise.all(startImgs).then((imgs) => { imgs.forEach((im, i) => { if (items[i] && items[i].b === start[i].b && !items[i].img) items[i].img = im; }); if (!shown) draw(); });
      bits = []; clock = 0; next = 0.5 * SPEED; shown = 0; failing = null;
      rctx.setTransform(1, 0, 0, 1, 0, 0);
      rctx.clearRect(0, 0, rubble.width, rubble.height);
      heights.fill(0);
      draw();
    }

    function remove(it) { const i = items.indexOf(it); if (i >= 0) items.splice(i, 1); }
    function scaleRect(r, f) { return { x: r.x + r.w / 2 * (1 - f), y: r.y + r.h / 2 * (1 - f), w: r.w * f, h: r.h * f, rot: r.rot + rand(-1.5, 1.5) }; }

    // the events: each sets it.anim = { kind, t0, dur, ... } and step() plays it
    const EVENTS = {
      create() {
        const hosts = items.filter((it) => !it.anim && it.rect.w > 130 && it.rect.h > 90);
        let rect;
        if (hosts.length && Math.random() < 0.45) {
          const q = pick(hosts).rect, w = q.w * rand(0.22, 0.55), h = q.h * rand(0.22, 0.55);
          rect = { x: q.x + rand(10, q.w - w - 10), y: q.y + rand(10, q.h - h - 10), w, h, rot: q.rot + rand(-2, 2) };
        } else {
          const w = Math.random() < 0.2 ? rand(240, 420) : rand(46, 220), h = Math.min(w * rand(0.4, 1.1), 300);
          rect = fit({ x: rand(AREA.x0, AREA.x1 - w), y: rand(AREA.y0, AREA.y1 - h), w, h, rot: rand(-2.5, 2.5) });
        }
        const b = makeBrick(Math.random, rect.x, rect.y, rect.w, rect.h, rect.w < 60 ? { width: 2.6 + Math.random(), rot: rect.rot } : { rot: rect.rot });
        const it = item({ b, rect });
        const wash = it.wash;
        it.progress = 0; it.wash = 0;
        it.anim = { kind: 'wait' };
        items.push(it);
        paintBlock(it, k).then(() => { it.anim = { kind: 'create', t0: clock, dur: rand(1.3, 2.1), wash }; });
      },
      grow(it) { it.anim = { kind: 'resize', t0: clock, dur: rand(1.4, 2.2), from: { ...it.rect }, to: fit(scaleRect(it.rect, rand(1.3, 1.9))) }; },
      shrink(it) { it.anim = { kind: 'resize', t0: clock, dur: rand(1.2, 1.8), from: { ...it.rect }, to: fit(scaleRect(it.rect, rand(0.4, 0.7))) }; },
      collapse(it) { it.anim = { kind: 'collapse', t0: clock, dur: rand(0.9, 1.3), from: { ...it.rect }, tip: rand(-6, 6) }; },
      crumble(it) { it.anim = { kind: 'crumble', t0: clock, dur: 0.45, from: { ...it.rect } }; },
      fade(it) { it.anim = { kind: 'fade', t0: clock, dur: rand(1.2, 2), w0: it.wash }; },
    };

    function chooseEvent() {
      const n = items.length, idle = items.filter((it) => !it.anim && it.img);
      const weights = {
        create: n < 18 ? 6 : n > 50 ? 0.4 : 2.2,
        grow: 1.4, shrink: 0.8,
        collapse: n < 12 ? 0.2 : 1.1, crumble: n < 12 ? 0.3 : 1.5, fade: n < 12 ? 0.2 : n > 45 ? 2.5 : 0.9,
      };
      let total = 0;
      for (const key in weights) total += weights[key];
      let x = Math.random() * total, kind = 'create';
      for (const key in weights) { x -= weights[key]; if (x <= 0) { kind = key; break; } }
      if (kind === 'create') return EVENTS.create();
      const pool = idle.filter((it) => kind === 'grow' ? it.rect.w < 320 : kind === 'shrink' ? it.rect.w > 70 : true);
      if (pool.length) EVENTS[kind](pick(pool));
    }

    // a crumbling block becomes its painted outline cut into pieces, and a few flakes of its wash,
    // that fall and settle. Each corner belongs to one edge's band, so no piece is cut twice
    function crumble(it) {
      const im = it.img, { rect } = it, { w, h, p } = im, fx = rect.w / w, fy = rect.h / h;
      const at = place(it.b, rect), cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
      const bands = [[-p, -p, w, 2 * p, 'x'], [w - p, -p, 2 * p, h, 'y'], [p, h - p, w, 2 * p, 'x'], [-p, p, 2 * p, h, 'y']];
      const thick = it.b.width * it.scale;
      const piece = (img, sx, sy, sw, sh, alpha, kick, len, th, axis) => {
        const [x, y] = at((sx + sw / 2) * fx, (sy + sh / 2) * fy);
        bits.push({ img, kx: img.width / (w + 2 * p), ky: img.height / (h + 2 * p), sx: sx + p, sy: sy + p, sw, sh, fx, fy, alpha, x, y, rot: rect.rot, len, thick: th, axis,
          vx: (x - cx) * rand(0.3, 0.9) * kick + rand(-25, 25), vy: (y - cy) * rand(0.3, 1) * kick - rand(30, 120) * kick, vr: rand(-220, 220) * kick });
      };
      for (const [bx, by, bw, bh, axis] of bands) {
        const L = axis === 'x' ? bw : bh, n = Math.max(2, Math.round(L * Math.max(fx, fy) / rand(35, 70)));
        let u0 = 0;
        for (let j = 0; j < n; j++) {
          const u1 = j === n - 1 ? 1 : u0 + (1 - u0) * rand(0.3, 0.7);
          if (axis === 'x') piece(im.line, bx + u0 * L, by, (u1 - u0) * L, bh, it.opacity, 1, (u1 - u0) * L * fx, thick * fy, 0);
          else piece(im.line, bx, by + u0 * L, bw, (u1 - u0) * L, it.opacity, 1, (u1 - u0) * L * fy, thick * fx, 90);
          u0 = u1;
        }
      }
      if (im.wash && it.wash > 0.1) {
        for (let j = 0; j < 3 + Math.floor(Math.random() * 4); j++) {
          const sw = rand(10, Math.max(12, Math.min(40, w / 2))), sh = rand(10, Math.max(12, Math.min(40, h / 2)));
          piece(im.wash, rand(0, Math.max(0, w - sw)), rand(0, Math.max(0, h - sh)), sw, sh, it.opacity * it.b.washA * it.wash, 0.4, sw * fx, sh * fy * 0.5, 0);
        }
      }
      remove(it);
    }

    function step(dt) {
      const fall = dt * FALL;
      dt *= SPEED;
      clock += dt;
      let busy = items.filter((it) => it.anim).length;
      if (!failing) {
        while (clock > next && busy < BUSY) { chooseEvent(); busy++; next += rand(0.1, 0.3); }
      } else {
        // after a click nothing new is made: the blocks fail one after another, paced so the last goes
        // at the deadline, and anything still standing then goes at once
        const idle = items.filter((it) => !it.anim && it.img);
        const fail = (it) => (Math.random() < 0.7 ? EVENTS.crumble(it) : EVENTS.collapse(it));
        if (shown >= failing.deadline) idle.forEach(fail);
        else while (clock > next && idle.length) {
          fail(idle.splice(Math.floor(Math.random() * idle.length), 1)[0]);
          next += (failing.deadline - shown) * SPEED / Math.max(1, idle.length + 1) * rand(0.4, 1.4);
        }
      }
      if (clock > next) next = clock;
      for (const it of items.slice()) {
        const a = it.anim;
        if (!a || a.kind === 'wait') continue;
        const u = clamp((clock - a.t0) / a.dur), e = ease(u);
        if (a.kind === 'create') { it.progress = Math.min(1, u * 1.2); it.wash = a.wash * ramp(u, 0.65, 1); }
        else if (a.kind === 'resize') it.rect = lerpRect(a.from, a.to, e);
        else if (a.kind === 'collapse') {
          // it gives way at the bottom and folds down, accelerating, then breaks
          const f = u * u, r0 = a.from, h = r0.h * (1 - 0.92 * f);
          it.rect = { x: r0.x - r0.w * 0.06 * f, y: r0.y + r0.h - h, w: r0.w * (1 + 0.12 * f), h, rot: r0.rot + a.tip * f };
        } else if (a.kind === 'fade') { it.wash = a.w0 * (1 - ramp(u, 0, 0.6)); it.opacity = 1 - ramp(u, 0.3, 1); }
        // a shiver before it breaks
        else if (a.kind === 'crumble') it.rect = { ...a.from, x: a.from.x + rand(-1.6, 1.6) * u, y: a.from.y + rand(-1.2, 1.2) * u, rot: a.from.rot + rand(-0.6, 0.6) * u };
        if (u >= 1) {
          it.anim = null;
          if (a.kind === 'crumble' || a.kind === 'collapse') crumble(it);
          else if (a.kind === 'fade') remove(it);
          else if (a.kind === 'resize') paintBlock(it, k);
        }
      }
      for (const bit of bits.slice()) {
        bit.vy += GRAVITY * fall; bit.x += bit.vx * fall; bit.y += bit.vy * fall; bit.rot += bit.vr * fall;
        if (bit.x < -60 || bit.x > W + 60) { bits.splice(bits.indexOf(bit), 1); continue; }
        const [ex, ey] = extent(bit), g = ground(bit.x - ex, bit.x + ex);
        if (bit.y + ey >= g && bit.vy > 0) {
          bit.y = g - ey;
          if (bit.vy > 160) { bit.vy = -bit.vy * 0.28; bit.vx *= 0.5; bit.vr *= 0.4; }
          else { settle(bit); bits.splice(bits.indexOf(bit), 1); }
        }
      }
      shown += dt / SPEED;
    }

    function draw() {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(rubble, 0, 0, W, H);
      for (const it of items) drawItem(ctx, it);
      for (const bit of bits) drawBit(ctx, bit);
      // the lines to the small block's large block go first: once things move, the zoom no longer holds
      const lo = 0.55 * (1 - ramp(shown, 0.3, 1.2));
      if (linesImg && lo > 0.005) { ctx.globalAlpha = lo; ctx.drawImage(linesImg, 0, 0, W, H); ctx.globalAlpha = 1; }
    }

    // a click and everything fails; once only shards are left, another click starts over
    svg.closest('section').addEventListener('click', () => {
      if (!failing) { failing = { deadline: shown + rand(3, 3.6) }; next = clock; }
      else if (!items.length && !bits.length) reset();
    });

    reset();
    let last = 0;
    whileShown(svg, (t) => {
      const dt = Math.min(0.05, Math.max(0, t - last));
      last = t;
      step(dt);
      draw();
    }, () => { last = 0; reset(); });
  }

  function init() {
    ensureFilters();
    document.querySelectorAll('svg[data-blocks]').forEach((svg) => (svg.dataset.blocks === 'life' ? paintLife(svg) : paintNest(svg, svg.dataset.blocks)));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
