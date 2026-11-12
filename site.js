// Films play while they are on screen, and any figure opens large on a click. No library.
(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const films = document.querySelectorAll('figure video');

  films.forEach((v) => {
    // a film whose opening leads into a loop comes back to the start of the loop, not to the opening
    const from = +v.dataset.loopFrom;
    if (from) v.addEventListener('ended', () => { v.currentTime = from; v.play(); });
    if (still) v.controls = true;       // nothing moves unasked: a still, and the browser's own play button
  });

  if (!still && 'IntersectionObserver' in window) {
    const seen = new IntersectionObserver((list) => {
      for (const e of list) {
        if (e.isIntersecting) e.target.play().catch(() => {}); else e.target.pause();
      }
    }, { threshold: 0.25 });
    films.forEach((v) => seen.observe(v));
  }

  const lb = document.getElementById('lb');
  if (!lb) return;
  const cap = lb.querySelector('p'), close = lb.querySelector('button');
  let big = null, back = null;
  const shut = () => {
    if (lb.hidden) return;
    lb.hidden = true;
    if (big) { big.remove(); big = null; }
    if (back) { back.focus(); back = null; }
  };
  const open = (el) => {
    if (el.tagName === 'VIDEO') {
      big = document.createElement('video');
      big.muted = true; big.playsInline = true; big.autoplay = !still; big.controls = still;
      big.loop = el.loop; big.poster = el.poster; big.src = el.currentSrc;
      const from = +el.dataset.loopFrom;
      if (from) big.addEventListener('ended', () => { big.currentTime = from; big.play(); });
      big.addEventListener('loadedmetadata', () => { big.currentTime = el.currentTime; }, { once: true });
      big.addEventListener('click', (e) => { if (big.controls) e.stopPropagation(); });
    } else {
      big = document.createElement('img');
      big.src = el.currentSrc || el.src; big.alt = el.alt;
    }
    cap.textContent = el.closest('figure')?.querySelector('figcaption')?.textContent.trim() || '';
    lb.insertBefore(big, cap);
    back = el; lb.hidden = false; close.focus();
  };
  document.querySelectorAll('figure img, figure video').forEach((el) => {
    el.tabIndex = 0;
    el.addEventListener('click', () => { if (!el.controls) open(el); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(el); });
  });
  lb.addEventListener('click', shut);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') shut(); });
})();
