// The first screen's four shells of galaxies, drawn live so each can be taken hold of and turned. The points and the
// camera are the sphere film's once it has drawn back (tools/prep_shells.mjs): every shell turns on the sky's pole as
// the film's did; drag one and it turns with the pointer, let go and it carries on turning, coming back to that pace.
// Without WebGL, or before the points arrive, the poster stands in.
(() => {
  const fig = document.querySelector('.shells');
  if (!fig) return;
  const poster = fig.querySelector('img'), canvas = fig.querySelector('canvas');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // the film's frame, in its own units: 1280 wide, the camera 3.3 sky radii out with a focal length of 900, the
  // centre at (640, 372); each galaxy a dot 1.1 wide
  const W = 1280, D = 3.3, F = 900, CX = 640, CY = 372, DOT = 1.1;
  // the ink, the film's navy, one per shell from the innermost out; PALE is how strongly each is laid down (thinner
  // than the film's 1, so more paper shows through), NEAR how strongly the near half of each shell shows
  const INKS = ['#16304f', '#16304f', '#16304f', '#16304f'], PALE = [0.7, 0.7, 0.7, 0.7], NEAR = 0.3;
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const SPIN = 10 * Math.PI / 180;   // the film's turn, 10 degrees a second

  const VS = `
  attribute vec2 a;                       // ra, dec as fractions of 65535
  uniform mat3 M; uniform vec2 res; uniform float R, D, F, s, size, alpha, near;
  varying float va;
  void main(){
    float ra = a.x / 65535. * 6.2831853, dec = (a.y / 65535. - .5) * 3.1415927, cd = cos(dec);
    vec3 v = M * (R * vec3(cd * cos(ra), cd * sin(ra), sin(dec)));
    float z = v.z + D, k = F / z;
    // the near half of the shell, in front of its horizon as seen from the camera
    va = alpha * (v.z * D < -R * R ? near : 1.);
    vec2 p = vec2(${CX}. + k * v.x, ${CY}. - k * v.y) * s;
    gl_Position = vec4(p.x / res.x * 2. - 1., 1. - p.y / res.y * 2., 0., 1.);
    gl_PointSize = size;
  }`;
  const FS = `
  precision mediump float; uniform vec3 ink; varying float va;
  void main(){ vec2 p = gl_PointCoord * 2. - 1.; float a = va * clamp(1.6 * (1. - dot(p, p)), 0., 1.); gl_FragColor = vec4(ink * a, a); }`;
  const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  const U = {};
  ['M', 'res', 'R', 'D', 'F', 's', 'size', 'alpha', 'near', 'ink'].forEach((k) => (U[k] = gl.getUniformLocation(prog, k)));
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform1f(U.D, D); gl.uniform1f(U.F, F); gl.uniform1f(U.near, NEAR);

  // 3×3 matrices, row-major arrays; the view: x to the right, y up, z away from the camera
  const mul = (A, B) => { const C = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j]; return C; };
  const rot = (x, y, z, a) => {   // about the unit axis (x, y, z) by a
    const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  };
  const turn = (M, w, dt) => { const n = Math.hypot(w[0], w[1], w[2]); return n * dt > 1e-7 ? mul(rot(w[0] / n, w[1] / n, w[2] / n, n * dt), M) : M; };
  // the film's camera at the start of its loop, looking at RA0 from 16 degrees above the equator: rows -e, n, f
  const RA0 = 120 * Math.PI / 180, DEC0 = 16 * Math.PI / 180;
  const M0 = (() => {
    const a = RA0, d = DEC0, f = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)], e = [-Math.sin(a), Math.cos(a), 0], n = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
    return [-e[0], -e[1], -e[2], ...n, ...f];
  })();

  let shells = [], buf = null, size = [0, 0], scale = 1, held = null, last = 0, onScreen = true;

  fetch('assets/spherex/shells.bin').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((ab) => {
    const h = new DataView(ab), n = [0, 1, 2, 3].map((k) => h.getUint32(4 * k, true));
    let first = 0;
    shells = n.map((count, k) => {
      const s = { first, count, R: h.getFloat32(16 + 4 * k, true), ink: h.getFloat32(32 + 4 * k, true), M: M0.slice(), w: [0, 0, 0], spin: still ? 0 : 1 };
      first += count; return s;
    });
    buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint16Array(ab, 48), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.UNSIGNED_SHORT, false, 0, 0);
    // the poster is this first frame, so the change is not seen
    canvas.hidden = false; poster.hidden = true; fit();
    requestAnimationFrame(frame);
  }).catch(() => {});

  function fit() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    size = [Math.round(r.width * dpr), Math.round(r.height * dpr)]; scale = size[0] / W;
    canvas.width = size[0]; canvas.height = size[1];
  }
  addEventListener('resize', () => { if (buf) { fit(); draw(); } });

  function draw() {
    gl.viewport(0, 0, size[0], size[1]); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.res, size[0], size[1]); gl.uniform1f(U.s, scale);
    // a dot under a pixel wide is drawn a pixel wide, and as much fainter as it is smaller
    const px = DOT * scale, dot = Math.max(1, px), thin = (px / dot) ** 2;
    gl.uniform1f(U.size, dot);
    shells.forEach((sh, k) => {
      gl.uniform3fv(U.ink, rgb(INKS[k]));
      const M = sh.M;   // row-major to GLSL's column-major
      gl.uniformMatrix3fv(U.M, false, [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]]);
      gl.uniform1f(U.R, sh.R);
      gl.uniform1f(U.alpha, Math.min(1, sh.ink / sh.count * thin * PALE[k]));
      gl.drawArrays(gl.POINTS, sh.first, sh.count);
    });
  }

  function frame(t) {
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0); last = t;
    if (onScreen && !document.hidden) {
      for (const sh of shells) {
        if (sh === held?.sh) continue;
        // the throw dies away, and the shell's own turn comes back
        sh.M = turn(sh.M, sh.w, dt);
        const k = Math.exp(-dt / 1.2); sh.w = sh.w.map((x) => x * k);
        if (!still) sh.spin = Math.min(1, sh.spin + dt / 1.5);
        // the sky turns on its pole: in the shell's own frame, a turn about z
        const a = -SPIN * sh.spin * sh.spin * dt;
        sh.M = mul(sh.M, [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1]);
      }
      draw();
    }
    requestAnimationFrame(frame);
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe(canvas);

  // which shell is under the pointer: the smallest whose disc holds it, so each shell is taken by its own ring
  const radius = (R) => F * R / Math.sqrt(D * D - R * R);
  function pick(x, y) {
    const r = canvas.getBoundingClientRect(), u = (x - r.left) / r.width * W, v = (y - r.top) / r.width * W, rho = Math.hypot(u - CX, v - CY);
    return shells.find((sh) => rho <= radius(sh.R)) || (shells.length && rho <= radius(shells[3].R) * 1.04 ? shells[3] : null);
  }
  canvas.addEventListener('pointerdown', (e) => {
    const sh = pick(e.clientX, e.clientY);
    if (!sh) return;
    held = { sh, id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, w: [0, 0, 0] };
    sh.w = [0, 0, 0]; sh.spin = 0;
    canvas.setPointerCapture(e.pointerId); canvas.classList.add('held');
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!held || e.pointerId !== held.id) { if (e.pointerType === 'mouse') canvas.style.cursor = pick(e.clientX, e.clientY) ? '' : 'auto'; return; }
    // a drag across the shell's radius on screen turns it by a radian, the surface facing us following the pointer
    const r = canvas.getBoundingClientRect(), px = radius(held.sh.R) * r.width / W, dx = (e.clientX - held.x) / px, dy = (e.clientY - held.y) / px;
    const w = [-dy, -dx, 0], dt = Math.max(1e-3, (e.timeStamp - held.t) / 1000);
    held.sh.M = turn(held.sh.M, w, 1);
    // the pointer's pace, smoothed over the last tenth of a second or so, is the throw
    const k = Math.min(1, dt / 0.08); held.w = held.w.map((x, i) => x + (w[i] / dt - x) * k);
    held.x = e.clientX; held.y = e.clientY; held.t = e.timeStamp;
  });
  const letGo = (e) => {
    if (!held || e.pointerId !== held.id) return;
    // a pointer that stopped before it let go throws nothing
    const quiet = e.timeStamp - held.t > 80, cap = 6;
    const n = Math.hypot(...held.w), w = quiet || still ? [0, 0, 0] : held.w.map((x) => x * Math.min(1, cap / (n || 1)));
    held.sh.w = w; held = null; canvas.classList.remove('held');
  };
  canvas.addEventListener('pointerup', letGo);
  canvas.addEventListener('pointercancel', letGo);
  // a touch that lands on a shell turns it; elsewhere the page scrolls as usual
  canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 1 && pick(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault(); }, { passive: false });
})();
