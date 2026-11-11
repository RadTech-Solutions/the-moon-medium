/* The bowl table: five singing bowls on a rug, struck or sung with a mallet that follows the pointer. */
(function () {
  'use strict';

  const stage = document.getElementById('bowl-table');
  const cv = document.getElementById('bowls');
  const ctx = cv && cv.getContext && cv.getContext('2d');
  if (!stage || !ctx) return;
  const statusEl = document.getElementById('bowl-status');
  const keyBtns = [].slice.call(document.querySelectorAll('[data-bowl]'));
  const setBtns = [].slice.call(document.querySelectorAll('[data-set]'));
  const droneBtn = document.getElementById('drone');

  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ease = (dt, tc) => 1 - Math.exp(-dt / tc);
  const clock = () => performance.now();
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const hz = n => 440 * Math.pow(2, (NAMES.indexOf(n.slice(0, -1)) + 12 * (+n.slice(-1) + 1) - 69) / 12);
  const SETS = { crystal: ['C4', 'D4', 'E4', 'G4', 'A4'], himalayan: ['G3', 'A3', 'C4', 'D4', 'E4'] };
  // Desktop: the design's zigzag on a 1240 x 760 board. Narrow: two rows on 400 x 460 so bowls stay tappable.
  const BOARDS = {
    wide: { w: 1240, h: 760, rug: [620, 420, 560, 260], rest: [866, 199], m: 1, lab: 34,
      pos: [[300, 470, 120], [500, 340, 100], [680, 500, 130], [860, 360, 92], [1000, 520, 104]] },
    tall: { w: 400, h: 460, rug: [200, 236, 194, 206], rest: null, m: 0.74, lab: 26,
      pos: [[72, 296, 60], [128, 128, 72], [200, 296, 64], [274, 128, 68], [328, 296, 58]] }
  };

  const rm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let still = !!(rm && rm.matches);
  if (rm && rm.addEventListener) rm.addEventListener('change', e => { still = e.matches; kick(); });

  let set = 'crystal', drone = false, ready = false;
  let W = 1, H = 1, dpr = 1, S = 1, board = BOARDS.wide, ox = 0, oy = 0;
  let bg = null, grain = null, raf = 0, tick = 0, last = 0, now = clock(), onScreen = true;

  // Seeded hammer marks so each brass bowl keeps its own face.
  function marks(i) {
    let seed = (i + 1) * 7919;
    const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    const out = [];
    for (let k = 0; k < 46; k++) out.push({ u: rnd() * 1.84 - 0.92, v: 0.08 + rnd() * 0.84, s: 0.5 + rnd() * 0.7, l: rnd() < 0.5 });
    return out;
  }
  const bowls = [0, 1, 2, 3, 4].map(i => ({
    i, x: 0, y: 0, r: 1, rim: 1, h: 1, note: '', f: 0,
    ring: 0, flash: 0, wob: 0, sing: 0, hov: 0, key: false, voice: null, sent: 0,
    halos: [], trail: [], orb: i * 1.3, marks: marks(i), g: null
  }));
  let order = bowls.slice();

  // P is the hovering mouse; each pressed pointer gets its own record in downs, so two fingers play two bowls.
  const P = { x: -99, y: -99, vx: 0, vy: 0, t: 0, over: false, hb: null, lead: null };
  const downs = new Map();
  const M = { x: 0, y: 0, vx: 0, vy: 0, a: 0.49, al: 0, tap: 0, tx: 0, ty: 0, show: 0 };

  /* Sets and layout */

  function applySet() {
    SETS[set].forEach((n, i) => { bowls[i].note = n; bowls[i].f = hz(n); });
    keyBtns.forEach(btn => { const n = btn.querySelector('.n'); if (n) n.textContent = SETS[set][+btn.dataset.bowl]; });
    setBtns.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.set === set)));
  }

  function rest() { return board.rest ? [ox + board.rest[0] * S, oy + board.rest[1] * S] : null; }

  function measure() {
    const r = cv.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    board = W / H >= 1.15 ? BOARDS.wide : BOARDS.tall;
    S = Math.min(W / board.w, H / board.h);
    ox = (W - board.w * S) / 2; oy = (H - board.h * S) / 2;
    bowls.forEach((b, i) => {
      const p = board.pos[i];
      b.x = ox + p[0] * S; b.y = oy + p[1] * S; b.r = p[2] * S; b.rim = b.r * 0.32; b.h = b.r * 0.9;
    });
    order = bowls.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const r0 = rest();
    if (r0 && !P.over) { M.x = r0[0]; M.y = r0[1]; M.al = 1; }
    paint();
    draw();
  }

  // Gradients per bowl and the static layer (rug, shadows, note labels), rebuilt on resize or set change.
  function paint() {
    const crystal = set === 'crystal';
    if (!grain) grain = makeGrain();
    bowls.forEach(b => {
      const { x, y, r, rim, h } = b;
      const body = ctx.createLinearGradient(x - r, 0, x + r, 0);
      (crystal ? [[0, '#AFA89B'], [0.2, '#F6F2EA'], [0.42, '#E9E4DA'], [0.78, '#CAC3B6'], [1, '#9D9689']]
        : [[0, '#3A250F'], [0.18, '#A9773D'], [0.3, '#E2B878'], [0.48, '#B8874B'], [0.82, '#6B4720'], [1, '#30200C']])
        .forEach(s => body.addColorStop(s[0], s[1]));
      const depth = ctx.createLinearGradient(0, y, 0, y + h);
      depth.addColorStop(0, 'rgba(0,0,0,0)');
      depth.addColorStop(1, crystal ? 'rgba(16,48,47,.3)' : 'rgba(12,6,0,.42)');
      const inner = ctx.createLinearGradient(0, y - rim, 0, y + rim);
      inner.addColorStop(0, crystal ? '#FBF8F2' : '#A87A43');
      inner.addColorStop(1, crystal ? '#D9D2C5' : '#5A3C1C');
      const water = ctx.createRadialGradient(x - r * 0.2, y + rim * 0.1, 0, x, y + rim * 0.22, r * 0.8);
      water.addColorStop(0, crystal ? 'rgba(255,255,255,.5)' : 'rgba(120,170,160,.32)');
      water.addColorStop(1, crystal ? 'rgba(140,184,178,.32)' : 'rgba(16,48,47,.62)');
      b.g = { body, depth, inner, water };
    });

    bg = bg || document.createElement('canvas');
    bg.width = cv.width; bg.height = cv.height;
    const g = bg.getContext('2d');
    if (!g) { bg = null; return; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(255,255,255,.03)'); vg.addColorStop(1, 'rgba(0,0,0,.28)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);

    const [rx0, ry0, rrx, rry] = board.rug, cx = ox + rx0 * S, cy = oy + ry0 * S, ex = rrx * S, ey = rry * S;
    g.save(); g.translate(cx, cy); g.scale(1, ey / ex);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, ex);
    rg.addColorStop(0, '#133836'); rg.addColorStop(0.8, '#0E2827'); rg.addColorStop(1, '#0B2221');
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, ex, 0, TAU); g.fill();
    g.restore();
    g.lineWidth = 1;
    for (let k = 1; k < 7; k++) {
      g.strokeStyle = 'rgba(243,237,226,.028)';
      g.beginPath(); g.ellipse(cx, cy, ex * k / 7, ey * k / 7, 0, 0, TAU); g.stroke();
    }
    const dk = Math.max(0.6, S);
    g.setLineDash([2 * dk, 8 * dk]); g.strokeStyle = 'rgba(205,165,106,.25)';
    g.beginPath(); g.ellipse(cx, cy, ex - 40 * S, ey - 24 * S, 0, 0, TAU); g.stroke();
    g.setLineDash([]);

    bowls.forEach(b => {
      g.save(); g.translate(b.x, b.y + b.h * 0.95); g.scale(1, (b.rim * 0.85) / (b.r * 1.1));
      const sg = g.createRadialGradient(0, 0, 0, 0, 0, b.r * 1.1);
      sg.addColorStop(0, 'rgba(3,12,14,.8)'); sg.addColorStop(0.55, 'rgba(3,12,14,.45)'); sg.addColorStop(1, 'rgba(3,12,14,0)');
      g.fillStyle = sg; g.beginPath(); g.arc(0, 0, b.r * 1.1, 0, TAU); g.fill();
      g.restore();
    });
    const fs = Math.round(clamp(14 * S / board.m, 11, 14));
    g.font = '400 ' + fs + 'px Jost, system-ui, sans-serif';
    if ('letterSpacing' in g) g.letterSpacing = '3px';
    g.textAlign = 'center'; g.fillStyle = '#B4AC9F';
    bowls.forEach(b => g.fillText(b.note, b.x, b.y + b.h + board.lab * S));
  }

  function makeGrain() {
    const c = document.createElement('canvas'), g = c.getContext && c.getContext('2d');
    if (!g) return null;
    c.width = c.height = 64;
    for (let k = 0; k < 420; k++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.55)' : 'rgba(110,122,118,.35)';
      g.fillRect(Math.random() * 64 | 0, Math.random() * 64 | 0, 1, 1);
    }
    return ctx.createPattern(c, 'repeat');
  }

  /* Drawing */

  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function bodyPath(b) {
    const { x, y, r, h } = b;
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.quadraticCurveTo(x - r * 0.92, y + h, x, y + h);
    ctx.quadraticCurveTo(x + r * 0.92, y + h, x + r, y);
    ctx.closePath();
  }

  function halos(b) {
    b.halos = b.halos.filter(o => now - o.t < 1600);
    ctx.lineWidth = Math.max(1, S);
    b.halos.forEach(o => {
      const p = clamp((now - o.t) / 1600, 0, 1);
      [[0, 'rgba(243,237,226,', 0.5, 1.25], [0.12, 'rgba(205,165,106,', 0.35, 1.6]].forEach(([d, c, a0, fix]) => {
        const q = clamp((p - d) / (1 - d), 0, 1), a = a0 * o.a * (1 - q);
        if (a < 0.01) return;
        const k = still ? fix : 1 + 0.7 * (1 - Math.pow(1 - q, 3));
        ctx.strokeStyle = c + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * k, b.rim * k, 0, 0, TAU); ctx.stroke();
      });
    });
  }

  function water(b, crystal) {
    const { x, y, r, rim } = b, E = Math.max(b.ring, b.sing);
    const tr = still ? 0 : b.sing * 1.6 * S;
    const wx = x + (tr ? Math.sin(now * 0.061) * tr : 0), wy = y + rim * 0.22 + (tr ? Math.cos(now * 0.047) * tr * 0.5 : 0);
    const rx = r * 0.76, ry = rim * 0.6;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(wx, wy, rx, ry, 0, 0, TAU);
    ctx.fillStyle = b.g.water; ctx.fill(); ctx.clip();
    const drift = still ? 0 : Math.sin(now * 0.0007 + b.i) * rx * 0.12;
    ctx.fillStyle = crystal ? 'rgba(255,255,255,.35)' : 'rgba(226,240,230,.16)';
    ctx.beginPath(); ctx.ellipse(wx - rx * 0.3 + drift, wy - ry * 0.35, rx * 0.35, ry * 0.18, -0.08, 0, TAU); ctx.fill();
    if (E > 0.004) {
      const speed = 0.45 + E * 0.5 + b.sing * 0.8, tremble = still ? 0 : b.sing;
      ctx.lineWidth = Math.max(1, 1.3 * S);
      for (let k = 0; k < 4; k++) {
        const p = still ? (k + 1) / 5 : ((now / 1000) * speed + k / 4) % 1;
        const a = E * (still ? 0.45 : 1 - p) * (crystal ? 0.55 : 0.65);
        if (a < 0.01) continue;
        ctx.strokeStyle = (crystal ? 'rgba(16,48,47,' : 'rgba(243,237,226,') + a.toFixed(3) + ')';
        ctx.beginPath();
        if (tremble > 0.05) {
          for (let j = 0; j <= 40; j++) {
            const t = j / 40 * TAU, m = p * (1 + 0.07 * tremble * Math.sin(7 * t + now * 0.02 + k));
            const px = wx + Math.cos(t) * rx * m, py = wy + Math.sin(t) * ry * m;
            if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
        } else {
          ctx.ellipse(wx, wy, rx * p, ry * p, 0, 0, TAU);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // The glowing arc that follows the mallet round the rim (or orbits by itself when held by key or drone).
  function singArc(b) {
    if (b.sing < 0.02) return;
    const byHand = !!holder(b) && b.trail.length > 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const lw = Math.max(1.5, 3 * S);
    if (still && !byHand) {
      ctx.strokeStyle = 'rgba(226,196,143,' + (b.sing * 0.45).toFixed(3) + ')'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.rim, 0, 0, TAU); ctx.stroke();
    } else {
      let pts = b.trail;
      if (!byHand) {
        pts = [];
        for (let k = 0; k < 14; k++) pts.push({ a: b.orb - (13 - k) * 0.09, t: now - (13 - k) * 40 });
      }
      ctx.shadowColor = '#E2C48F'; ctx.shadowBlur = 10 * S;
      for (let k = 1; k < pts.length; k++) {
        const p0 = pts[k - 1], p1 = pts[k], a = b.sing * (1 - (now - p1.t) / 600) * 0.9;
        if (a <= 0.01 || p0.a === p1.a) continue;
        ctx.strokeStyle = 'rgba(226,196,143,' + a.toFixed(3) + ')';
        ctx.lineWidth = lw * (0.5 + 0.5 * k / pts.length);
        ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.rim, 0, p0.a, p1.a, p1.a < p0.a); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawBowl(b) {
    const crystal = set === 'crystal', { x, y, r, rim, h } = b, E = Math.max(b.ring, b.sing);
    halos(b);
    ctx.save();
    if (b.wob > 0.002 && !still) {
      ctx.translate(x, y + h); ctx.rotate(b.wob * 0.03 * Math.sin(now * 0.028)); ctx.translate(-x, -(y + h));
    }
    bodyPath(b);
    ctx.fillStyle = b.g.body; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = b.g.depth; ctx.fillRect(x - r, y, 2 * r, h);
    if (crystal) {
      if (grain) { ctx.globalAlpha = 0.45; ctx.fillStyle = grain; ctx.fillRect(x - r, y, 2 * r, h); ctx.globalAlpha = 1; }
    } else {
      b.marks.forEach(m => {
        ctx.fillStyle = m.l ? 'rgba(255,226,170,.11)' : 'rgba(30,15,0,.17)';
        ctx.beginPath();
        ctx.ellipse(x + m.u * r * Math.sqrt(1 - Math.pow(m.v, 3)), y + m.v * h * 0.95, m.s * r * 0.07, m.s * r * 0.045, m.u * 0.6, 0, TAU);
        ctx.fill();
      });
      ctx.strokeStyle = 'rgba(50,28,8,.5)'; ctx.lineWidth = 1;
      [0.1, 0.15].forEach(k => {
        ctx.beginPath(); ctx.ellipse(x, y + h * k, r * Math.sqrt(1 - k * k * k), rim * 0.9, 0, 0, Math.PI); ctx.stroke();
      });
    }
    ctx.fillStyle = crystal ? 'rgba(255,255,255,.38)' : 'rgba(255,232,190,.22)';
    ctx.beginPath(); ctx.ellipse(x - r * 0.52, y + h * 0.38, r * 0.07, h * 0.3, 0.18, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.beginPath(); ctx.ellipse(x, y, r, rim, 0, 0, TAU);
    ctx.fillStyle = b.g.inner; ctx.fill();
    if (crystal && E > 0.01) { ctx.fillStyle = 'rgba(255,248,232,' + (E * 0.25).toFixed(3) + ')'; ctx.fill(); }
    water(b, crystal);

    ctx.lineWidth = Math.max(1.2, 2 * S);
    ctx.strokeStyle = crystal ? 'rgba(255,255,255,.95)' : '#D9A766';
    ctx.beginPath(); ctx.ellipse(x, y, r, rim, 0, 0, TAU); ctx.stroke();
    ctx.lineWidth = Math.max(1, 1.2 * S);
    ctx.strokeStyle = crystal ? 'rgba(255,255,255,.9)' : 'rgba(255,226,170,.7)';
    ctx.beginPath(); ctx.ellipse(x, y + S, r * 0.995, rim, 0, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    if (b.hov > 0.01) {
      ctx.strokeStyle = 'rgba(226,196,143,' + (b.hov * 0.45).toFixed(3) + ')'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.05, rim * 1.12, 0, 0, TAU); ctx.stroke();
    }
    if (b.flash > 0.02) {
      ctx.save();
      ctx.shadowColor = '#E2C48F'; ctx.shadowBlur = 20 * S * b.flash;
      ctx.strokeStyle = 'rgba(226,196,143,' + b.flash.toFixed(3) + ')'; ctx.lineWidth = (1.5 + 3 * b.flash) * S;
      ctx.beginPath(); ctx.ellipse(x, y, r, rim, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    singArc(b);
    ctx.restore();
  }

  function drawMallet() {
    if (M.al < 0.02) return;
    const k = S * board.m, L = 236 * k;
    ctx.save();
    ctx.globalAlpha = M.al;
    ctx.save();
    ctx.translate(M.x + 16 * k, M.y + 24 * k); ctx.rotate(M.a);
    ctx.fillStyle = 'rgba(2,10,12,.22)'; rr(ctx, -7 * k, -22 * k, 14 * k, L + 22 * k, 7 * k); ctx.fill();
    ctx.restore();
    ctx.translate(M.x, M.y + M.tap * 6 * k); ctx.rotate(M.a);
    const wood = ctx.createLinearGradient(-5 * k, 0, 5 * k, 0);
    wood.addColorStop(0, '#6A4325'); wood.addColorStop(0.35, '#C9935C'); wood.addColorStop(0.65, '#9C6A3B'); wood.addColorStop(1, '#5A381C');
    ctx.fillStyle = wood; rr(ctx, -5 * k, 12 * k, 10 * k, L, 5 * k); ctx.fill();
    ctx.strokeStyle = 'rgba(70,40,16,.35)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-1.5 * k, 30 * k); ctx.lineTo(-1.2 * k, L); ctx.moveTo(2 * k, 60 * k); ctx.lineTo(2.2 * k, L - 20 * k); ctx.stroke();
    ctx.fillStyle = '#1F1515'; rr(ctx, -6.5 * k, 14 * k, 13 * k, 7 * k, 2 * k); ctx.fill();
    const suede = ctx.createRadialGradient(-5 * k, -9 * k, 0, -5 * k, -9 * k, 28 * k);
    suede.addColorStop(0, '#6B4E4B'); suede.addColorStop(0.55, '#3B2A2A'); suede.addColorStop(1, '#1E1414');
    ctx.fillStyle = suede; rr(ctx, -15 * k, -24 * k, 30 * k, 44 * k, 14 * k); ctx.fill();
    ctx.setLineDash([2.5 * k, 3 * k]); ctx.strokeStyle = 'rgba(243,237,226,.2)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-12 * k, -3 * k); ctx.quadraticCurveTo(0, 5 * k, 12 * k, -3 * k); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (bg) ctx.drawImage(bg, 0, 0, W, H);
    order.forEach(drawBowl);
    drawMallet();
  }

  /* Sound and status */

  const pan = b => clamp(b.x / W * 2 - 1, -1, 1) * 0.7;

  function unlock() {
    const a = window.MoonAudio;
    if (!a) return false;
    try { const p = a.unlock(); if (p && p.catch) p.catch(() => {}); ready = true; } catch (e) { ready = false; }
    return ready;
  }

  let shown = statusEl ? statusEl.textContent : '', pending = '', sayT = 0, sayAt = 0;
  function say(text) {
    if (text === pending || (!pending && text === shown)) return;
    pending = text;
    if (!sayT) sayT = setTimeout(flush, Math.max(0, 900 - (Date.now() - sayAt)));
  }
  function flush() {
    sayT = 0;
    if (statusEl && pending && pending !== shown) { statusEl.textContent = shown = pending; sayAt = Date.now(); }
    pending = '';
  }

  const running = () => { const a = window.MoonAudio, c = a && a.context; return !!(c && c.state === 'running'); };
  function sound(b, g) {
    const a = window.MoonAudio;
    if (a && ready) try { a.strike(set, { freq: b.f, gain: g, pan: pan(b) }); } catch (e) { /* no audio here */ }
  }
  // quiet: draw the strike now, sound it later (first touch on iOS waits for pointerup to unlock audio).
  function strike(b, g, quiet) {
    if (!quiet) sound(b, g);
    b.ring = Math.max(b.ring, g); b.flash = 1; b.wob = still ? 0 : Math.max(b.wob, g);
    b.halos.push({ t: clock(), a: clamp(g * 1.3, 0.4, 1) });
    if (b.halos.length > 4) b.halos.shift();
    M.tap = 1;
    say('Now ringing · ' + b.note);
    kick();
  }

  // Keep one rim voice per bowl in step with its smoothed level.
  function voiceSync(b, target) {
    const a = window.MoonAudio;
    if (b.voice && !b.voice.alive) b.voice = null;
    if (!a || !a.rim || !ready) return;
    if (!b.voice && b.sing > 0.015 && target > 0) {
      try { b.voice = a.rim(set, { freq: b.f, pan: pan(b) }); b.sent = -1; } catch (e) { return; }
    }
    if (!b.voice) return;
    if (b.sing < 0.008 && !target) { b.voice.stop(0.5); b.voice = null; return; }
    if (Math.abs(b.sing - b.sent) > 0.004) { b.voice.setLevel(b.sing); b.sent = b.sing; }
  }

  // Angular speed round the rim (rad/s) to loudness: a lap every 2 to 3 s sings at about half, a lap a second fully.
  const rimLevel = w => w <= 0.5 ? 0 : clamp(Math.pow((w - 0.5) / 5.4, 0.7), 0, 1);

  function holder(b) {
    for (const q of downs.values()) if (q.b === b) return q;
    return null;
  }
  function targetOf(b) {
    let target = b.key ? 0.5 : 0;
    if (drone && b.i === 0) target = Math.max(target, 0.3);
    downs.forEach(q => { if (q.b === b) target = Math.max(target, rimLevel(q.w)); });
    return target;
  }

  // Where the mallet heads: the newest pressed pointer, else the hovering mouse, else its rest.
  function aim() {
    const r0 = rest(), L = downs.get(P.lead);
    if (L) { M.tx = L.x; M.ty = L.y; M.show = 1; }
    else if (P.over) { M.tx = P.x; M.ty = P.y; M.show = 1; }
    else if (r0) { M.tx = r0[0]; M.ty = r0[1]; M.show = 1; }
    else { M.tx = M.x; M.ty = M.y; M.show = 0; }
  }

  function update(dt) {
    downs.forEach(q => { if (now - q.fed > 70) q.w *= Math.exp(-dt / 0.3); });
    let top = null, best = 0.12;
    bowls.forEach(b => {
      const target = targetOf(b);
      b.sing += (target - b.sing) * ease(dt, target > b.sing ? 0.7 : 1.1);
      if (b.sing < 0.002 && !target) b.sing = 0;
      voiceSync(b, target);
      b.ring *= Math.exp(-dt / (set === 'crystal' ? 3 : 2.4));
      b.flash *= Math.exp(-dt / 0.22);
      b.wob *= Math.exp(-dt / 0.9);
      b.hov += ((P.hb === b ? 1 : 0) - b.hov) * ease(dt, 0.12);
      if (!holder(b)) b.orb += dt * (1.2 + 3.5 * b.sing);
      if (b.trail.length && now - b.trail[0].t > 600) b.trail = b.trail.filter(p => now - p.t < 600);
      if (b.sing > best) { best = b.sing; top = b; }
    });
    if (top) say('Now singing · ' + top.note);

    aim();
    const k = 260, d = 2 * Math.sqrt(k) * 0.62;
    M.vx += (k * (M.tx - M.x) - d * M.vx) * dt; M.vy += (k * (M.ty - M.y) - d * M.vy) * dt;
    M.x += M.vx * dt; M.y += M.vy * dt;
    M.a += (0.49 + clamp(M.vx * 0.0007, -0.45, 0.45) - M.a) * ease(dt, 0.08);
    M.al += (M.show - M.al) * ease(dt, 0.12);
    M.tap *= Math.exp(-dt / 0.09);
  }

  // Sound still changing: a rim voice fading, or a held one not yet at its level.
  function audioBusy() {
    const a = window.MoonAudio, canRim = !!(a && a.rim && ready);
    return bowls.some(b => {
      const t = targetOf(b);
      return t ? Math.abs(b.sing - t) > 0.004 || (canRim && !b.voice) : !!b.voice || b.sing > 0;
    });
  }
  function busy() {
    if (downs.size || drone) return true;
    aim();
    if (Math.abs(M.vx) + Math.abs(M.vy) > 2 || Math.abs(M.tx - M.x) + Math.abs(M.ty - M.y) > 0.5 || Math.abs(M.show - M.al) > 0.01 || M.tap > 0.01) return true;
    return audioBusy() || bowls.some(b => b.key || b.voice || b.ring > 0.004 || b.flash > 0.01 || b.wob > 0.003 || Math.abs((P.hb === b ? 1 : 0) - b.hov) > 0.01 || b.halos.length);
  }

  const live = () => onScreen && !document.hidden;
  function advance(cap) {
    const t = clock();
    let dt = clamp((t - last) / 1000, 0.001, cap);
    last = now = t;
    while (dt > 1e-6) { const s = Math.min(dt, 1 / 30); update(s); dt -= s; }
  }
  function frame() {
    raf = 0;
    advance(1 / 30);
    draw();
    if (live() && busy()) raf = requestAnimationFrame(frame);
    else kick();
  }
  // Out of sight there is no rAF, so a coarse timer keeps the voices moving until they settle. Nothing is drawn.
  function onTick() {
    tick = 0;
    if (live()) { kick(); return; }
    advance(2);
    kick();
  }
  function kick() {
    if (live()) {
      if (!raf && busy()) { if (!tick) last = clock() - 16; raf = requestAnimationFrame(frame); }
    } else if (!tick && audioBusy()) {
      if (!raf) last = clock();
      tick = setTimeout(onTick, 50);
    }
  }

  /* Pointer: strike on press, sing by circling the rim while held */

  function hit(px, py) {
    for (let k = order.length - 1; k >= 0; k--) {
      const b = order[k], u = (px - b.x) / (b.r * 1.06), v = (py - b.y) / (b.rim * 1.25);
      if (u * u + v * v <= 1) return b;
      const dd = (py - b.y) / b.h;
      if (dd >= 0 && dd <= 1 && Math.abs(px - b.x) <= b.r * 1.06 * Math.sqrt(1 - dd * dd * dd)) return b;
    }
    return null;
  }

  // Position in the bowl's rim frame: rho 1 is on the rim ellipse, th is the angle round it.
  function polar(b, px, py) {
    const u = (px - b.x) / b.r, v = (py - b.y) / b.rim;
    return { rho: Math.hypot(u, v), th: Math.atan2(v, u) };
  }

  function grab(q, b, p, t) {
    q.b = b; q.w = q.av = 0; q.sg = 0; anew(q, t);
    if (b) { q.th = q.ua = p.th; b.trail = []; }
  }

  function anew(q, t) { q.since = t; q.at = q.ht = 0; }

  // Only a steady circle near the rim feeds the level: rho inside the rim band, 250 ms turning one way,
  // and the stroke itself curving with it (a straight swipe sweeps the angle but never turns its heading).
  function track(q) {
    const t = clock(), mx = q.x - q.ox, my = q.y - q.oy;
    let dh = 0;
    if (mx * mx + my * my > 1) {
      const hd = Math.atan2(my, mx);
      if (q.hd != null) { dh = hd - q.hd; dh -= TAU * Math.round(dh / TAU); }
      q.hd = hd; q.ox = q.x; q.oy = q.y;
    }
    let b = q.b, p = b && polar(b, q.x, q.y);
    if (!b || p.rho > 3.4) {
      let best = 0.7;
      b = null;
      bowls.forEach(c => {
        const r = polar(c, q.x, q.y), dd = Math.abs(r.rho - 1.2);
        if (r.rho > 0.5 && r.rho < 2.2 && dd < best) { best = dd; b = c; p = r; }
      });
      if (b !== q.b) grab(q, b, p, t);
      q.mt = t;
      return;
    }
    const dt = Math.max(0.008, (t - q.mt) / 1000);
    let d = p.th - q.th;
    d -= TAU * Math.round(d / TAU);
    q.th = p.th; q.mt = t;
    if (p.rho < 0.6 || p.rho > 1.6) { q.sg = 0; anew(q, t); return; }
    q.ua += d;
    b.trail.push({ a: q.ua, t });
    if (b.trail.length > 48) b.trail.shift();
    // Direction from a smoothed angular speed, so hand jitter does not count as turning back.
    q.av += (d / dt - q.av) * clamp(dt / 0.08, 0.05, 1);
    if (Math.abs(q.av) > 0.3) {
      const sg = q.av > 0 ? 1 : -1;
      if (sg !== q.sg) { q.sg = sg; anew(q, t); }
    }
    q.at += d; q.ht += dh;
    if (!q.sg || t - q.since < 250 || q.ht * q.sg < 0.5 * Math.abs(q.at)) return;
    q.w += (Math.min(Math.abs(d) / dt, 14) - q.w) * clamp(dt * 6, 0.05, 1);
    q.fed = t;
  }

  function locate(o, e) {
    const r = cv.getBoundingClientRect(), t = clock();
    const x = e.clientX - r.left, y = e.clientY - r.top, dt = (t - o.t) / 1000;
    if (dt > 0 && dt < 0.15) { o.vx += ((x - o.x) / dt - o.vx) * 0.5; o.vy += ((y - o.y) / dt - o.vy) * 0.5; }
    else o.vx = o.vy = 0;
    o.x = x; o.y = y; o.t = t;
  }

  cv.addEventListener('pointerenter', e => {
    if (e.pointerType === 'touch') return;
    P.over = true; locate(P, e);
    if (M.al < 0.1) { M.x = P.x; M.y = P.y; M.vx = M.vy = 0; }
    kick();
  });
  cv.addEventListener('pointerleave', e => {
    if (e.pointerType === 'touch' || downs.size) return;
    P.over = false; P.hb = null; kick();
  });
  cv.addEventListener('pointermove', e => {
    const q = downs.get(e.pointerId);
    if (q) {
      locate(q, e); track(q);
      if (P.lead === q.id) { P.x = q.x; P.y = q.y; }
    } else if (e.pointerType !== 'touch') {
      locate(P, e); P.over = true; P.hb = hit(P.x, P.y);
    } else return;
    kick();
  });
  cv.addEventListener('pointerdown', e => {
    if (downs.has(e.pointerId) || e.button > 0) return;
    if (e.preventDefault) e.preventDefault();
    unlock();
    const touch = e.pointerType === 'touch', t = clock();
    const speed = !touch && t - P.t < 120 ? Math.hypot(P.vx, P.vy) : 0;
    const q = { id: e.pointerId, touch, x: 0, y: 0, vx: 0, vy: 0, t: 0, b: null, th: 0, ua: 0, mt: t, fed: t, w: 0, sg: 0, av: 0, since: t, at: 0, ht: 0, hd: null, ox: 0, oy: 0, pend: null };
    locate(q, e); q.ox = q.x; q.oy = q.y;
    downs.set(q.id, q);
    P.lead = q.id; P.x = q.x; P.y = q.y; P.over = true; P.hb = null;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    if (touch || M.al < 0.5) { M.x = q.x; M.y = q.y; M.vx = M.vy = 0; M.al = Math.max(M.al, 0.7); }
    const b = hit(q.x, q.y);
    if (b) {
      const g = touch ? 0.55 : clamp(0.42 + speed / 2000, 0.42, 0.95);
      // A touch pointerdown cannot start audio on iOS or Android: if the context is not running yet, sound on pointerup.
      if (touch && !running()) { q.pend = { b, g }; strike(b, g, true); } else strike(b, g);
      grab(q, b, polar(b, q.x, q.y), t);
    }
    kick();
  });
  function release(e) {
    const q = downs.get(e.pointerId);
    if (!q) return;
    downs.delete(q.id);
    if (e.type === 'pointerup') { unlock(); if (q.pend) sound(q.pend.b, q.pend.g); }
    if (P.lead === q.id) {
      let n = null;
      downs.forEach(o => { n = o; });
      P.lead = n ? n.id : null;
      if (n) { P.x = n.x; P.y = n.y; }
      else if (q.touch || e.type !== 'pointerup') { P.over = false; P.hb = null; }
    }
    try { cv.releasePointerCapture(q.id); } catch (err) { /* fine */ }
    kick();
  }
  function releaseAll() { [...downs.keys()].forEach(id => release({ pointerId: id, type: 'cancel' })); }
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => cv.addEventListener(n, release));
  // Touch only counts as a user gesture on release, so unlock again there too.
  cv.addEventListener('touchend', () => { unlock(); }, { passive: true });
  window.addEventListener('blur', releaseAll);

  /* Keys, buttons, set and drone */

  function hush() {
    const a = window.MoonAudio;
    if (a) a.stopAll(0.6);
    drone = false;
    if (droneBtn) droneBtn.setAttribute('aria-pressed', 'false');
    bowls.forEach(b => { b.key = false; if (b.voice) b.voice.stop(0.6); b.voice = null; b.ring *= 0.3; b.sing *= 0.3; });
    downs.forEach(q => { q.w = 0; });
    say('Silence');
    kick();
  }

  function choose(name) {
    if (!SETS[name] || name === set) return;
    set = name;
    bowls.forEach(b => { if (b.voice) { b.voice.stop(0.8); b.voice = null; } });
    applySet();
    paint();
    say(name === 'crystal' ? 'Crystal set' : 'Himalayan set');
    if (!raf) draw();
    kick();
  }

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target || {};
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(tg.tagName || '') || tg.isContentEditable) return;
    if (e.key === 'Escape') { hush(); return; }
    const m = /^(?:Digit|Numpad)([1-5])$/.exec(e.code || '') || (!e.shiftKey && /^([1-5])$/.exec(e.key || ''));
    if (!m) return;
    e.preventDefault();
    if (e.repeat) return;
    const b = bowls[+m[1] - 1];
    unlock();
    if (e.shiftKey) {
      b.key = !b.key;
      if (b.key) say('Now singing · ' + b.note);
      kick();
    } else strike(b, 0.6);
  });

  keyBtns.forEach(btn => btn.addEventListener('click', () => { unlock(); strike(bowls[+btn.dataset.bowl], 0.6); }));
  setBtns.forEach(btn => btn.addEventListener('click', () => choose(btn.dataset.set)));
  if (droneBtn) droneBtn.addEventListener('click', () => {
    unlock();
    drone = !drone;
    droneBtn.setAttribute('aria-pressed', String(drone));
    if (drone) say('Now singing · ' + bowls[0].note);
    kick();
  });

  /* Lifecycle: draw only while visible and something moves */

  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); kick(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { onScreen = es[es.length - 1].isIntersecting; kick(); }).observe(stage);
  }
  // Moving the window to a screen with another pixel ratio: re-measure and listen for the next change.
  let dprMq = null;
  function watchDpr() {
    if (!window.matchMedia) return;
    if (dprMq) { if (dprMq.removeEventListener) dprMq.removeEventListener('change', onDpr); else if (dprMq.removeListener) dprMq.removeListener(onDpr); }
    dprMq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    if (dprMq.addEventListener) dprMq.addEventListener('change', onDpr); else if (dprMq.addListener) dprMq.addListener(onDpr);
  }
  function onDpr() { measure(); watchDpr(); kick(); }
  watchDpr();
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(stage);
  else window.addEventListener('resize', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { paint(); if (!raf) draw(); });

  applySet();
  measure();
  kick();

  // Read-only handle for tests and debugging.
  window.BowlTable = { bowls, downs, get set() { return set; }, get drone() { return drone; }, get dpr() { return dpr; }, rimLevel };
})();
