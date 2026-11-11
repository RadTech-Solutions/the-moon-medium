/* Home: moon visual, Frequency Fader with generated text, Listening Room. */
(function () {
  'use strict';
  const A = window.MoonAudio;
  const $ = s => document.querySelector(s);
  const body = document.body;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const canPlay = !!(window.AudioContext || window.webkitAudioContext);
  const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no haptics */ } };

  /* Frequency facts */

  const MIN = 20, MAX = 1000, SPAN = Math.log(MAX / MIN);
  const toHz = pos => MIN * Math.exp(pos / 1000 * SPAN);
  const toPos = f => Math.log(f / MIN) / SPAN * 1000;
  const clampHz = f => Math.min(MAX, Math.max(MIN, f));
  const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
  const noteName = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);

  const SOLF = [
    { hz: 174, name: 'the foundation tone', assoc: 'grounding and feeling safe in the body' },
    { hz: 285, name: 'the renewal tone', assoc: 'renewal' },
    { hz: 396, name: 'the liberating tone', syl: 'UT', assoc: 'releasing fear and guilt' },
    { hz: 417, name: 'the tone of change', syl: 'RE', assoc: 'undoing stuck situations and welcoming change' },
    { hz: 432, name: 'the natural tuning', assoc: 'natural tuning and balance' },
    { hz: 528, name: 'the transformation tone', syl: 'MI', assoc: 'transformation and love' },
    { hz: 639, name: 'the connection tone', syl: 'FA', assoc: 'relationships and connection' },
    { hz: 741, name: 'the expression tone', syl: 'SOL', assoc: 'expression and energetic clearing' },
    { hz: 852, name: 'the intuition tone', syl: 'LA', assoc: 'intuition and inner sight' },
    { hz: 888, name: 'the abundance tone', assoc: 'abundance and prosperity' },
    { hz: 963, name: 'the crown tone', assoc: 'the crown and a sense of oneness' }
  ];
  const ABUNDANCE = [528, 432, 888, 639];
  const BEATS = { 2: 'delta, the band of deep sleep', 6: 'theta, the dreamy edge of meditation', 10: 'alpha, calm and awake' };

  function band(f) {
    if (f < 60) return 'sub bass';
    if (f < 160) return 'bass';
    if (f < 320) return 'low mid';
    if (f < 500) return 'mid';
    return 'upper mid';
  }
  function chakra(f) {
    if (f < 250) return 'Root, the body';
    if (f < 410) return 'Root';
    if (f < 470) return 'Sacral';
    if (f < 600) return 'Solar plexus to heart';
    if (f < 700) return 'Heart';
    if (f < 800) return 'Throat';
    if (f < 900) return 'Third eye';
    return 'Crown';
  }
  function note(f) {
    const exact = 69 + 12 * Math.log2(f / 440), m = Math.round(exact);
    return { name: noteName(m), cents: Math.round((exact - m) * 100) };
  }
  function wave(f) {
    const m = 343 / f;
    return m >= 1 ? m.toFixed(m >= 10 ? 1 : 2) + ' m' : Math.round(m * 100) + ' cm';
  }
  const near = (f, tol) => SOLF.reduce((best, s) => {
    const d = Math.abs(f / s.hz - 1);
    return d < tol && (!best || d < Math.abs(f / best.hz - 1)) ? s : best;
  }, null);

  // Compose a title and two or three short sentences from the facts.
  function describe(f, beat) {
    const F = Math.round(f), k = F % 3;
    const n = note(F), b = band(F), w = wave(F), s = near(F, 0.025);
    const nTxt = Math.abs(n.cents) < 4 ? n.name : n.name + (n.cents > 0 ? ' plus ' : ' minus ') + Math.abs(n.cents) + ' cents';
    const lines = [];
    let title;

    if (s) {
      const d = F - s.hz;
      title = d === 0 ? `${F} Hz, ${s.name}` : `${F} Hz, near ${s.hz}`;
      if (d !== 0) lines.push(`${Math.abs(d)} Hz ${d > 0 ? 'above' : 'below'} ${s.hz}, ${s.name}.`);
      else if (s.syl && k === 0) lines.push(`The ${s.syl} tone of the solfeggio scale, close to ${n.name}.`);
      lines.push([
        `Traditionally linked to ${s.assoc}.`,
        `In sound healing it is associated with ${s.assoc}.`,
        `Sound healers traditionally link it to ${s.assoc}.`
      ][k]);
      if (ABUNDANCE.includes(s.hz)) {
        const others = ABUNDANCE.filter(x => x !== s.hz);
        lines.push(`Purnima pairs it with ${others.slice(0, 2).join(', ')} and ${others[2]} Hz in her abundance reels.`);
      }
      if (lines.length < 2) lines.push(F * 2 <= MAX ? `Its octave above sits at ${F * 2} Hz.` : `Its octave below sits at ${Math.round(F / 2)} Hz.`);
    } else {
      title = [`${F} Hz, ${b}`, `${F} Hz, close to ${n.name}`, `${F} Hz in the ${b}`][k];
      lines.push([
        `${/^[aeiou]/.test(b) ? 'An' : 'A'} ${b} tone near ${nTxt}, each wave ${w} long.`,
        `Close to ${nTxt} on a piano, with waves ${w} long in air.`,
        `Each wave of it stretches ${w} through the room.`
      ][k]);
      // Octave links to the solfeggio tones read better than bare numbers.
      const up = near(F * 2, 0.012), down = near(F / 2, 0.012);
      if (up) lines.push(`One octave below ${up.hz} is ${Math.round(up.hz / 2)} Hz, ${up.name} an octave down.`);
      else if (down) lines.push(`One octave above ${down.hz} is ${down.hz * 2} Hz, ${down.name} an octave up.`);
      else lines.push(F * 2 <= MAX ? `One octave up is ${F * 2} Hz.` : `One octave down is ${Math.round(F / 2)} Hz.`);
    }
    if (beat) lines.splice(2, 0, `In headphones, ${F} and ${F + beat} Hz meet as a ${beat} Hz beat in ${BEATS[beat]}.`);

    return {
      title,
      text: lines.slice(0, 3).join(' '),
      band: b[0].toUpperCase() + b.slice(1),
      note: n.name + (n.cents ? `, ${n.cents > 0 ? '+' : '−'}${Math.abs(n.cents)} cents` : ', in tune'),
      chakra: chakra(F),
      wave: w
    };
  }

  /* Moon visual */

  const moon = $('#moon');
  const shade = moon.querySelector('.shade'), glow = moon.querySelector('.glow'), dash = moon.querySelector('.dash');
  const ripples = Array.from(moon.querySelectorAll('.ripples circle'));
  const slider = $('#hz');
  let raf = 0, lv = 0, phase = 0, last = 0, on = false, seen = true;

  function frame(t) {
    raf = 0;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
    last = t;
    const raw = A.level();
    lv += (raw - lv) * (raw > lv ? 0.35 : 0.06);   // quick to rise, slow to settle
    phase += dt * (0.15 + lv * 0.9);
    shade.setAttribute('opacity', (0.9 - lv * 0.5).toFixed(3));
    glow.setAttribute('opacity', (lv * 0.45).toFixed(3));
    glow.style.transform = `scale(${(1 + lv * 0.3).toFixed(3)})`;
    dash.style.transform = `rotate(${(phase * 24).toFixed(2)}deg)`;
    ripples.forEach((c, i) => {
      const p = (phase + i / 3) % 1;
      c.setAttribute('r', (122 + p * 110).toFixed(1));   // from the disc edge to just past the button
      c.setAttribute('opacity', (lv * (1 - p) * 0.9).toFixed(3));
      c.setAttribute('stroke-width', (0.8 + lv * 2.4 * (1 - p)).toFixed(2));
    });
    slider.style.setProperty('--glow', lv.toFixed(3));
    if ((on || lv > 0.004) && !document.hidden && seen) raf = requestAnimationFrame(frame);
    else if (!on && lv <= 0.004) { lv = 0; last = 0; }
    else last = 0;
  }
  function wake() {
    if (!raf && !document.hidden && seen && !still.matches) raf = requestAnimationFrame(frame);
  }
  // Stop drawing while the moon is scrolled off screen; resume if sound is still going.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      seen = entries[entries.length - 1].isIntersecting;
      if (!seen) { cancelAnimationFrame(raf); raf = 0; last = 0; }
      else if (on || lv > 0.004) wake();
    }).observe(moon);
  }
  function applyMotion() { body.classList.toggle('still', still.matches); }
  applyMotion();
  if (still.addEventListener) still.addEventListener('change', applyMotion);

  window.addEventListener('moonaudio:sounding', e => { on = e.detail; if (on) wake(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; last = 0; }
    else if (on || lv > 0.004) wake();
  });

  // Tap the moon: a bowl at the fader's frequency.
  moon.addEventListener('click', () => {
    if (!canPlay) return;
    const f = Math.round(hz);
    A.strike(f < 150 ? 'himalayan' : 'crystal', { freq: f, gain: 0.55 });
    buzz(12);
    moon.classList.add('struck');
    setTimeout(() => moon.classList.remove('struck'), 120);
    wake();
  });

  /* Frequency Fader */

  const num = $('#hz-num'), playBtn = $('#play'), vol = $('#vol'), bin = $('#bin'), beatSel = $('#beat');
  const presets = Array.from(document.querySelectorAll('.presets .pill'));
  const out = { title: $('#r-title'), text: $('#r-text'), live: $('#r-live'), band: $('#f-band'), note: $('#f-note'), chakra: $('#f-chakra'), wave: $('#f-wave') };
  let hz = 528, tone = null, pending = 0, idle = 0;

  const volGain = () => Math.pow(vol.value / 100, 1.5) * 0.7;
  const beat = () => bin.checked ? +beatSel.value : 0;

  // rAF passes a timestamp, so scheduled renders announce; the first render stays quiet.
  function render(announce) {
    pending = 0;
    const d = describe(hz, beat());
    out.title.textContent = d.title;
    out.text.textContent = d.text;
    out.band.textContent = d.band;
    out.note.textContent = d.note;
    out.chakra.textContent = d.chakra;
    out.wave.textContent = d.wave;
    // Speak only once the hand has rested for 600 ms.
    clearTimeout(idle);
    if (announce !== false) idle = setTimeout(() => { out.live.textContent = d.title + '. ' + d.text; }, 600);
  }
  const schedule = () => { if (!pending) pending = requestAnimationFrame(render); };

  function setHz(f, from) {
    hz = clampHz(f);
    const F = Math.round(hz);
    if (from !== 'slider') slider.value = Math.round(toPos(hz));
    if (from !== 'num') num.value = F;
    slider.setAttribute('aria-valuetext', F + ' Hz');
    moon.setAttribute('aria-label', `Strike a bowl at ${F} Hz`);
    presets.forEach(p => p.setAttribute('aria-pressed', String(+p.dataset.hz === F)));
    if (tone) tone.setFreq(hz);
    schedule();
  }

  slider.addEventListener('input', () => setHz(toHz(+slider.value), 'slider'));
  slider.addEventListener('keydown', e => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    setHz(Math.round(hz) + step * (e.shiftKey ? 10 : 1));
  });
  num.addEventListener('input', () => {
    const v = parseFloat(num.value);
    if (v >= MIN && v <= MAX) setHz(v, 'num');
  });
  num.addEventListener('change', () => setHz(parseFloat(num.value) || hz));
  presets.forEach(p => p.addEventListener('click', () => setHz(+p.dataset.hz)));

  function startTone() {
    room.stop(1.2);
    tone = A.tone(hz, { gain: volGain(), binauralBeat: beat(), attack: 0.4 });
    playBtn.setAttribute('aria-pressed', 'true');
    buzz(8);
    wake();
  }
  function stopTone(fade) {
    if (!tone) return;
    tone.stop(fade == null ? 0.5 : fade);
    tone = null;
    playBtn.setAttribute('aria-pressed', 'false');
  }
  const fader = { stop: stopTone };

  playBtn.addEventListener('click', () => {
    if (!canPlay) return;
    if (tone) stopTone(); else startTone();
  });
  vol.addEventListener('input', () => { if (tone) tone.setGain(volGain()); });
  const onBeat = () => { if (tone) tone.setBinaural(beat()); schedule(); };
  bin.addEventListener('change', onBeat);
  beatSel.addEventListener('change', () => { if (!bin.checked) bin.checked = true; onBeat(); });

  /* Listening Room */

  const LABEL = { crystal: 'crystal bowl', himalayan: 'Himalayan bowl', gong: 'gong', chime: 'chimes', koshi: 'koshi chimes', ocean: 'ocean drum' };
  // drone: [freq, wave, gain]; layers: [kind, midi notes (pentatonic), gain, weight]
  const MOODS = {
    full: {
      line: 'Drone 108 Hz · crystal bowls · chimes on the breeze', gap: [6, 12],
      drone: [[108, 'triangle', 0.05], [216, 'sine', 0.018], [162, 'sine', 0.014]],
      layers: [['crystal', [57, 60, 62, 64, 67, 69], 0.45, 6], ['chime', [81, 84, 86, 88, 91], 0.35, 3], ['koshi', [72, 74, 76], 0.4, 1.5]]
    },
    new: {
      line: 'Drone 54 Hz · low gong swells · sparse', gap: [9, 14],
      drone: [[54, 'sine', 0.08], [81, 'triangle', 0.02]],
      layers: [['gong', [33, 36, 38, 40], 0.5, 3], ['himalayan', [45, 48, 50, 52], 0.4, 2], ['chime', [76, 79, 81], 0.18, 0.6]]
    },
    rest: {
      line: 'Drone 72 Hz · soft Himalayan bowls · ocean', gap: [10, 14],
      drone: [[72, 'sine', 0.06], [108, 'sine', 0.025]],
      layers: [['himalayan', [43, 45, 47, 50, 52], 0.32, 3], ['ocean', [0], 0.35, 2], ['crystal', [55, 57, 59], 0.22, 1]]
    }
  };

  const beginBtn = $('#begin'), timerSel = $('#timer'), countdown = $('#countdown'), moodLine = $('#mood-line'), nowText = $('#now-text');
  const moodBtns = Array.from(document.querySelectorAll('.mood'));

  const room = {
    playing: false, mood: 'full', drones: [], next: 0, lastStrike: 0, endAt: 0, clock: 0,

    start() {
      fader.stop(1.2);
      this.playing = true;
      this.droneUp();
      this.queue(900);
      this.arm();
      beginBtn.textContent = 'Stop listening';
      setNow('the drone rising');
      buzz(8);
      wake();
    },

    stop(fade) {
      if (!this.playing) return;
      const f = fade == null ? 1.5 : fade;
      this.playing = false;
      clearTimeout(this.next);
      this.drones.forEach(d => d.stop(f));
      this.drones = [];
      A.stopAll(f);
      this.disarm();
      beginBtn.textContent = 'Begin listening';
      setNow(f > 5 ? 'fading into silence' : 'silence');
    },

    droneUp() {
      this.drones = MOODS[this.mood].drone.map(([f, w, g]) => A.tone(f, { wave: w, gain: g, attack: 4 }));
    },

    setMood(key) {
      if (key === this.mood) return;
      this.mood = key;
      moodBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mood === key)));
      moodLine.textContent = MOODS[key].line;
      if (!this.playing) return;
      // Crossfade: old drone out over 3 s while the new one rises; struck bowls ring out.
      this.drones.forEach(d => d.stop(3));
      this.droneUp();
      clearTimeout(this.next);
      this.queue(1500);
    },

    queue(ms) {
      clearTimeout(this.next);
      this.next = setTimeout(() => this.tick(), ms);
    },

    tick() {
      if (!this.playing) return;
      const since = performance.now() - this.lastStrike;
      if (since < 2000) return this.queue(2000 - since);   // never two strikes within 2 s
      const m = MOODS[this.mood];
      const total = m.layers.reduce((s, l) => s + l[3], 0);
      let r = Math.random() * total, layer = m.layers[0];
      for (const l of m.layers) { if ((r -= l[3]) <= 0) { layer = l; break; } }
      const [kind, notes, gain] = layer, midi = pick(notes), pan = rand(-0.7, 0.7);
      A.strike(kind, { freq: midi ? midiHz(midi) : undefined, gain, pan });
      this.lastStrike = performance.now();
      const side = pan < -0.25 ? 'left' : pan > 0.25 ? 'right' : 'centre';
      setNow([LABEL[kind], midi ? noteName(midi) : '', side].filter(Boolean).join(', '));
      this.queue(rand(m.gap[0], m.gap[1]) * 1000);
    },

    // Sleep timer: counts down, then a long slow fade.
    arm() {
      this.disarm();
      const min = +timerSel.value;
      if (!min || !this.playing) return;
      this.endAt = Date.now() + min * 60000;
      const show = () => {
        const left = Math.max(0, this.endAt - Date.now());
        const s = Math.ceil(left / 1000);
        countdown.textContent = `Fades in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        if (left <= 0) this.stop(30);
      };
      show();
      this.clock = setInterval(show, 1000);
    },
    disarm() {
      clearInterval(this.clock);
      this.clock = 0;
      countdown.textContent = '';
    }
  };

  function setNow(t) { nowText.textContent = t; }

  beginBtn.addEventListener('click', () => {
    if (!canPlay) return;
    if (room.playing) room.stop(); else room.start();
  });
  moodBtns.forEach(b => b.addEventListener('click', () => room.setMood(b.dataset.mood)));
  timerSel.addEventListener('change', () => room.arm());

  if (!canPlay) {
    [playBtn, beginBtn, moon].forEach(b => { b.disabled = true; });
    setNow('this browser cannot play Web Audio');
  }

  /* Start state, with ?hz=NNN deep links */

  const q = parseFloat(new URLSearchParams(location.search).get('hz'));
  setHz(isFinite(q) ? q : 528);
  cancelAnimationFrame(pending);
  render(false);
  if (isFinite(q)) {
    window.addEventListener('load', () => {
      $('#fader').scrollIntoView({ behavior: still.matches ? 'auto' : 'smooth', block: 'start' });
    });
  }
})();
