/* Instruments page: a tiny canvas 3D renderer, the featured stage, tiles and deep links. */
(() => {
  'use strict';
  const TAU = Math.PI * 2, sin = Math.sin, cos = Math.cos;
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  // v2 palette: ivory lines, brass accents, stone for stands and cushions
  const IVORY = '243,237,226', BRASS = '205,165,106', STONE = '180,172,159';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // geometry. a model is a list of strokes {p:[[x,y,z]], c, w, a, cl, v, g, fill, dot}
  const S = (p, c, o) => Object.assign({ p, c, w: 1.2, a: 1, cl: false, v: 0, g: 0 }, o);
  function circ(cx, cy, cz, r, pl, n, sx = 1, sz = 1) {
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, u = cos(a) * r * sx, w = sin(a) * r * sz;
      p.push(pl === 'xy' ? [cx + u, cy + w, cz] : pl === 'yz' ? [cx, cy + u, cz + w] : [cx + u, cy, cz + w]);
    }
    return p;
  }
  const ring = (r, y, c, o = {}) => S(circ(o.x || 0, y, o.z || 0, r, 'xz', o.n || 44, o.sx, o.sz), c, Object.assign({ cl: true }, o));
  const disc = (r, x, y, z, c, o = {}) => S(circ(x, y, z, r, o.pl || 'xy', o.n || 44), c, Object.assign({ cl: true }, o));
  const seg = (a, b, c, o) => S([a, b], c, o);
  const rect = (x0, y0, x1, y1, z, c, o) => S([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], c, Object.assign({ cl: true }, o));
  function meridians(out, prof, n, c, o) {
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU, sx = o.sx || 1, sz = o.sz || 1;
      out.push(S(prof.map(([r, y]) => [cos(a) * r * sx, y, sin(a) * r * sz]), c, o));
    }
  }
  function tube(out, x, z, r, y0, y1, c, o = {}) {
    out.push(ring(r, y0, c, Object.assign({ x, z, n: 14 }, o)), ring(r, y1, c, Object.assign({ x, z, n: 14 }, o)));
    for (let k = 0; k < 4; k++) {
      const a = TAU / 8 + k * TAU / 4;
      out.push(seg([x + cos(a) * r, y0, z + sin(a) * r], [x + cos(a) * r, y1, z + sin(a) * r], c, Object.assign({}, o, { a: (o.a || 1) * .55, w: .8 })));
    }
  }
  function box(out, x0, y0, z0, x1, y1, z1, c, o) {
    out.push(rect(x0, y0, x1, y1, z0, c, o), rect(x0, y0, x1, y1, z1, c, o));
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) out.push(seg([x, y, z0], [x, y, z1], c, o));
  }
  let seed = 7;
  const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;

  // bowls flex in their (2,0) mode: the rim goes slightly oval and back
  const bowlMode = (y0, h) => (p, A, t, s) => {
    if (!s.v || !A) return p;
    const k = 1 + A * .05 * clamp((p[1] - y0) / h, 0, 1) * cos(2 * Math.atan2(p[2], p[0])) * sin(t * 26);
    return [p[0] * k, p[1], p[2] * k];
  };

  const MODELS = {
    crystal() {
      const s = [], prof = [[.9, .52], [.91, .3], [.91, .05], [.89, -.2], [.82, -.42], [.66, -.58], [.42, -.66], [0, -.68]];
      prof.slice(0, -1).forEach(([r, y], i) => s.push(ring(r, y, IVORY, { a: i ? .55 : 1, w: i ? 1 : 1.8, v: 1, fill: i ? 0 : .06 })));
      s.push(ring(.84, .52, IVORY, { a: .6, v: 1 }));
      meridians(s, prof, 14, IVORY, { a: .3, w: .8, v: 1 });
      s.push(ring(1.08, -.7, STONE, { a: .14, n: 56 }));
      return { s, mode: bowlMode(-.7, 1.22), oy: -.05, scale: 1.05, rip: { y: .52, r: .95 }, rim: { r: .93, y: .5 }, glow: IVORY };
    },
    himalayan() {
      const s = [], prof = [[.97, .22], [1, .15], [.98, .02], [.9, -.14], [.74, -.26], [.5, -.31], [0, -.32]];
      prof.slice(0, -1).forEach(([r, y], i) => s.push(ring(r, y, BRASS, { a: i ? .55 : 1, w: i ? 1 : 1.8, v: 1, fill: i ? 0 : .07, n: 52 })));
      s.push(ring(.92, .22, BRASS, { a: .6, v: 1 }), ring(.995, .11, BRASS, { a: .35, w: .6, v: 1 }), ring(.99, .07, BRASS, { a: .35, w: .6, v: 1 }));
      meridians(s, prof, 18, BRASS, { a: .2, w: .7, v: 1 });
      // ring cushion: a torus of thin circles
      const R = .5, tr = .1, y0 = -.42;
      for (let b = 0; b < 6; b++) { const q = b / 6 * TAU; s.push(ring(R + tr * cos(q), y0 + tr * sin(q), STONE, { a: .3, w: .8, n: 36 })); }
      for (let k = 0; k < 14; k++) {
        const a = k / 14 * TAU, p = [];
        for (let b = 0; b <= 12; b++) { const q = b / 12 * TAU, rr = R + tr * cos(q); p.push([cos(a) * rr, y0 + tr * sin(q), sin(a) * rr]); }
        s.push(S(p, STONE, { a: .2, w: .7 }));
      }
      s.push(seg([1.2, -.5, .3], [.6, -.5, 1.05], STONE, { w: 3, a: .55 }), seg([1.2, -.5, .3], [1.02, -.5, .52], BRASS, { w: 5, a: .5 }));
      return { s, mode: bowlMode(-.32, .54), oy: -.12, scale: 1, rip: { y: .22, r: 1.05 }, rim: { r: 1.03, y: .2 }, glow: BRASS };
    },
    gong() {
      const s = [], Y = .12, R = .82;
      s.push(disc(R, 0, Y, .035, BRASS, { w: 1.8, v: 1, fill: .08, n: 56 }), disc(R, 0, Y, -.035, BRASS, { a: .7, v: 1, n: 56 }));
      for (let k = 0; k < 20; k++) { const a = k / 20 * TAU; s.push(seg([cos(a) * R, Y + sin(a) * R, .035], [cos(a) * R, Y + sin(a) * R, -.035], BRASS, { a: .5, w: .8, v: 1 })); }
      for (const r of [.62, .44, .28]) s.push(disc(r, 0, Y, 0, BRASS, { a: .28, w: .8, v: 1 }));
      s.push(disc(.14, 0, Y, -.07, BRASS, { w: 1.4, v: 1, fill: .14, n: 24 }), disc(.2, 0, Y, -.03, BRASS, { a: .5, v: 1, n: 28 }));
      const f = { w: 1.6, a: .7 };
      for (const x of [-1.08, 1.08]) {
        for (const z of [-.04, .04]) s.push(seg([x, -.95, z], [x, 1.15, z], STONE, f));
        s.push(seg([x, -.95, -.4], [x, -.95, .4], STONE, { w: 2.4, a: .7 }));
      }
      s.push(seg([-1.18, 1.15, 0], [1.18, 1.15, 0], STONE, f), seg([-1.18, 1.07, 0], [1.18, 1.07, 0], STONE, f));
      s.push(seg([-.32, 1.07, 0], [-.12, .93, 0], IVORY, { a: .5, w: .8 }), seg([.32, 1.07, 0], [.12, .93, 0], IVORY, { a: .5, w: .8 }));
      const mode = (p, A, t, s) => {
        if (!s.v || !A) return p;
        const r = Math.hypot(p[0], p[1] - Y) / R;
        return [p[0], p[1], p[2] + A * .09 * cos(r * Math.PI * 1.2) * sin(t * 20) + A * .05 * sin(t * 2.6) * (1 - p[1])];
      };
      return { s, mode, oy: .1, scale: .82, rip: { pl: 'xy', y: Y, r: .9 }, thumb: -.45, glow: BRASS };
    },
    chimes() {
      const s = [], L = [1.45, 1.3, 1.16, 1.03, .92, .82, .73], top = .78;
      s.push(seg([-1, 1, 0], [1, 1, 0], IVORY, { w: 3, a: .8 }), seg([0, 1, 0], [0, 1.22, 0], IVORY, { a: .6 }), disc(.07, 0, 1.29, 0, IVORY, { n: 16, a: .6 }));
      L.forEach((len, i) => {
        const x = -.78 + i * .26;
        tube(s, x, 0, .05, top - len, top, IVORY, { v: 1, g: i, a: .9 });
        s.push(seg([x, 1, 0], [x, top, 0], STONE, { a: .5, w: .7, v: 1, g: i }));
      });
      s.push(seg([0, 1, .04], [0, .38, .24], STONE, { a: .4, w: .7, v: 1, g: 9 }), ring(.1, .38, BRASS, { z: .24, n: 20, v: 1, g: 9, w: 1.4, fill: .15 }));
      const mode = (p, A, t, s) => {
        if (!s.v || !A) return p;
        const d = 1 - p[1];
        return [p[0] + A * .07 * d * sin(t * 5.5 + s.g * 1.7), p[1], p[2] + A * .05 * d * cos(t * 4.3 + s.g)];
      };
      return { s, mode, oy: .3, scale: .86, rip: { y: .25, r: .6 } };
    },
    koshi() {
      const s = [], r = .3, prof = [];
      for (const y of [-.8, -.45, -.1, .25, .55]) { s.push(ring(r, y, IVORY, { a: .55, w: 1.3, n: 32, fill: y === .55 ? .06 : 0 })); prof.push([r, y]); }
      meridians(s, prof, 8, IVORY, { a: .18, w: .7 });
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU, x = cos(a) * .17, z = sin(a) * .17;
        s.push(seg([x, .5, z], [x, .5 - (.55 + (k % 4) * .1), z], BRASS, { w: 1.3, v: 1, g: k }));
      }
      s.push(seg([0, .5, 0], [0, -.45, 0], STONE, { a: .4, w: .7, v: 2 }));
      for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI; s.push(seg([cos(a) * .13, -.45, sin(a) * .13], [-cos(a) * .13, -.45, -sin(a) * .13], BRASS, { w: 1.4, v: 2 })); }
      s.push(S([[0, -.45, 0]], IVORY, { dot: 1, w: 3, v: 2 }));
      s.push(seg([0, .55, 0], [0, 1.08, 0], IVORY, { a: .6 }), disc(.12, 0, 1.2, 0, IVORY, { a: .6, n: 20 }));
      const mode = (p, A, t, s) => {
        if (!A) return p;
        let [x, y, z] = p;
        if (s.v === 1) { x += A * .025 * sin(t * 31 + s.g); z += A * .025 * cos(t * 27 + s.g); }
        if (s.v === 2) { const d = .5 - y; x += A * .1 * d * sin(t * 3); z += A * .1 * d * cos(t * 2.6); }
        return [x + A * .05 * (1.1 - y) * sin(t * 2), y, z];
      };
      return { s, mode, oy: .2, scale: .95, rip: { y: -.1, r: .4 } };
    },
    fork() {
      const s = [], o = { v: 1 };
      tube(s, 0, 0, .045, -.95, -.42, IVORY);
      s.push(ring(.1, -1.03, IVORY, { n: 20 }), disc(.1, 0, -1.03, 0, IVORY, { n: 20 }), disc(.1, 0, -1.03, 0, IVORY, { n: 20, pl: 'yz' }));
      for (const rr of [.175, .225]) for (const z of [-.03, .03]) {
        const p = [];
        for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI; p.push([-cos(a) * rr, -.2 - sin(a) * rr, z]); }
        s.push(S(p, IVORY, o));
      }
      for (const sx of [-1, 1]) {
        for (const dx of [-.025, .025]) for (const z of [-.03, .03]) s.push(seg([sx * .2 + dx, -.2, z], [sx * .2 + dx, 1, z], IVORY, o));
        s.push(rect(sx * .2 - .025, 1, sx * .2 + .025, 1, .03, IVORY, o));
        tube(s, sx * .2, 0, .07, .7, .94, BRASS, { v: 1, a: .9 });
      }
      const mode = (p, A, t, s) => {
        if (!s.v || !A) return p;
        const d = clamp((p[1] + .2) / 1.2, 0, 1);
        return [p[0] + Math.sign(p[0]) * A * .06 * d * sin(t * 34), p[1], p[2]];
      };
      return { s, mode, oy: 0, scale: .92, rip: { y: .95, r: .3 }, thumb: -.3 };
    },
    ocean() {
      const s = [], R = 1, d = .09, beads = [];
      s.push(ring(R, d, IVORY, { fill: .05, w: 1.6, n: 64 }), ring(R, -d, IVORY, { a: .7, n: 64 }), ring(.94, d, IVORY, { a: .3, n: 60 }), ring(.5, d, IVORY, { a: .15 }));
      for (let k = 0; k < 28; k++) { const a = k / 28 * TAU; s.push(seg([cos(a) * R, d, sin(a) * R], [cos(a) * R, -d, sin(a) * R], IVORY, { a: .35, w: .8 })); }
      seed = 11;
      for (let i = 0; i < 90; i++) { const r = .88 * Math.sqrt(rnd()), a = rnd() * TAU; beads.push([cos(a) * r, d + .01, sin(a) * r]); }
      s.push(S(beads, BRASS, { dot: 1, w: 1.6, v: 1 }));
      const mode = (p, A, t, s, e) => {
        let [x, y, z] = p;
        if (s.v) {
          const r = Math.hypot(x, z), q = Math.atan2(z, x) + e.flow * 1.1 * (.5 + r * .6) + A * .12 * sin(t * .9);
          x = cos(q) * r; z = sin(q) * r;
        }
        return A ? [x, y + x * A * .12 * sin(t * 1.2), z] : [x, y, z];
      };
      return { s, mode, oy: 0, scale: 1, rip: { y: 0, r: 1.05 } };
    },
    rain() {
      const s = [], L = 1.35, r = .13, sd = [];
      for (let x = -L; x <= L + .01; x += .27) s.push(disc(r, x, 0, 0, IVORY, { pl: 'yz', a: .4, n: 18 }));
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + .4; s.push(seg([-L, cos(a) * r, sin(a) * r], [L, cos(a) * r, sin(a) * r], IVORY, { a: .3, w: .8 })); }
      const sp = [];
      for (let u = -L; u <= L; u += .03) sp.push([u, cos(u * 16) * r * 1.02, sin(u * 16) * r * 1.02]);
      s.push(S(sp, BRASS, { a: .45, w: .8 }));
      for (const x of [-L, L]) s.push(disc(r * 1.15, x, 0, 0, BRASS, { pl: 'yz', fill: .15, w: 1.6, n: 20 }));
      seed = 5;
      for (let i = 0; i < 40; i++) sd.push([(rnd() * 2 - 1) * L * .95, (rnd() - .5) * r, (rnd() - .5) * r]);
      s.push(S(sd, IVORY, { dot: 1, w: 1.3, v: 1 }));
      const W = L * 1.9;
      const mode = (p, A, t, s, e) => {
        if (!s.v) return p;
        const x = ((p[0] + L * .95 - e.flow * 1.6) % W + W) % W - L * .95;
        return [x, p[1], p[2]];
      };
      return { s, mode, oy: 0, scale: .95, rz: .35, rip: { pl: 'yz', x: -1.3, y: 0, r: .2 }, thumb: -.25 };
    },
    shruti() {
      const s = [];
      box(s, -.75, -.42, -.3, .75, .42, .3, IVORY, { w: 1.4, a: .85 });
      for (let i = 0; i < 8; i++) {
        const x = -.62 + i * .16, out = i % 3 === 0;
        s.push(rect(x, .08, x + .1, .22, out ? -.36 : -.3, BRASS, { a: out ? 1 : .55 }));
      }
      for (let k = 0; k < 5; k++) s.push(seg([-.6, -.1 - k * .05, -.3], [.6, -.1 - k * .05, -.3], STONE, { a: .35, w: .7 }));
      for (let k = 0; k < 5; k++) { const z = .34 + k * .07, n = k % 2 ? .04 : 0; s.push(rect(-.72 + n, -.39 + n, .72 - n, .39 - n, z, STONE, { a: .5, v: 1 })); }
      s.push(rect(-.75, -.42, .75, .42, .66, IVORY, { w: 1.4, v: 1, fill: .05 }), seg([-.3, .2, .68], [.3, .2, .68], BRASS, { a: .6, w: 2, v: 1 }));
      const mode = (p, A, t, s) => (!s.v || !A) ? p : [p[0], p[1], .3 + (p[2] - .3) * (1 + A * .3 * sin(t * 1.7))];
      return { s, mode, oy: 0, scale: .95, rip: { y: .42, r: .75 }, thumb: -.6 };
    },
    voice() {
      const s = [], hy = .78;
      s.push(ring(.19, hy, IVORY, { n: 28 }), disc(.19, 0, hy, 0, IVORY, { n: 28 }), disc(.19, 0, hy, 0, IVORY, { n: 28, pl: 'yz' }));
      s.push(ring(.155, hy + .11, IVORY, { a: .5, n: 24 }), ring(.155, hy - .11, IVORY, { a: .5, n: 24 }));
      s.push(seg([-.06, .6, 0], [-.06, .5, 0], IVORY, { a: .6 }), seg([.06, .6, 0], [.06, .5, 0], IVORY, { a: .6 }));
      const prof = [[.36, .47], [.34, .3], [.3, .05], [.27, -.15], [.32, -.3]], o = { sx: 1.25, sz: .8 };
      prof.forEach(([r, y]) => s.push(ring(r, y, IVORY, Object.assign({ a: .45, n: 36 }, o))));
      meridians(s, prof, 10, IVORY, Object.assign({ a: .22, w: .8 }, o));
      s.push(ring(.72, -.36, IVORY, { sz: .55, a: .6, w: 1.3, n: 48 }), ring(.55, -.27, IVORY, { sz: .55, a: .4, n: 40 }));
      for (const sx of [-1, 1]) s.push(S([[sx * .43, .42, 0], [sx * .6, 0, -.1], [sx * .52, -.25, -.28]], IVORY, { a: .6, w: 1.4 }));
      [.34, .5, .68].forEach((r, i) => s.push(ring(r, hy, BRASS, { a: .7 - i * .22, w: .9, v: i + 1, n: 48 })));
      s.push(S([[0, .58, -.14]], BRASS, { dot: 1, w: 2.5 }));
      const mode = (p, A, t, s) => {
        if (!s.v) return p;
        const k = 1 + (.03 + A * .18) * sin(t * 1.8 + A * t * 3 - s.v * .9);
        return [p[0] * k, p[1], p[2] * k];
      };
      return { s, mode, oy: .15, scale: .95, rip: { y: hy, r: .75 } };
    }
  };

  // renderer: rotate, project, stroke in three depth bands.
  // Lines are drawn a touch finer than the model widths; the far band is faint so it melts into the teal ground.
  const LW = .74, DEPTH = [.2, .55, 1];
  function draw(ctx, W, H, m, cam, A, t, e, fade, extra) {
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = ctx.lineJoin = 'round';
    if (m.glow && A > .01) {
      // a soft halo that swells with the sound: ivory for crystal, brass for metal
      const R = Math.min(W, H) * .46, g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R);
      if (g) {
        g.addColorStop(0, `rgba(${m.glow},${(A * .16 * fade).toFixed(3)})`);
        g.addColorStop(1, `rgba(${m.glow},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    }
    const yaw = cam.yaw + A * .03 * sin(t * 9), pit = cam.pitch + A * .025 * sin(t * 7.3);
    const cy = cos(yaw), sy = sin(yaw), cp = cos(pit), sp = sin(pit), rz = m.rz || 0, cz = cos(rz), sz = sin(rz);
    const sc = Math.min(W, H) * .36 * (m.scale || 1) * (cam.zoom || 1), F = 4.2, oy = m.oy || 0, cx = W / 2, cyS = H / 2;
    const P = (q) => {
      let x = q[0], y = q[1];
      if (rz) { const x0 = x; x = x0 * cz - y * sz; y = x0 * sz + y * cz; }
      y -= oy;
      const x1 = x * cy + q[2] * sy, z1 = q[2] * cy - x * sy;
      const y2 = y * cp + z1 * sp, z2 = z1 * cp - y * sp, k = F / (F + z2);
      return [cx + x1 * k * sc, cyS - y2 * k * sc, z2, k];
    };
    const bright = Math.min(1.3, .9 + A * .5) * fade, mode = m.mode;
    const all = extra ? m.s.concat(extra) : m.s;
    for (const s of all) {
      const pts = s.p.map(q => P(mode && !s.nm ? mode(q, A, t, s, e) : q));
      if (s.dot) {
        ctx.beginPath();
        for (const q of pts) { const r = s.w * q[3]; ctx.moveTo(q[0] + r, q[1]); ctx.arc(q[0], q[1], r, 0, TAU); }
        ctx.fillStyle = `rgba(${s.c},${Math.min(1, s.a * bright)})`;
        ctx.fill();
        continue;
      }
      const n = pts.length, segs = s.cl ? n : n - 1;
      if (s.fill) {
        ctx.beginPath();
        pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
        ctx.fillStyle = `rgba(${s.c},${s.fill * fade})`;
        ctx.fill();
      }
      ctx.lineWidth = s.w * LW;
      for (let b = 0; b < 3; b++) {
        ctx.beginPath();
        let open = false, any = false;
        for (let i = 0; i < segs; i++) {
          const p0 = pts[i], p1 = pts[(i + 1) % n], zm = (p0[2] + p1[2]) / 2;
          if ((zm > .3 ? 0 : zm > -.3 ? 1 : 2) !== b) { open = false; continue; }
          if (!open) { ctx.moveTo(p0[0], p0[1]); open = true; }
          ctx.lineTo(p1[0], p1[1]); any = true;
        }
        if (!any) continue;
        ctx.strokeStyle = `rgba(${s.c},${Math.min(1, s.a * bright * DEPTH[b])})`;
        ctx.stroke();
      }
    }
  }

  // audio, guarded so the visuals work without audio.js
  let unlocked = false;
  function play(fn) {
    const M = window.MoonAudio;
    if (!M || typeof M.unlock !== 'function') return;
    try { Promise.resolve(M.unlock()).then(() => { unlocked = true; fn(M); }).catch(() => {}); } catch (err) { /* no sound, still fine */ }
  }
  function level() {
    const M = window.MoonAudio;
    try { return M && M.level ? +M.level() || 0 : 0; } catch (err) { return 0; }
  }

  // page wiring
  const stage = $('#stage'), cv = $('#cv');
  if (!stage || !cv || !cv.getContext) return;
  const ctx = cv.getContext('2d'), singBtn = $('#sing'), status = $('#inst-status');
  const tiles = $$('.tile'), items = {};
  $$('.inst').forEach(el => {
    const d = el.dataset, m = MODELS[d.model];
    if (m) items[d.id] = { id: d.id, el, kind: d.kind, freq: +d.freq, decay: +d.decay || 5, sing: 'sing' in d, name: $('h2', el).textContent, m: m() };
  });

  const st = { yaw: -.6, pitch: .42, vy: 0, amp: 0, t: 0, flow: 0, rips: [], sing: false, lastRip: 0, idle: 0, fade: 1, zoom: 1, swap: null, drag: null, vis: true };
  let cur = null, W = 0, H = 0, dpr = 1, raf = 0, prev = 0, singH = null, singGen = 0;
  // during the tile swap, input goes to the incoming instrument
  const target = () => st.swap ? st.swap.to : cur;
  const RL = 2.4;

  function extras() {
    const m = cur.m, out = [], rp = m.rip;
    for (const a of st.rips) {
      if (a < 0) continue;
      const f = a / RL;
      out.push(S(circ(rp.x || 0, rp.y, 0, rp.r + f * 1.3, rp.pl || 'xz', 48), BRASS, { cl: true, nm: 1, w: 1, a: Math.pow(1 - f, 1.5) * .75 }));
    }
    if (st.sing && m.rim) {
      const a = st.t * 2.2, x = cos(a) * m.rim.r, z = sin(a) * m.rim.r;
      out.push(seg([x, m.rim.y, z], [x * 1.3, m.rim.y + .55, z * 1.3], IVORY, { nm: 1, w: 3.5, a: .7 }), S([[x, m.rim.y, z]], BRASS, { dot: 1, nm: 1, w: 4 }));
    }
    return out;
  }

  function paint() {
    if (!W || !cur) return;
    const A = RM.matches ? st.amp * .4 : st.amp;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, W, H, cur.m, st, A, st.t, st, st.fade, extras());
    stage.style.setProperty('--lv', Math.min(1, st.amp).toFixed(2));
  }

  const needs = () => st.vis && !document.hidden &&
    (!RM.matches || st.drag || Math.abs(st.vy) > .02 || st.amp > .004 || st.rips.length || st.sing || st.swap);
  function kick() {
    if (raf || !st.vis || document.hidden) return;
    prev = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    raf = 0;
    const dt = clamp((now - prev) / 1000, 0, .05);
    prev = now; st.t += dt;
    if (!st.drag) {
      st.yaw += st.vy * dt;
      st.vy *= Math.pow(.04, dt);
      st.idle += dt;
      if (!RM.matches && st.idle > 2.5) st.yaw += .22 * dt * Math.min(1, (st.idle - 2.5) / 2);
    }
    st.amp = Math.min(1, Math.max(st.amp * Math.exp(-dt * 3 / cur.decay), st.sing ? .4 : 0, level() * 1.4));
    if (st.amp < .004) st.amp = 0;
    st.flow += dt * st.amp;
    st.rips = st.rips.map(a => a + dt).filter(a => a < RL);
    if (st.sing && st.t - st.lastRip > 1.1) { st.rips.push(0); st.lastRip = st.t; }
    if (st.swap) {
      const T = (st.swap.t += dt);
      if (T >= .22 && cur !== st.swap.to) { cur = st.swap.to; if (!st.swap.hit) { st.amp = 0; st.rips = []; } st.vy += 2.5; }
      st.fade = T < .22 ? 1 - T / .22 : Math.min(1, (T - .22) / .35);
      st.zoom = .9 + .1 * st.fade;
      if (T > .57) { st.swap = null; st.fade = st.zoom = 1; }
    }
    paint();
    if (needs()) raf = requestAnimationFrame(frame);
  }

  function strike() {
    if (!cur) return;
    st.amp = Math.min(1, st.amp + .8);
    const n = RM.matches ? 1 : 3;
    for (let i = 0; i < n; i++) st.rips.push(-i * .28);
    const it = target();
    if (st.swap) st.swap.hit = true;
    play(M => M.strike && M.strike(it.kind, { freq: it.freq, gain: .5 }));
    try { navigator.vibrate && navigator.vibrate(14); } catch (err) { /* not supported */ }
    kick();
  }
  const halt = h => { try { h && h.stop && h.stop(); } catch (err) { /* already gone */ } };
  function stopSing() {
    singGen++;
    if (singH) { halt(singH); singH = null; }
    if (!st.sing) return;
    st.sing = false;
    if (singBtn) singBtn.setAttribute('aria-pressed', 'false');
  }
  function toggleSing() {
    if (st.sing) return stopSing();
    const it = target();
    if (!it || !it.sing) return;
    st.sing = true; st.lastRip = -9;
    singBtn.setAttribute('aria-pressed', 'true');
    const g = ++singGen;
    play(M => {
      if (!M.sing) return;
      const h = M.sing(it.kind, { freq: it.freq });
      // a later toggle or instrument change makes this voice stale
      if (g !== singGen || !st.sing) return halt(h);
      if (singH !== h) halt(singH);
      singH = h;
    });
    kick();
  }

  function show(id, opt = {}) {
    const it = items[id];
    if (!it || (it === cur && !st.swap)) return;
    stopSing();
    for (const k in items) items[k].el.classList.toggle('on', items[k] === it);
    tiles.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    if (singBtn) singBtn.hidden = !it.sing;
    stage.setAttribute('aria-label', it.name + ', 3D model. Drag or use the arrow keys to rotate. Press Enter to strike.');
    if (status && cur) status.textContent = 'Showing ' + it.name;
    if (opt.hash) history.replaceState(null, '', '#' + id);
    if (!cur || RM.matches || !opt.anim) { cur = it; st.amp = 0; st.rips = []; st.swap = null; st.fade = st.zoom = 1; paint(); kick(); }
    else { st.swap = { t: 0, to: it }; kick(); }
    if (opt.scroll) {
      const r = stage.getBoundingClientRect();
      if (r.top < 60 || r.bottom > innerHeight) stage.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'center' });
    }
  }

  // pointer: drag rotates with inertia, a short tap strikes
  stage.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const now = performance.now();
    st.drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: now, lt: now, moved: 0 };
    st.vy = 0; st.idle = 0;
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    kick();
  });
  stage.addEventListener('pointermove', e => {
    const d = st.drag;
    if (!d) return;
    const now = performance.now(), dx = e.clientX - d.lx, dy = e.clientY - d.ly;
    d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y));
    st.yaw += dx * .012;
    if (e.pointerType !== 'touch') st.pitch = clamp(st.pitch + dy * .006, -.1, 1);
    st.vy = clamp(st.vy * .5 + dx * .012 / Math.max(.008, (now - d.lt) / 1000) * .5, -9, 9);
    d.lx = e.clientX; d.ly = e.clientY; d.lt = now;
  });
  const end = e => {
    const d = st.drag;
    if (!d) return;
    st.drag = null; st.idle = 0;
    const now = performance.now();
    if (now - d.lt > 90) st.vy = 0;
    if (RM.matches) st.vy *= .3;
    if (e.type === 'pointerup' && d.moved < 6 && now - d.t < 500) strike();
    kick();
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  stage.addEventListener('keydown', e => {
    const k = e.key;
    if (k === 'Enter' || k === ' ') { e.preventDefault(); if (!e.repeat) strike(); return; }
    const h = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0;
    if (h) { if (RM.matches) st.yaw += h * .26; else st.vy = h * 3.2; }
    else if (k === 'ArrowUp') st.pitch = clamp(st.pitch + .08, -.1, 1);
    else if (k === 'ArrowDown') st.pitch = clamp(st.pitch - .08, -.1, 1);
    else return;
    e.preventDefault(); st.idle = 0; kick();
  });

  const strikeBtn = $('#strike');
  if (strikeBtn) strikeBtn.addEventListener('click', strike);
  if (singBtn) singBtn.addEventListener('click', toggleSing);
  // soft preview on mouse hover only (never on focus), only once the visitor has unlocked audio themselves
  let lastPrev = 0;
  function preview(b) {
    const it = items[b.dataset.id], M = window.MoonAudio, now = performance.now();
    if (!unlocked || !it || !M || !M.strike || now - lastPrev < 350) return;
    lastPrev = now;
    try { M.strike(it.kind, { freq: it.freq, gain: .1 }); } catch (err) { /* quiet */ }
  }
  tiles.forEach(b => {
    b.addEventListener('click', () => show(b.dataset.id, { hash: true, anim: true, scroll: true }));
    b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') preview(b); });
  });
  addEventListener('hashchange', () => show(location.hash.slice(1), { anim: true, scroll: true }));

  // compare list links: always select the instrument and bring the stage into view,
  // even when it is already showing or the hash is unchanged
  document.querySelectorAll('.cmp-list a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      if (!items[id]) return;
      e.preventDefault();
      show(id, { hash: true, anim: true });
      history.replaceState(null, '', '#' + id);
      stage.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'center' });
    });
  });

  // tiles get a still render of their instrument
  function drawTiles() {
    tiles.forEach(b => {
      const c = $('canvas', b), it = items[b.dataset.id];
      if (!c || !it) return;
      const r = c.getBoundingClientRect();
      if (!r.width) return;
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const x = c.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(x, r.width, r.height, it.m, { yaw: it.m.thumb || -.6, pitch: .42, zoom: 1.2 }, 0, 0, { flow: 0 }, 1);
    });
  }

  function size() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    paint();
  }
  let tw = 0, tt = 0;
  function resized() {
    size();
    const w = innerWidth;
    if (w !== tw) { tw = w; clearTimeout(tt); tt = setTimeout(drawTiles, 120); }
  }
  if ('ResizeObserver' in window) new ResizeObserver(resized).observe(stage); else addEventListener('resize', resized);

  // only animate while the stage is on screen and the tab is visible
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { st.vis = es[0].isIntersecting; if (st.vis) kick(); }).observe(stage);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else kick();
  });
  RM.addEventListener && RM.addEventListener('change', kick);

  const first = location.hash.slice(1);
  show(items[first] ? first : 'crystal');
  size(); drawTiles();
})();
