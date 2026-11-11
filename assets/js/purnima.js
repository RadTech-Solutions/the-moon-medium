// Purnima page: frequency chips, soft image reveal, photo lightbox
(function () {
  'use strict';

  // Her frequency chips: a short soft tone on tap
  var current = null;
  function stopCurrent(fade) {
    if (!current) return;
    current.h.stop(fade); clearTimeout(current.t); current.b.classList.remove('on');
    current.b.setAttribute('aria-pressed', 'false');
    current = null;
  }
  document.querySelectorAll('.pm-hz button[data-hz]').forEach(function (btn) {
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', function () {
      var A = window.MoonAudio;
      if (!A) return;
      var hz = +btn.dataset.hz;
      var same = current && current.b === btn;
      stopCurrent(0.3);
      if (same) return;
      // unlock inside the gesture, but build the tone now so two quick taps never overlap
      A.unlock().catch(function () {});
      var h;
      try { h = A.tone(hz, { gain: 0.15 }); } catch (e) { return; }
      var cur = { h: h, b: btn };
      btn.classList.add('on');
      btn.setAttribute('aria-pressed', 'true');
      cur.t = setTimeout(function () {
        if (current === cur) stopCurrent(0.8);
      }, 2000);
      current = cur;
    });
  });

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var zooms = [].slice.call(document.querySelectorAll('.pm-zoom[data-lb]'));

  // Soft reveal: only images still below the fold start hidden, so nothing flashes
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.remove('pm-rv'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    var vh = window.innerHeight;
    zooms.forEach(function (z) {
      if (z.getBoundingClientRect().top > vh) { z.classList.add('pm-rv'); io.observe(z); }
    });
  }

  // Lightbox
  var dlg = document.getElementById('lb');
  if (!dlg || typeof dlg.showModal !== 'function') {
    // No modal dialog support: each photo opens the full image in a new tab instead
    zooms.forEach(function (z) {
      z.removeAttribute('aria-haspopup');
      z.style.cursor = 'pointer';
      var im = z.querySelector('img');
      if (im) z.setAttribute('aria-label', im.alt + ', opens full image in a new tab');
      z.addEventListener('click', function () {
        if (im) window.open(im.getAttribute('src'), '_blank', 'noopener');
      });
    });
    return;
  }
  var big = document.getElementById('lb-img'), cap = document.getElementById('lb-cap'), num = document.getElementById('lb-n');
  var set = [], idx = 0, opener = null;

  function show(i) {
    idx = (i + set.length) % set.length;
    var z = set[idx], im = z.querySelector('img');
    big.classList.add('ld');
    big.onload = function () { big.classList.remove('ld'); };
    big.width = +im.getAttribute('width') || 900;
    big.height = +im.getAttribute('height') || 1125;
    big.src = im.getAttribute('src');
    big.alt = im.alt;
    cap.textContent = z.dataset.cap || im.alt;
    num.textContent = (idx + 1) + ' / ' + set.length;
    // warm the neighbours
    [1, -1].forEach(function (d) {
      var n = set[(idx + d + set.length) % set.length];
      if (n) { var p = new Image(); p.src = n.querySelector('img').getAttribute('src'); }
    });
  }
  function open(z) {
    opener = z;
    set = zooms.filter(function (o) { return o.dataset.lb === z.dataset.lb; });
    show(set.indexOf(z));
    dlg.showModal();
    document.documentElement.style.overflow = 'hidden';
    document.getElementById('lb-x').focus();
  }
  zooms.forEach(function (z) {
    z.addEventListener('click', function () { open(z); });
  });

  document.getElementById('lb-prev').addEventListener('click', function () { show(idx - 1); });
  document.getElementById('lb-next').addEventListener('click', function () { show(idx + 1); });
  document.getElementById('lb-x').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('close', function () {
    document.documentElement.style.overflow = '';
    big.removeAttribute('src');
    if (opener) opener.focus();
  });
  // clicking the dark space around the photo closes it
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg || e.target.classList.contains('pm-lb-fig')) dlg.close();
  });
  dlg.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
  });

  // swipe left and right
  var sx = null, sy = 0;
  dlg.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { sx = null; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  dlg.addEventListener('touchend', function (e) {
    if (sx === null) return;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) show(idx + (dx < 0 ? 1 : -1));
  }, { passive: true });
})();
