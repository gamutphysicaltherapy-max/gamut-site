// The interactive parts of index.html and teams.html. Loaded after docs.js,
// which already handles the scroll reveals, the top bar's shadow, the
// download dock and the question form. Everything here is an enhancement:
// blocks that need it carry .js-only and are hidden when scripts are off.
//
// Every number and rule shown by the two demos is the app's own:
//  - the builder: block order and length by distance to the season
//    (src/lib/trainingBlock.ts), the day zones (BASE_RANGES in dupScheme.ts),
//    light weeks (DELOAD_WEEKS), and "recovery can ease a day but never adds
//    weight" (autoregulation.ts). Change one there, change it here.
//  - the team sizer: the four plan prices on teams.html and the yearly price
//    of one athlete's own subscription.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function money(n, cents) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  }

  // Phones lean toward the pointer. Resting pose comes from the stylesheet.
  if (hover && !reduce) {
    $$('.stage').forEach(function (stage) {
      var tilt = $('.tilt', stage);
      if (!tilt) return;
      stage.addEventListener('pointermove', function (e) {
        if (window.innerWidth <= 980) return;
        var r = stage.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        tilt.classList.add('live');
        tilt.style.setProperty('--ry', (x * 22).toFixed(2));
        tilt.style.setProperty('--rx', (-y * 14).toFixed(2));
      });
      stage.addEventListener('pointerleave', function () {
        tilt.classList.remove('live');
        tilt.style.removeProperty('--ry');
        tilt.style.removeProperty('--rx');
      });
    });
    // Tiles light up under the pointer.
    $$('.spot').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  // Sliders paint their own filled track.
  function paint(range) {
    var p = (range.value - range.min) / (range.max - range.min) * 100;
    range.style.setProperty('--p', p + '%');
  }

  // The showcase: the step nearest the middle of the screen picks the phone's screen.
  $$('.show').forEach(function (show) {
    var steps = $$('.step', show);
    var shots = $$('.show-stage .screens img', show);
    var rail = $$('.show-stage .rail i', show);
    function pick(i) {
      steps.forEach(function (s, n) { s.classList.toggle('on', n === i); });
      shots.forEach(function (s, n) { s.classList.toggle('on', n === i); });
      rail.forEach(function (s, n) { s.classList.toggle('on', n === i); });
    }
    pick(0);
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) pick(steps.indexOf(e.target)); });
    }, { rootMargin: '-48% 0px -48% 0px' });
    steps.forEach(function (s) { io.observe(s); });
  });

  // ---------- index.html: the builder ----------
  var lab = $('#lab');
  if (lab) {
    var TIER = { d: { h: 20, c: '#4c5b40' }, h: { h: 50, c: '#6f8560' }, s: { h: 70, c: '#9db08e' }, p: { h: 88, c: '#dde7d3' } };
    var LIGHT = { 8: [4, 8], 6: [4, 6], 4: [4] };
    var PHASES = {
      off: {
        phase: 'Off-season', title: 'Muscle block', weeks: 8, rot: 'hshh', day: 'Hypertrophy day',
        zone: '3–4 sets of 8–12 reps, at 67–75% of your max',
        why: 'Your season is months away. This is the time to build size and strength.'
      },
      runway: {
        phase: 'About 12 weeks out', title: 'Strength block', weeks: 6, rot: 'shsp', day: 'Strength day',
        zone: '3–5 sets of 3–6 reps, at 80–90% of your max',
        why: 'Close enough to count. Strength comes first, so there is something to turn into power.'
      },
      pre: {
        phase: 'Pre-season', title: 'Power block', weeks: 4, rot: 'psph', day: 'Power day',
        zone: '3–5 sets of 2–4 reps, at 55–66% of your max, moved fast',
        why: 'Games are close. The strength you built turns into power.'
      },
      'in': {
        phase: 'In season', title: 'Maintain block', weeks: 4, rot: 'psph', day: 'Power day',
        zone: '3–5 sets of 2–4 reps, at 55–66% of your max, moved fast',
        why: 'Games come first. Short blocks hold what you built on less work, with one less exercise each day.'
      }
    };
    var SPRINT = { Football: 1, Soccer: 1, Basketball: 1, Baseball: 1, 'Track & Field': 1, Lacrosse: 1 };
    var state = { sport: 'Soccer', phase: 'pre', rec: 78 };
    var out = {
      phase: $('#b-phase'), title: $('#b-title'), why: $('#b-why'), bars: $('#b-bars'), labels: $('#b-labels'),
      day: $('#b-day'), zone: $('#b-zone'), adj: $('#b-adj'), ring: $('#b-ring'), val: $('#b-val'), word: $('#b-word')
    };
    var range = $('#b-rec');
    var TODAY = 4; // week 2, day 1

    function swap(el, html) {
      if (el.innerHTML === html) return;
      el.innerHTML = html;
      el.classList.remove('swap');
      void el.offsetWidth;
      el.classList.add('swap');
    }
    function renderBlock() {
      var p = PHASES[state.phase];
      var why = p.why;
      if (state.phase === 'pre' && SPRINT[state.sport]) {
        why += ' ' + state.sport + ' is a sprint sport, so a speed block follows when there is time.';
      }
      swap(out.phase, p.phase + ' · ' + state.sport);
      swap(out.title, p.title);
      swap(out.why, why);
      swap(out.day, 'Today · ' + p.day);
      swap(out.zone, p.zone);
      var bars = '', labels = '', n = 0, wave = 0;
      for (var w = 1; w <= p.weeks; w++) {
        var light = LIGHT[p.weeks].indexOf(w) !== -1;
        bars += '<div class="wk">';
        for (var d = 0; d < 4; d++) {
          var t = TIER[light ? 'd' : p.rot.charAt(d)];
          var h = light ? t.h : Math.min(100, t.h + wave * 4);
          bars += '<i' + (n === TODAY ? ' class="today"' : '') + ' data-h="' + h + '" data-c="' + t.c + '" style="--h:' + h +
            ';--c:' + t.c + ';--n:' + n + ';--o:' + (n < TODAY ? 1 : 0.4) + '"></i>';
          n++;
        }
        bars += '</div>';
        labels += '<span' + (light ? ' class="light"' : '') + '>' + (light ? 'Light' : 'W' + w) + '</span>';
        wave = light ? 0 : wave + 1;
      }
      out.bars.innerHTML = bars;
      out.labels.innerHTML = labels;
      renderRecovery();
    }
    function renderRecovery() {
      var v = +range.value;
      state.rec = v;
      paint(range);
      var low = v < 34, high = v >= 67;
      var color = low ? 'var(--ember)' : high ? 'var(--sage)' : 'var(--amber)';
      range.style.setProperty('--fill', color);
      out.ring.style.setProperty('--v', v);
      out.ring.style.setProperty('--ring', color);
      out.val.textContent = v;
      out.word.textContent = low ? 'Run down' : high ? 'Fresh' : 'OK';
      out.adj.classList.toggle('eased', low);
      var text = low
        ? '<strong>Eased.</strong> Sleep and heart rate are well off your normal, so today’s weights come down.'
        : high
          ? '<strong>As planned.</strong> A good night never adds weight by itself. Your logged sets do that.'
          : '<strong>As planned.</strong> Nothing in your recovery says to change today.';
      if (out.adj.innerHTML !== text) out.adj.innerHTML = text;
      var today = $('.today', out.bars);
      if (today) {
        today.style.setProperty('--h', low ? Math.round(today.getAttribute('data-h') * 0.86) : today.getAttribute('data-h'));
        today.style.setProperty('--c', low ? '#dc8d62' : today.getAttribute('data-c'));
      }
    }
    function group(sel, key) {
      var buttons = $$(sel + ' button', lab);
      buttons.forEach(function (b) {
        b.addEventListener('click', function () {
          state[key] = b.getAttribute('data-v');
          buttons.forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
          renderBlock();
        });
      });
    }
    group('#b-sports', 'sport');
    group('#b-phases', 'phase');
    range.addEventListener('input', renderRecovery);
    renderBlock();
  }

  // ---------- teams.html: the size picker ----------
  var sizer = $('#sizer');
  if (sizer) {
    var SOLO_YEAR = 249.99;
    var plans = $$('.plan[data-size]').map(function (el) {
      return { el: el, size: +el.getAttribute('data-size'), price: +el.getAttribute('data-price'), href: $('a', el).getAttribute('href') };
    });
    var sRange = $('#s-range');
    var s = { count: $('#s-count'), fit: $('#s-fit'), total: $('#s-total'), each: $('#s-each'), solo: $('#s-solo'), team: $('#s-team'), teamBar: $('#s-team-bar'), go: $('#s-go'), goText: $('#s-go-text') };
    function renderSize() {
      var n = +sRange.value;
      paint(sRange);
      var plan = plans.filter(function (p) { return p.size >= n; })[0] || plans[plans.length - 1];
      var solo = n * SOLO_YEAR;
      s.count.textContent = n;
      s.fit.textContent = 'Best fit: the ' + plan.size + '-player plan';
      s.total.innerHTML = money(plan.price) + '<small> /year</small>';
      s.each.innerHTML = '<b>' + money(plan.price / n / 12, true) + '</b> a player each month';
      s.solo.textContent = money(solo, true);
      s.team.textContent = money(plan.price);
      s.teamBar.style.setProperty('--w', Math.max(2, plan.price / solo * 100).toFixed(1));
      s.go.setAttribute('href', plan.href);
      s.goText.textContent = 'Pick ' + plan.size;
      plans.forEach(function (p) { p.el.classList.toggle('match', p === plan); });
    }
    sRange.addEventListener('input', renderSize);
    renderSize();
  }

  // ---------- teams.html: the sample roster ----------
  var roster = $('#roster');
  if (roster) {
    var STATUS = {
      over: { label: 'Overloaded', c: 'var(--red)' },
      under: { label: 'Underprepared', c: 'var(--amber)' },
      ok: { label: 'On track', c: 'var(--sage)' }
    };
    var PLAYERS = [
      { n: 'Isaiah Cole', s: 'over', why: 'Load spike this week', at: 90 },
      { n: 'Riley Ortiz', s: 'over', why: 'Hard efforts all week', at: 80 },
      { n: 'Sofia Marquez', s: 'under', why: 'Behind on sessions', at: 12 },
      { n: 'Luke Hensley', s: 'under', why: 'Light load', at: 20 },
      { n: 'Amara Diallo', s: 'ok', why: 'Trained today', at: 52 },
      { n: 'Marcus Reed', s: 'ok', why: 'Trained today', at: 44 },
      { n: 'Jordan Reyes', s: 'ok', why: 'Trained yesterday', at: 60 },
      { n: 'Maya Okafor', s: 'ok', why: 'Trained yesterday', at: 38 }
    ];
    var rows = $('#r-rows');
    var bar = $('#r-bar');
    var chips = $$('#r-chips button');
    function renderRoster(filter) {
      var n = 0;
      rows.innerHTML = PLAYERS.filter(function (p) { return filter === 'all' || p.s === filter; }).map(function (p) {
        var st = STATUS[p.s];
        var initials = p.n.split(' ').map(function (w) { return w.charAt(0); }).join('');
        return '<li class="prow" style="--n:' + (n++) + ';--rail:' + (p.s === 'ok' ? 'transparent' : st.c) + '">' +
          '<span class="av" aria-hidden="true">' + initials + '</span>' +
          '<span class="who"><b>' + p.n + '</b><span style="--c:' + (p.s === 'ok' ? 'var(--muted)' : st.c) + '">' + p.why + '</span></span>' +
          '<span class="load"><span class="gauge" role="img" aria-label="Load against their usual"><i style="--at:' + p.at + '"></i></span>' +
          '<span class="gauge-cap">Last 7 days against their usual</span></span>' +
          '<span class="badge" style="--c:' + st.c + '">' + st.label + '</span></li>';
      }).join('');
      bar.classList.toggle('filtered', filter !== 'all');
      $$('i', bar).forEach(function (i) { i.classList.toggle('on', i.getAttribute('data-s') === filter); });
    }
    chips.forEach(function (b) {
      b.addEventListener('click', function () {
        chips.forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        renderRoster(b.getAttribute('data-v'));
      });
    });
    renderRoster('all');
  }
})();
