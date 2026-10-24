// Site analytics, on every page. No cookies, nothing stored on the visitor's
// device, nothing sent to a third party: events go to our own database
// (supabase/migrations/20261028120000_site_analytics.sql explains what the
// server keeps), and studio/site-analytics/report.mjs reads them back.
//
// Events: a view when the page opens; clicks on links that matter (the App
// Store, Teams, checkout, email); a sent question form; and on leaving, how
// long the page was actively read, how far it was scrolled and which
// sections were seen. Only the path is ever sent, never a query string
// (join.html carries a team code there), apart from utm_* tags.
//
// ?notrack=1 opts this browser out, so our own visits don't count, and
// ?notrack=0 opts back in. That flag is the one thing ever stored, and only
// when asked for.
(function () {
  var URL_ = 'https://iuskxozkymrifvbpnazh.supabase.co/rest/v1/rpc/track_site_event' +
    '?apikey=sb_publishable_AJnftw7P7gLBGG9rgD44pA_AhOlF1to';
  var IDLE_MS = 30000;

  var query = new URLSearchParams(window.location.search);
  try {
    if (query.get('notrack') === '1') window.localStorage.setItem('gamut:notrack', '1');
    if (query.get('notrack') === '0') window.localStorage.removeItem('gamut:notrack');
    if (window.localStorage.getItem('gamut:notrack') === '1') return;
  } catch (e) { /* storage blocked: count the visit */ }
  if (window.location.protocol === 'file:' || /^(localhost|127\.|\[::1\])/.test(window.location.hostname)) return;
  if (!window.fetch) return;

  var pageId = (Math.random().toString(36).slice(2, 10) + Date.now().toString(36)).replace(/[^a-z0-9]/g, '');
  var path = window.location.pathname.replace(/^\/gamut-site/, '').replace(/index\.html$/, '') || '/';

  // A text/plain POST with no custom headers needs no CORS preflight, so it
  // can go no-cors (the response is never read) with keepalive. Credentials
  // are omitted so no cookie is sent or stored (navigator.sendBeacon can't
  // omit them).
  function send(event) {
    event.id = pageId;
    try {
      window.fetch(URL_, {
        method: 'POST',
        body: JSON.stringify(event),
        headers: { 'Content-Type': 'text/plain' },
        credentials: 'omit',
        keepalive: true,
        mode: 'no-cors'
      }).catch(function () {});
    } catch (e) { /* never break the page */ }
  }

  // The view.
  var referrer = '';
  try {
    var ref = new URL(document.referrer);
    if (ref.host !== window.location.host) referrer = ref.host;
  } catch (e) { /* none */ }
  var adClick = query.get('fbclid') ? 'meta'
    : (query.get('gclid') || query.get('gbraid') || query.get('wbraid')) ? 'google'
    : query.get('ttclid') ? 'tiktok' : '';
  send({
    k: 'view',
    p: path,
    r: referrer,
    us: query.get('utm_source') || '',
    um: query.get('utm_medium') || '',
    uc: query.get('utm_campaign') || '',
    ux: query.get('utm_content') || '',
    ut: query.get('utm_term') || '',
    ad: adClick,
    w: window.innerWidth,
    t: navigator.maxTouchPoints > 1 ? '1' : '0',
    l: navigator.language || ''
  });

  // Active time: the page is visible and there was input in the last 30 s.
  var engaged = 0;
  var activeSince = null;
  var idleTimer = null;
  var lastPoke = 0;
  function stop() {
    if (activeSince !== null) { engaged += Date.now() - activeSince; activeSince = null; }
    clearTimeout(idleTimer);
  }
  function poke() {
    if (document.visibilityState !== 'visible') return;
    var now = Date.now();
    if (activeSince === null) activeSince = now;
    if (now - lastPoke < 1000) return;
    lastPoke = now;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(stop, IDLE_MS);
  }
  ['scroll', 'pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'].forEach(function (type) {
    window.addEventListener(type, poke, { passive: true });
  });
  poke();

  // Scroll depth: the furthest the bottom of the screen got, as a share of the page.
  var maxScroll = 0;
  function measureScroll() {
    var doc = document.documentElement;
    var height = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
    var seen = height > 0 ? Math.round(100 * (window.scrollY + window.innerHeight) / height) : 100;
    if (seen > maxScroll) maxScroll = Math.min(100, seen);
  }
  window.addEventListener('scroll', measureScroll, { passive: true });
  window.addEventListener('load', measureScroll);
  measureScroll();

  // Sections seen: a section counts once it crosses the middle of the screen.
  var seenSections = {};
  if ('IntersectionObserver' in window) {
    var sectionIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var key = e.target.id || e.target.getAttribute('aria-labelledby');
        if (key) seenSections[key] = true;
        sectionIo.unobserve(e.target);
      });
    }, { rootMargin: '-40% 0px -40% 0px' });
    document.querySelectorAll('main section, main > [id]').forEach(function (el) {
      if (el.id || el.getAttribute('aria-labelledby')) sectionIo.observe(el);
    });
  }

  // The reading summary ("leave"), always running totals (the report keeps
  // the largest) and skipped when nothing changed. A request made while a
  // page unloads for a navigation is often dropped (sendBeacon's too), so it
  // isn't left to the last moment: it is also sent just before a tracked
  // link is followed, and as a heartbeat at 10 s, 30 s and 60 s of active
  // reading and every minute after. Hiding the page (switching apps, closing
  // the tab) sends it as well.
  var lastSent = '';
  var nextBeat = 10000;
  setInterval(function () {
    var running = engaged + (activeSince !== null ? Date.now() - activeSince : 0);
    if (running < nextBeat) return;
    nextBeat = nextBeat < 30000 ? 30000 : nextBeat < 60000 ? 60000 : nextBeat + 60000;
    leave();
  }, 5000);
  function leave() {
    var running = engaged + (activeSince !== null ? Date.now() - activeSince : 0);
    measureScroll();
    var event = { k: 'leave', p: path, e: running, s: maxScroll, sec: Object.keys(seenSections).slice(0, 20) };
    var summary = Math.round(running / 1000) + '|' + maxScroll + '|' + event.sec.length;
    if (summary === lastSent) return;
    lastSent = summary;
    send(event);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { stop(); leave(); } else { poke(); }
  });
  window.addEventListener('pagehide', function () { stop(); leave(); });

  // Clicks, named "what@where": app_store@title, teams@nav, team_checkout@plans.
  function linkKind(a) {
    var href = a.getAttribute('href') || '';
    if (/apps\.apple\.com/.test(href)) return 'app_store';
    if (/buy\.stripe\.com|checkout\.stripe\.com/.test(href)) return 'team_checkout';
    if (/^mailto:/.test(href)) return 'email';
    if (/^gamut:/.test(href)) return 'open_app';
    if (/(^|\/)teams\.html/.test(href)) return 'teams';
    if (/(^|\/)support\.html/.test(href)) return 'support';
    if (/(^|\/)(privacy|terms)\.html/.test(href)) return 'legal';
    if (/(^|\/)index\.html$|^\.\/?$/.test(href)) return 'home';
    if (href.charAt(0) === '#') return 'jump';
    if (/^https?:/.test(href)) {
      try { return 'out:' + new URL(href).host.replace(/^www\./, '').slice(0, 40); } catch (e) { return 'out'; }
    }
    return '';
  }
  function areaOf(el) {
    if (el.closest('.topbar, header')) return 'nav';
    if (el.closest('.dock, #dock')) return 'dock';
    if (el.closest('footer')) return 'footer';
    var section = el.closest('section, [id]');
    var key = section && (section.id || section.getAttribute('aria-labelledby'));
    return key ? key.slice(0, 30) : 'page';
  }
  document.addEventListener('click', function (event) {
    var a = event.target.closest && event.target.closest('a[href]');
    if (!a) return;
    var kind = linkKind(a);
    if (!kind) return;
    send({ k: 'click', p: path, tg: (kind + '@' + areaOf(a)).replace(/[^A-Za-z0-9_.:@\/-]/g, '').slice(0, 60) });
    if (kind !== 'jump') leave();
  }, true);

  // docs.js fires this once a question form really sent.
  document.addEventListener('gamut:lead', function (event) {
    var source = (event.detail && event.detail.source) || 'site';
    send({ k: 'click', p: path, tg: ('lead@' + source).replace(/[^A-Za-z0-9_.:@\/-]/g, '').slice(0, 60) });
  });
})();
