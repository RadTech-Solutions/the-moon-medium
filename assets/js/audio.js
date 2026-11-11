/* MoonAudio: the shared Web Audio engine. Every sound is synthesized here, no files.
   Chain: voices > master > (dry + convolver reverb) > compressor > analyser > speakers. */
(function () {
  'use strict';

  const MAX_VOICES = 24;
  const voices = new Set();
  let ctx = null, master = null, analyser = null, noise = null, rainBuf = null, timeBuf = null;
  let volume = 0.8, wasOn = false;

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const rand = (a, b) => a + Math.random() * (b - a);

  // Build the graph on first use. Callers do this inside a user gesture.
  function ensure() {
    if (ctx) {
      if (ctx.state !== 'running') ctx.resume();   // iOS can report 'interrupted'
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio is not supported in this browser');
    // iOS: play through the silent switch.
    if (navigator.audioSession) try { navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;

    const dry = ctx.createGain(), wet = ctx.createGain(), verb = ctx.createConvolver();
    dry.gain.value = 0.8;
    wet.gain.value = 0.42;
    verb.buffer = impulse(4.2);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 14;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;

    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    timeBuf = new Float32Array(analyser.fftSize);

    master.connect(dry); dry.connect(comp);
    master.connect(verb); verb.connect(wet); wet.connect(comp);
    comp.connect(analyser); analyser.connect(ctx.destination);

    noise = noiseBuffer(2);
    api.analyser = analyser;
    return ctx;
  }

  // Reverb impulse: stereo noise with a cubic decay that also darkens as it fades.
  function impulse(sec) {
    const rate = ctx.sampleRate, len = Math.floor(rate * sec);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        y += (0.8 - 0.7 * t) * ((Math.random() * 2 - 1) - y);
        d[i] = y * Math.pow(1 - t, 3.2);
      }
      for (let i = 0; i < 600; i++) d[i] *= i / 600;
    }
    return buf;
  }

  function noiseBuffer(sec) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Rain: sparse tiny grains, denser in the middle, built once and reused.
  function rainBuffer() {
    if (rainBuf) return rainBuf;
    const rate = ctx.sampleRate, len = Math.floor(rate * 4.2);
    rainBuf = ctx.createBuffer(1, len, rate);
    const d = rainBuf.getChannelData(0);
    for (let i = 0; i < len - 80; i++) {
      const dens = Math.sin(Math.PI * i / len);
      if (Math.random() < dens * 0.0035) {
        const amp = rand(0.15, 1) * (Math.random() < 0.5 ? -1 : 1);
        const n = 20 + (Math.random() * 60) | 0;
        for (let k = 0; k < n; k++) d[i + k] += amp * Math.exp(-k / (n / 4)) * (Math.random() * 2 - 1);
      }
    }
    return rainBuf;
  }

  // Freeze a param where it is now, so the next ramp starts from the real value.
  function hold(p, t) {
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
    else { const x = p.value; p.cancelScheduledValues(t); p.setValueAtTime(x, t); }
  }
  function glide(p, val, tc) {
    const t = ctx.currentTime;
    hold(p, t);
    p.setTargetAtTime(val, t, tc);
  }

  function sounding() {
    const on = voices.size > 0;
    if (on === wasOn) return;
    wasOn = on;
    document.body.classList.toggle('sounding', on);
    window.dispatchEvent(new CustomEvent('moonaudio:sounding', { detail: on }));
  }

  // A voice owns every node of one sound, so it can fade and disconnect as a unit.
  // Over the cap, the oldest one-shot strike goes first; sustained tones only if none.
  function voice(pan, sustained) {
    let live = 0, shot = null, held = null;
    for (const old of voices) {
      if (old.leaving) continue;
      live++;
      if (old.sustained) { if (!held) held = old; } else if (!shot) shot = old;
    }
    if (live >= MAX_VOICES) (shot || held).stop(0.15);
    const t0 = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    const v = { t0, out, nodes: [out], srcs: [], leaving: false, done: false, timer: 0, sustained: !!sustained };
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      out.connect(p); p.connect(master);
      v.nodes.push(p);
      v.panner = p;
    } else {
      out.connect(master);
    }
    v.node = n => { v.nodes.push(n); return n; };
    v.src = (n, at, until, offset) => {
      v.nodes.push(n); v.srcs.push(n);
      n.start(at, offset || 0);
      if (until) { n.stop(until); n.until = until; }
      return n;
    };
    v.stop = (fade) => {
      if (v.done) return;
      const now = ctx.currentTime, f = Math.max(0.03, fade == null ? 0.3 : fade);
      v.leaving = true;
      hold(out.gain, now);
      out.gain.linearRampToValueAtTime(0, now + f);
      finish(v, now + f + 0.05);
    };
    voices.add(v);
    sounding();
    return v;
  }

  function finish(v, when) {
    v.srcs.forEach(s => {
      try { s.stop(Math.min(when, s.until || Infinity)); } catch (e) { /* already stopped */ }
    });
    clearTimeout(v.timer);
    v.timer = setTimeout(() => cleanup(v), Math.max(0, when - ctx.currentTime) * 1000 + 150);
  }

  function cleanup(v) {
    if (v.done) return;
    v.done = true;
    v.nodes.forEach(n => { try { n.disconnect(); } catch (e) { /* fine */ } });
    voices.delete(v);
    sounding();
  }

  // One enveloped oscillator: rises in atk, then falls about 60 dB by dec.
  function partial(v, freq, peak, atk, dec, at, type, dest) {
    const t = v.t0 + (at || 0);
    const o = ctx.createOscillator(), g = v.node(ctx.createGain());
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.setTargetAtTime(0, t + atk, dec / 7);
    o.connect(g); g.connect(dest || v.out);
    return v.src(o, t, t + atk + dec + 0.1);
  }

  // Two close sines of unequal level: the slow beating that makes bowls breathe.
  function pair(v, f, beat, peak, atk, dec, at, dest) {
    partial(v, f, peak * 0.58, atk, dec, at, 'sine', dest);
    partial(v, f + beat, peak * 0.42, atk, dec, at, 'sine', dest);
  }

  // Filtered noise burst for mallet contact, wash and breath.
  function burst(v, centre, peak, atk, dec, at, q, type) {
    const t = v.t0 + (at || 0);
    const s = ctx.createBufferSource(), f = v.node(ctx.createBiquadFilter()), g = v.node(ctx.createGain());
    s.buffer = noise; s.loop = true;
    f.type = type || 'bandpass'; f.frequency.value = centre; f.Q.value = q || 1;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.setTargetAtTime(0, t + atk, dec / 6);
    s.connect(f); f.connect(g); g.connect(v.out);
    return v.src(s, t, t + atk + dec + 0.1, Math.random() * 1.5);
  }

  function chimeTone(v, f, peak, at, ratios, decs, gains) {
    ratios.forEach((r, i) => {
      if (f * r > 16000) return;
      if (i === 0) pair(v, f, rand(1.5, 4), peak, 0.002, decs[0], at);
      else partial(v, f * r, peak * gains[i], 0.002, decs[i], at);
    });
  }

  // Each kind writes into a voice and returns how long it lasts in seconds.
  const KINDS = {
    crystal(v, f = 440, g) {
      const dec = rand(8, 12), k = g * 0.6;
      pair(v, f, rand(0.3, 0.9), k, 0.015, dec);
      pair(v, f * 2.71, rand(0.8, 1.6), k * 0.05, 0.006, dec * 0.35);
      partial(v, f * 5.3, k * 0.02, 0.002, 0.6);
      burst(v, f * 3, k * 0.05, 0.003, 0.08, 0, 2);
      return dec + 0.2;
    },
    himalayan(v, f = 196, g) {
      const k = g * 0.42;
      const ratios = [1, 2.76, 5.4, 8.9], gains = [1, 0.6, 0.32, 0.16], decs = [10, 7, 4.5, 2.6], beats = [0.6, 1.3, 2.2, 3.4];
      ratios.forEach((r, i) => {
        const fr = f * r * rand(0.995, 1.005);
        if (fr < 16000) pair(v, fr, beats[i] * rand(0.7, 1.3), k * gains[i], 0.004, decs[i]);
      });
      burst(v, f * 4, k * 0.12, 0.002, 0.1, 0, 1.5);
      return 10.3;
    },
    gong(v, f = 65, g) {
      const k = g * 0.16, n = 14;
      for (let i = 0; i < n; i++) {
        const r = i === 0 ? 1 : 1 + i * 0.47 + rand(0, 0.2);
        const atk = 0.06 + (i / (n - 1)) * 2.6;      // higher partials bloom later: the swell
        const dec = 14 - i * 0.45, peak = k / (1 + i * 0.5);
        if (i < 4) pair(v, f * r, rand(0.3, 1.2), peak, atk, dec);
        else partial(v, f * r, peak, atk, dec);
        if (i === 0) {
          // the fundamental sags slightly in pitch as it settles
          v.srcs.slice(-2).forEach(o => {
            const base = o.frequency.value;
            o.frequency.setValueAtTime(base * 1.02, v.t0);
            o.frequency.exponentialRampToValueAtTime(base, v.t0 + 3);
          });
        }
      }
      burst(v, f * 6, k * 2, 0.004, 0.5, 0, 0.7, 'lowpass');
      burst(v, 1800, k * 0.35, 1.8, 7, 0, 0.8);
      return 14.3;
    },
    chime(v, f = 1200, g) {
      chimeTone(v, f, g * 0.3, 0, [1, 2.76, 5.4, 8.93], [3, 1.6, 0.8, 0.4], [1, 0.45, 0.25, 0.1]);
      return 3.2;
    },
    koshi(v, f = 660, g) {
      const steps = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2].sort(() => Math.random() - 0.5);
      const count = 4 + (Math.random() * 3 | 0);
      let at = 0;
      for (let i = 0; i < count; i++) {
        chimeTone(v, f * steps[i], g * rand(0.12, 0.22), at, [1, 2.4, 4.1], [2.4, 1.1, 0.5], [1, 0.3, 0.12]);
        at += rand(0.12, 1.6 / count * 2);
        if (at > 1.6) break;
      }
      return at + 2.6;
    },
    fork(v, f = 136.1, g) {
      partial(v, f, g * 0.55, 0.15, 6);
      partial(v, f * 6.27, g * 0.03, 0.003, 0.25);
      return 6.2;
    },
    ocean(v, f, g) {
      const t = v.t0, s = ctx.createBufferSource(), lp = v.node(ctx.createBiquadFilter()), env = v.node(ctx.createGain());
      s.buffer = noise; s.loop = true;
      lp.type = 'lowpass'; lp.Q.value = 0.4;
      lp.frequency.setValueAtTime(250, t);
      lp.frequency.exponentialRampToValueAtTime(1400, t + 2.6);
      lp.frequency.exponentialRampToValueAtTime(300, t + 6);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(g * 0.5, t + 2.6);
      env.gain.linearRampToValueAtTime(0, t + 6);
      s.connect(lp); lp.connect(env); env.connect(v.out);
      v.src(s, t, t + 6.1, Math.random() * 1.5);
      if (v.panner) {
        const p = v.panner.pan.value;
        v.panner.pan.setValueAtTime(clamp(p - 0.3, -1, 1), t);
        v.panner.pan.linearRampToValueAtTime(clamp(p + 0.3, -1, 1), t + 6);
      }
      return 6.2;
    },
    rain(v, f, g) {
      const t = v.t0, s = ctx.createBufferSource(), bp = v.node(ctx.createBiquadFilter()), hp = v.node(ctx.createBiquadFilter()), env = v.node(ctx.createGain());
      s.buffer = rainBuffer(); s.playbackRate.value = rand(0.9, 1.15);
      bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.7;
      hp.type = 'highpass'; hp.frequency.value = 600;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(g * 1.6, t + 0.3);
      env.gain.setValueAtTime(g * 1.6, t + 3.2);
      env.gain.linearRampToValueAtTime(0, t + 4);
      s.connect(bp); bp.connect(hp); hp.connect(env); env.connect(v.out);
      v.src(s, t, t + 4.1);
      return 4.2;
    },
    shruti(v, f = 130.8, g) {
      const t = v.t0, lp = v.node(ctx.createBiquadFilter()), bel = v.node(ctx.createGain());
      lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 1.2;
      [[1, 0.5], [1.5, 0.35], [2, 0.15]].forEach(([r, a]) => {
        [1, 1.0015].forEach(d => {
          const o = ctx.createOscillator(), og = v.node(ctx.createGain());
          o.type = 'sawtooth'; o.frequency.value = f * r * d; og.gain.value = a * 0.5;
          o.connect(og); og.connect(lp);
          v.src(o, t, t + 5.1);
        });
      });
      bel.gain.setValueAtTime(0, t);
      bel.gain.linearRampToValueAtTime(g * 0.4, t + 0.8);
      bel.gain.setValueAtTime(g * 0.4, t + 4);
      bel.gain.linearRampToValueAtTime(0, t + 5);
      lfo(v, 0.3, g * 0.06, bel.gain, t, t + 5.1);   // bellows breathing
      lp.connect(bel); bel.connect(v.out);
      return 5.2;
    },
    voice(v, f = 130.8, g) {
      const t = v.t0, o = ctx.createOscillator(), env = v.node(ctx.createGain()), sum = v.node(ctx.createGain());
      o.type = 'sawtooth'; o.frequency.value = f;
      lfo(v, 5, f * 0.004, o.frequency, t, t + 5.1);   // gentle vibrato
      // Formants open on "o", then close toward the "m" hum.
      [[520, 300, 1, 7], [860, 700, 0.5, 9], [2500, 2300, 0.18, 12]].forEach(([a, b, gn, q], i) => {
        const bp = v.node(ctx.createBiquadFilter()), fg = v.node(ctx.createGain());
        bp.type = 'bandpass'; bp.Q.value = q;
        bp.frequency.setValueAtTime(a, t);
        bp.frequency.setValueAtTime(a, t + 2.6);
        bp.frequency.linearRampToValueAtTime(b, t + 3.4);
        fg.gain.setValueAtTime(gn * 3, t);
        fg.gain.setValueAtTime(gn * 3, t + 2.6);
        fg.gain.linearRampToValueAtTime(i ? 0.05 : gn * 1.5, t + 3.4);
        o.connect(bp); bp.connect(fg); fg.connect(sum);
      });
      const hum = v.node(ctx.createBiquadFilter()), hg = v.node(ctx.createGain());
      hum.type = 'lowpass'; hum.frequency.value = 380;
      hg.gain.setValueAtTime(0.15, t);
      hg.gain.setValueAtTime(0.15, t + 2.6);
      hg.gain.linearRampToValueAtTime(0.7, t + 3.4);
      o.connect(hum); hum.connect(hg); hg.connect(sum);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(g * 0.5, t + 0.4);
      env.gain.setValueAtTime(g * 0.5, t + 4);
      env.gain.linearRampToValueAtTime(0, t + 5);
      sum.connect(env); env.connect(v.out);
      v.src(o, t, t + 5.1);
      return 5.2;
    }
  };

  function lfo(v, rate, depth, param, t, until) {
    const o = ctx.createOscillator(), g = v.node(ctx.createGain());
    o.frequency.value = rate; g.gain.value = depth;
    o.connect(g); g.connect(param);
    v.src(o, t, until);
  }

  const api = {
    analyser: null,

    unlock() {
      try { ensure(); } catch (e) { return Promise.reject(e); }
      return ctx.resume().then(() => ctx);
    },

    tone(freq, opts) {
      const o = opts || {};
      ensure();
      const wave = o.wave || 'sine', beat = o.binauralBeat || 0, attack = o.attack || 0.3;
      let f = clamp(freq, 1, 20000), b = beat;
      const v = voice(0, true);
      const merge = v.node(ctx.createChannelMerger(2)), amp = v.node(ctx.createGain());
      const L = ctx.createOscillator(), R = ctx.createOscillator();
      L.type = R.type = wave;
      L.frequency.value = f; R.frequency.value = f + b;
      L.connect(merge, 0, 0); R.connect(merge, 0, 1);
      amp.gain.setValueAtTime(0, v.t0);
      amp.gain.setTargetAtTime(o.gain == null ? 0.25 : o.gain, v.t0, attack / 3);
      merge.connect(amp); amp.connect(v.out);
      v.src(L, v.t0); v.src(R, v.t0);
      return {
        setFreq(x) { f = clamp(x, 1, 20000); glide(L.frequency, f, 0.05); glide(R.frequency, f + b, 0.05); },
        setGain(g) { glide(amp.gain, clamp(g, 0, 1), 0.08); },
        setBinaural(hz) { b = hz || 0; glide(R.frequency, f + b, 0.3); },
        stop(fade) { v.stop(fade == null ? 0.4 : fade); }
      };
    },

    strike(kind, opts) {
      const o = opts || {};
      ensure();
      const v = voice(o.pan || 0);
      const fn = KINDS[kind] || KINDS.crystal;
      const dur = fn(v, o.freq || undefined, o.gain == null ? 0.5 : o.gain);
      finish(v, v.t0 + dur);
      return { stop(fade) { v.stop(fade == null ? 0.3 : fade); } };
    },

    // Rim singing: builds slowly, wobbles as the mallet circles, rings until stop().
    sing(kind, opts) {
      const o = opts || {};
      ensure();
      const hima = kind === 'himalayan';
      const f = o.freq || (hima ? 196 : 440), g = o.gain == null ? 0.4 : o.gain;
      const v = voice(o.pan || 0, true), t = v.t0;
      const bus = v.node(ctx.createGain()), wob = v.node(ctx.createGain());
      bus.gain.setValueAtTime(0, t);
      bus.gain.setTargetAtTime(g * 0.5, t, 1.2);
      wob.gain.value = 0.8;
      lfo(v, rand(0.6, 0.9), 0.2, wob.gain, t);
      const parts = hima ? [[1, 1, 0.7], [2.76, 0.35, 1.4], [5.4, 0.1, 2.3]] : [[1, 1, 0.5], [2.71, 0.04, 1.1]];
      parts.forEach(([r, a, beat]) => {
        [[0, 0.58], [beat, 0.42]].forEach(([d, share]) => {
          const osc = ctx.createOscillator(), og = v.node(ctx.createGain());
          osc.frequency.value = f * r + d; og.gain.value = a * share;
          osc.connect(og); og.connect(bus);
          v.src(osc, t);
        });
      });
      if (hima) {
        const s = ctx.createBufferSource(), bp = v.node(ctx.createBiquadFilter()), ng = v.node(ctx.createGain());
        s.buffer = noise; s.loop = true;
        bp.type = 'bandpass'; bp.frequency.value = f * 2.76; bp.Q.value = 18;
        ng.gain.value = 0.05;
        s.connect(bp); bp.connect(ng); ng.connect(bus);
        v.src(s, t);
      }
      bus.connect(wob); wob.connect(v.out);
      return { stop(fade) { v.stop(fade == null ? 3 : fade); } };
    },

    // Rim singing under live control: starts silent, setLevel(0..1) glides the loudness
    // (upper partials follow the square, so a faster mallet also sounds brighter).
    // Counts as a sustained voice against the polyphony cap. opts.gain is the level at 1.
    rim(kind, opts) {
      const o = opts || {};
      ensure();
      const hima = kind === 'himalayan';
      const f = o.freq || (hima ? 196 : 440), top = o.gain == null ? 0.5 : clamp(o.gain, 0, 1);
      const v = voice(o.pan || 0, true), t = v.t0;
      const body = v.node(ctx.createGain()), edge = v.node(ctx.createGain()), wob = v.node(ctx.createGain());
      body.gain.setValueAtTime(0, t);
      edge.gain.setValueAtTime(0, t);
      wob.gain.value = 0.85;
      lfo(v, rand(0.6, 0.9), 0.15, wob.gain, t);
      const add = (r, a, beat, dest) => {
        [[0, 0.58], [beat, 0.42]].forEach(([d, share]) => {
          const osc = ctx.createOscillator(), og = v.node(ctx.createGain());
          osc.frequency.value = f * r + d; og.gain.value = a * share;
          osc.connect(og); og.connect(dest);
          v.src(osc, t);
        });
      };
      if (hima) {
        add(1, 1, 0.7, body); add(2.76, 0.32, 1.4, body); add(5.4, 0.14, 2.3, edge);
        const s = ctx.createBufferSource(), bp = v.node(ctx.createBiquadFilter()), ng = v.node(ctx.createGain());
        s.buffer = noise; s.loop = true;
        bp.type = 'bandpass'; bp.frequency.value = f * 2.76; bp.Q.value = 18;
        ng.gain.value = 0.06;
        s.connect(bp); bp.connect(ng); ng.connect(edge);
        v.src(s, t, 0, Math.random() * 1.5);
      } else {
        add(1, 1, 0.5, body); add(2.71, 0.06, 1.1, edge);
      }
      body.connect(wob); edge.connect(wob); wob.connect(v.out);
      let lvl = 0;
      return {
        setLevel(x) {
          if (v.leaving) return;
          lvl = clamp(+x || 0, 0, 1);
          glide(body.gain, lvl * top, 0.12);
          glide(edge.gain, lvl * lvl * top, 0.25);
        },
        get level() { return lvl; },
        get alive() { return !v.leaving; },
        stop(fade) { v.stop(fade == null ? 1.5 : fade); }
      };
    },

    level() {
      if (!analyser) return 0;
      let s = 0;
      if (analyser.getFloatTimeDomainData) {
        analyser.getFloatTimeDomainData(timeBuf);
        for (let i = 0; i < timeBuf.length; i++) s += timeBuf[i] * timeBuf[i];
      } else {
        const b = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(b);
        for (let i = 0; i < b.length; i++) { const x = (b[i] - 128) / 128; s += x * x; }
      }
      return Math.min(1, Math.sqrt(s / analyser.fftSize) * 4);
    },

    stopAll(fade) {
      voices.forEach(v => v.stop(fade == null ? 0.6 : fade));
    },

    setMasterVolume(x) {
      volume = clamp(x, 0, 1);
      if (ctx) glide(master.gain, volume, 0.05);
    },

    get context() { return ctx; },
    get voices() { return voices.size; }
  };

  window.MoonAudio = api;
})();
