// Session builder: writes a friendly message, sends it by text, email or Instagram
(function () {
  var form = document.getElementById('builder');
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };
  var typeEl = $('f-type'), peopleEl = $('f-people'), d1 = $('f-d1'), d2 = $('f-d2');
  var noteEl = $('f-note'), nameEl = $('f-name'), preview = $('preview');
  var sms = $('act-sms'), mail = $('act-mail'), ig = $('act-ig'), copyBtn = $('act-copy'), toast = $('toast');
  var KEY = 'tmm-session-draft';
  var PHONE = '+16478074751';
  var EMAIL = 'purnima@themoonmedium.ca';

  var TYPES = {
    therapy: 'a 1:1 sound therapy session',
    group: 'a group sound bath',
    aerial: 'an aerial sound bath',
    bowls: 'a beginner singing bowl lesson',
    learn: 'the fundamentals of sound healing course',
    naad: 'a Naad voice and mantra lesson',
    gift: 'a gift card for a private soundbath'
  };
  // older links used "series" for the course
  var ALIAS = { series: 'learn' };
  var FORMATS = {
    local: 'in person in Windsor-Essex',
    venue: 'at my venue'
  };

  function list(a) {
    if (a.length < 2) return a.join('');
    return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  }
  function niceDate(v) {
    if (!v) return '';
    var d = new Date(v + 'T12:00:00');
    if (isNaN(d)) return v;
    return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function checked(name) {
    return [].slice.call(form.querySelectorAll('input[name="' + name + '"]:checked')).map(function (i) { return i.value; });
  }

  function compose() {
    var name = nameEl.value.trim();
    var type = TYPES[typeEl.value];
    var n = Math.min(99, Math.max(1, parseInt(peopleEl.value, 10) || 1));
    var fmt = FORMATS[checked('format')[0]] || '';
    var gift = typeEl.value === 'gift';
    // aerial baths happen where the silks are rigged, so no venue line; a gift has no venue yet
    if (typeEl.value === 'aerial' || gift) fmt = '';
    // a group of one reads oddly, so leave the count to Purnima
    var who = typeEl.value === 'group' && n === 1 ? ' for a group' : ' for ' + n + (n === 1 ? ' person' : ' people');
    // 1:1 is one person by definition
    if (typeEl.value === 'therapy') who = '';
    // a gift card for one needs no count
    if (typeEl.value === 'gift' && n === 1) who = '';
    var play = typeEl.value === 'naad' ? 'learn to use my voice' : 'learn to play';
    var wants = checked('intent');
    var learn = wants.indexOf('learn') > -1;
    var helps = wants.filter(function (w) { return w !== 'learn'; });
    var dates = [niceDate(d1.value), niceDate(d2.value)].filter(Boolean);
    var note = noteEl.value.trim();

    var out = ['Hi Purnima,'];
    var line = name ? 'my name is ' + name + '. ' : '';
    line += 'I would love to ' + (gift ? 'buy ' : 'book ') + (type || 'a session') + who;
    out[0] += ' ' + line + (fmt ? (who ? ', ' : ' ') + fmt : '') + '.';
    if (helps.length) out.push('I am hoping it can help with ' + list(helps) + '.');
    if (learn) out.push(helps.length ? 'I would also love to ' + play + '.' : 'I would really love to ' + play + '.');
    if (dates.length === 1) out.push(dates[0] + ' would suit me well.');
    if (dates.length === 2) out.push(dates[0] + ' or ' + dates[1] + ' would suit me well.');
    if (!dates.length && !gift) out.push('Could you let me know which dates you have open?');
    if (note) out.push(/[.!?]$/.test(note) ? note : note + '.');
    out.push('Thank you' + (name ? ', ' + name : '') + '.');
    return out.join(' ');
  }

  // live preview with a soft fade
  var fadeT;
  function mailHref(msg) {
    var t = TYPES[typeEl.value];
    var subj = t ? 'Booking: ' + t.replace(/^(a|an|the) /, '') : 'Booking a session';
    return 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(msg);
  }
  function links(msg) {
    sms.href = 'sms:' + PHONE + '?&body=' + encodeURIComponent(msg);
    mail.href = mailHref(msg);
  }
  function render() {
    var msg = compose();
    links(msg);
    if (preview.textContent === msg) return;
    if (!preview.textContent) { preview.textContent = msg; return; }
    preview.classList.add('fade');
    clearTimeout(fadeT);
    fadeT = setTimeout(function () {
      preview.textContent = compose();
      preview.classList.remove('fade');
    }, 160);
  }

  // chip pills mirror their input state
  function syncChips() {
    form.querySelectorAll('.l-chip').forEach(function (l) {
      var i = l.querySelector('input');
      l.classList.toggle('is-on', !!(i && i.checked));
    });
  }

  // a soft chime per chip, once audio is unlocked by the tap itself
  var NOTES = [528, 594, 660, 792, 880, 990, 1056, 1188, 1320, 1584];
  function chime(label, on) {
    var A = window.MoonAudio;
    if (!A) return;
    var idx = [].indexOf.call(form.querySelectorAll('.l-chip'), label);
    var f = NOTES[idx % NOTES.length] * (on ? 1 : 0.75);
    A.unlock().then(function () { A.strike('chime', { freq: f, gain: 0.12 }); }).catch(function () {});
    label.classList.remove('ping'); void label.offsetWidth; label.classList.add('ping');
  }

  // draft memory
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        type: typeEl.value, people: peopleEl.value, format: checked('format')[0],
        d1: d1.value, d2: d2.value, intent: checked('intent'), note: noteEl.value, name: nameEl.value
      }));
    } catch (e) {}
  }
  function restore() {
    var d;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
    if (!d) return;
    var dt = ALIAS[d.type] || d.type;
    if (dt && TYPES[dt]) typeEl.value = dt;
    if (d.people) peopleEl.value = d.people;
    if (d.d1) d1.value = d.d1;
    if (d.d2) d2.value = d.d2;
    if (d.note) noteEl.value = d.note;
    if (d.name) nameEl.value = d.name;
    var f = FORMATS[d.format] ? d.format : 'local';
    form.querySelectorAll('input[name="format"]').forEach(function (i) { i.checked = i.value === f; });
    // reopen "More details" if the draft has something tucked inside it
    if (d.d1 || d.d2 || d.note || f !== 'local') $('more').open = true;
    form.querySelectorAll('input[name="intent"]').forEach(function (i) { i.checked = (d.intent || []).indexOf(i.value) > -1; });
  }

  function setType(t) {
    t = ALIAS[t] || t;
    if (!TYPES[t]) return false;
    typeEl.value = t;
    clearErr(typeEl);
    return true;
  }

  // validation
  function setErr(el, msg) {
    el.setAttribute('aria-invalid', 'true');
    $('err-' + el.name).textContent = msg;
  }
  function clearErr(el) {
    el.removeAttribute('aria-invalid');
    var e = $('err-' + el.name); if (e) e.textContent = '';
  }
  function valid() {
    var ok = true, first = null;
    if (!typeEl.value) { setErr(typeEl, 'Choose a session type.'); ok = false; first = typeEl; }
    if (!nameEl.value.trim()) { setErr(nameEl, 'Add your name so Purnima knows who is writing.'); ok = false; first = first || nameEl; }
    if (!ok) { show('Add your name and a session type first', true); first.focus(); }
    return ok;
  }

  var toastT;
  function show(msg, warn) {
    toast.textContent = msg;
    toast.classList.toggle('warn', !!warn);
    toast.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toast.classList.remove('show'); }, 3600);
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }
  function legacyCopy(text) {
    return new Promise(function (res, rej) {
      var t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', '');
      t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(t);
      ok ? res() : rej();
    });
  }

  // wiring
  form.addEventListener('input', function (e) {
    if (e.target.getAttribute('aria-invalid')) clearErr(e.target);
    render(); save();
  });
  form.addEventListener('change', function (e) {
    var label = e.target.closest('.l-chip');
    if (label) { syncChips(); chime(label, e.target.checked); }
    render(); save();
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  sms.addEventListener('click', function (e) {
    if (!valid()) { e.preventDefault(); return; }
    sms.href = 'sms:' + PHONE + '?&body=' + encodeURIComponent(compose());
  });
  mail.addEventListener('click', function (e) {
    if (!valid()) { e.preventDefault(); return; }
    mail.href = mailHref(compose());
  });
  ig.addEventListener('click', function (e) {
    if (!valid()) { e.preventDefault(); return; }
    copy(compose()).then(function () { show('Message copied, paste it in the chat'); },
      function () { show('Copy did not work, select the message and copy it', true); });
  });
  copyBtn.addEventListener('click', function () {
    if (!valid()) return;
    copy(compose()).then(function () { show('Message copied'); },
      function () { show('Copy did not work, select the message and copy it', true); });
  });

  // "Choose this" on a card fills the form without a reload
  document.querySelectorAll('.l-choose[data-type]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      setType(a.dataset.type);
      try { history.replaceState(null, '', '?type=' + a.dataset.type + '#build'); } catch (err) {}
      syncChips(); render(); save();
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      $('build').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      typeEl.focus({ preventScroll: true });
    });
  });

  restore();
  var q = new URLSearchParams(location.search).get('type');
  if (q) setType(q.toLowerCase());
  syncChips();
  preview.textContent = compose();
  links(preview.textContent);
})();
