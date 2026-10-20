// The overview: the lines between the boxes of the tree. Each line is a <path> in the section's svg.links
// naming its two ends: data-from and data-to hold the data-node names of nodes, each optionally with
// the side to attach to ("unions:t"; l, r, t or b). Several names in data-from are joined by a bracket
// first. Every line runs only horizontally and vertically, with square corners: data-shape="elbow" is
// the bare line, "arrow" adds an arrowhead at the target, and no shape a dot at each end. This script only
// works out the geometry, from where the nodes sit, so moving a node in Lectern moves its lines. If a
// line is a fragment, its two ends stay lit while it shows and every other node dims.
(function () {
  const GAP = 9, TICK = 9, R = 2.8;
  const f = (v) => Math.round(v * 10) / 10;
  const parse = (s) => (s || '').trim().split(/\s+/).filter(Boolean)
    .map((t) => { const [n, side] = t.split(':'); return { n, side }; });

  // the extent of a node's text in slide units, and the middle of its title line
  function box(sec, el) {
    const s = sec.getBoundingClientRect();
    const k = s.width / sec.offsetWidth || 1;
    const title = el.querySelector('.t') || el;
    const range = document.createRange();
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (let t; (t = walk.nextNode());) {
      if (!t.textContent.trim() || t.parentElement.closest('.katex-mathml')) continue;
      range.selectNodeContents(t);
      const inTitle = title.contains(t);
      for (const q of range.getClientRects()) {
        if (!q.width) continue;
        x0 = Math.min(x0, q.left); x1 = Math.max(x1, q.right);
        y0 = Math.min(y0, q.top); y1 = Math.max(y1, q.bottom);
        if (inTitle) { t0 = Math.min(t0, q.top); t1 = Math.max(t1, q.bottom); }
      }
    }
    if (x0 === Infinity) return null;
    const X = (v) => (v - s.left) / k, Y = (v) => (v - s.top) / k;
    return { x0: X(x0), x1: X(x1), y0: Y(y0), y1: Y(y1), ym: Y(t0 < Infinity ? (t0 + t1) / 2 : (y0 + y1) / 2) };
  }

  function anchor(b, side) {
    if (side === 'l') return { x: b.x0 - GAP, y: b.ym, dx: -1, dy: 0 };
    if (side === 'r') return { x: b.x1 + GAP, y: b.ym, dx: 1, dy: 0 };
    if (side === 't') return { x: (b.x0 + b.x1) / 2, y: b.y0 - GAP + 3, dx: 0, dy: -1 };
    return { x: (b.x0 + b.x1) / 2, y: b.y1 + GAP - 3, dx: 0, dy: 1 };
  }

  function sideTowards(a, b) {
    if (b.x0 > a.x1 + 20) return 'r';
    if (a.x0 > b.x1 + 20) return 'l';
    return (b.y0 + b.y1) < (a.y0 + a.y1) ? 't' : 'b';
  }
  const opposite = { l: 'r', r: 'l', t: 'b', b: 't' };

  const ring = (p) => `M ${f(p.x - R)},${f(p.y)} a ${R},${R} 0 1,0 ${2 * R},0 a ${R},${R} 0 1,0 ${-2 * R},0 `;

  // an end nearly in line with the start moves into line, so the line needs no corner
  function snap(p, q) {
    if (p.dy && q.dy && Math.abs(q.x - p.x) < 30) return { ...q, x: p.x };
    if (p.dx && q.dx && Math.abs(q.y - p.y) < 4) return { ...q, y: p.y };
    return q;
  }

  // between two vertical ends the horizontal run sits just above the target, so every line into one
  // node shares it; between two horizontal ends the vertical run sits halfway; a vertical end and a
  // horizontal one meet at a single corner
  function route(p, q) {
    const m = `M ${f(p.x)},${f(p.y)} `;
    if (p.dy && q.dy) {
      if (q.x === p.x) return m + `V ${f(q.y)} `;
      const ym = q.y - p.y > 44 ? q.y - 22 : (p.y + q.y) / 2;
      return m + `V ${f(ym)} H ${f(q.x)} V ${f(q.y)} `;
    }
    if (p.dx && q.dx) {
      if (q.y === p.y) return m + `H ${f(q.x)} `;
      const xm = (p.x + q.x) / 2;
      return m + `H ${f(xm)} V ${f(q.y)} H ${f(q.x)} `;
    }
    return p.dx ? m + `H ${f(q.x)} V ${f(q.y)} ` : m + `V ${f(q.y)} H ${f(q.x)} `;
  }

  // an open arrowhead at q, pointing into the node
  function head(q) {
    const L = 8, W = 4.5, bx = q.x + q.dx * L, by = q.y + q.dy * L;
    return `M ${f(bx - q.dy * W)},${f(by + q.dx * W)} L ${f(q.x)},${f(q.y)} L ${f(bx + q.dy * W)},${f(by - q.dx * W)} `;
  }

  function pathFor(from, to, get, shape) {
    const src = parse(from).map((a) => ({ ...a, b: get(a.n) })).filter((a) => a.b);
    const dst = parse(to).map((a) => ({ ...a, b: get(a.n) })).filter((a) => a.b);
    if (!src.length || !dst.length) return '';
    let d = '';
    if (src.length === 1) {
      const a = src[0];
      if (shape === 'vline') {
        // a straight vertical arrow from under the source's title to each target's top, at the source's x
        const p = anchor(a.b, 'b');
        for (const t of dst) {
          const q = { ...anchor(t.b, 't'), x: p.x };
          d += `M ${f(p.x)},${f(p.y)} V ${f(q.y)} ` + head(q);
        }
        return d.trim();
      }
      if (shape === 'loop') {
        // out of the source's right side at its middle, down past it, and back left into each target
        const p = { x: a.b.x1 + GAP, y: (a.b.y0 + a.b.y1) / 2, dx: 1, dy: 0 };
        const X = p.x + 22;
        for (const t of dst) {
          const q = anchor(t.b, t.side || 'r');
          d += `M ${f(p.x)},${f(p.y)} H ${f(X)} V ${f(q.y)} H ${f(q.x)} ` + head(q);
        }
        return d.trim();
      }
      for (const t of dst) {
        const sa = a.side || sideTowards(a.b, t.b), sb = t.side || opposite[sideTowards(a.b, t.b)];
        const p = anchor(a.b, sa), q = snap(p, anchor(t.b, sb));
        d += shape === 'elbow' ? route(p, q) : (shape === 'arrow' || shape === 'dash') ? route(p, q) + head(q) : ring(p) + route(p, q) + ring(q);
      }
      return d.trim();
    }
    // several sources: a bracket along their shared side, then one line from its middle to each target
    const side = src[0].side || (dst[0].b.x0 > Math.max(...src.map((s) => s.b.x1)) ? 'r' : 'l');
    const ps = src.map((s) => anchor(s.b, side));
    const X = side === 'r' ? Math.max(...ps.map((p) => p.x)) + TICK : Math.min(...ps.map((p) => p.x)) - TICK;
    for (const p of ps) d += `M ${f(p.x)},${f(p.y)} H ${f(X)} `;
    const ya = Math.min(...ps.map((p) => p.y)), yb = Math.max(...ps.map((p) => p.y));
    d += `M ${f(X)},${f(ya)} V ${f(yb)} `;
    const J = { x: X, y: (ya + yb) / 2, dx: side === 'r' ? 1 : -1, dy: 0 };
    const jb = { x0: X, x1: X, y0: J.y, y1: J.y, ym: J.y };
    for (const t of dst) {
      const q = snap(J, anchor(t.b, t.side || opposite[sideTowards(jb, t.b)]));
      d += route(J, q) + ring(q);
    }
    return d.trim();
  }

  function layout(sec) {
    const nodes = {}, boxes = {};
    sec.querySelectorAll('[data-node]').forEach((el) => { nodes[el.dataset.node] = el; });
    const get = (n) => (n in boxes ? boxes[n] : (boxes[n] = nodes[n] ? box(sec, nodes[n]) : null));
    sec.querySelectorAll('svg.links path[data-from]').forEach((p) => {
      const d = pathFor(p.dataset.from, p.dataset.to, get, p.dataset.shape);
      if (d && p.getAttribute('d') !== d) p.setAttribute('d', d);
    });
  }

  function focus(sec) {
    const on = new Set();
    if (!editing()) {
      sec.querySelectorAll('svg.links path.current-fragment').forEach((p) => {
        for (const t of parse(p.dataset.from).concat(parse(p.dataset.to))) on.add(t.n);
      });
    }
    sec.querySelectorAll('[data-node]').forEach((el) => el.classList.toggle('lit', on.has(el.dataset.node)));
    sec.classList.toggle('focus', on.size > 0);
  }

  const editing = () => document.documentElement.classList.contains('lec-editing');
  let poll = 0;

  function update() {
    const cur = Reveal.getCurrentSlide();
    if (cur && cur.classList.contains('net')) { layout(cur); focus(cur); }
    // in the editor, follow the nodes as they are dragged
    if (editing() && !poll) poll = setInterval(update, 300);
    if (!editing() && poll) { clearInterval(poll); poll = 0; }
  }

  // print: one copy of the slide per step, each laid out and lit for its own step
  function all() { document.querySelectorAll('section.net').forEach((s) => { layout(s); focus(s); }); }

  ['ready', 'slidechanged', 'fragmentshown', 'fragmenthidden'].forEach((e) => Reveal.on(e, update));
  Reveal.on('pdf-ready', all);
  if (document.fonts) document.fonts.ready.then(update);
  new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  if (Reveal.isReady && Reveal.isReady()) update();
})();
