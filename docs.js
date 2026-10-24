// Shared by index.html, privacy.html, terms.html and support.html. Everything
// here is an enhancement: with scripts off the pages are complete and static
// (nothing is hidden, because the motion styles only apply under html.js).
(function () {
  // Blocks marked .reveal fade up once as they scroll into view.
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  // The top bar picks up a soft shadow once the page has scrolled.
  var bar = document.querySelector('.topbar');
  var ticking = false;
  function onScroll() {
    ticking = false;
    if (bar) bar.classList.toggle('scrolled', window.scrollY > 8);
    if (spy) spy();
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }, { passive: true });

  var spy = null;
  var toc = document.querySelector('details.toc');
  if (toc) {
    // On a phone the contents sit above the text, so they start closed. A
    // tap on an entry closes them again after jumping.
    var narrow = window.matchMedia('(max-width: 980px)');
    var fit = function () { toc.open = !narrow.matches; };
    fit();
    if (narrow.addEventListener) narrow.addEventListener('change', fit);
    toc.addEventListener('click', function (e) {
      if (e.target.closest('a') && narrow.matches) toc.open = false;
    });

    // Highlight the section being read: the last heading above the top third.
    var links = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
    var targets = links
      .map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); })
      .filter(Boolean);
    if (targets.length) {
      spy = function () {
        var line = window.innerHeight * 0.33;
        var current = targets[0];
        for (var i = 0; i < targets.length; i++) {
          if (targets[i].getBoundingClientRect().top <= line) current = targets[i];
        }
        links.forEach(function (a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + current.id);
        });
      };
    }
  }
  onScroll();

  // index.html: the download dock shows while none of the page's own
  // download buttons ([data-cta]) is on screen, and never before the visitor
  // has scrolled past the first one.
  var dock = document.querySelector('.dock');
  var ctas = document.querySelectorAll('[data-cta]');
  if (dock && ctas.length && 'IntersectionObserver' in window) {
    var visible = new Set();
    var passedFirst = false;
    var dockIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) visible.add(e.target);
        else {
          visible.delete(e.target);
          if (e.target === ctas[0] && e.boundingClientRect.top < 0) passedFirst = true;
        }
        if (e.target === ctas[0] && e.isIntersecting) passedFirst = false;
      });
      dock.classList.toggle('show', passedFirst && visible.size === 0);
    });
    ctas.forEach(function (el) { dockIo.observe(el); });
  }

  // form[data-lead]: "have a question?" → public.submit_site_lead.
  document.querySelectorAll('form[data-lead]').forEach(function (form) {
    var status = form.querySelector('.lead-status');
    var button = form.querySelector('button[type="submit"]');
    var say = function (text, isError) {
      status.textContent = text;
      status.classList.toggle('error', !!isError);
    };
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var thanks = function () {
        form.innerHTML = '<div class="lead-done"><div class="tick" aria-hidden="true"></div>' +
          '<h3>Thanks, we got it.</h3><p>We\'ll reply to your email soon.</p></div>';
        form.querySelector('h3').setAttribute('tabindex', '-1');
        form.querySelector('h3').focus();
      };
      // The bot trap: pretend it worked and send nothing.
      if (data.get('website')) { thanks(); return; }
      var email = String(data.get('email') || '').trim();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      button.disabled = true;
      say('Sending…');
      fetch(form.getAttribute('data-endpoint'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: form.getAttribute('data-key') },
        body: JSON.stringify({
          p_email: email,
          p_role: data.get('role') || 'other',
          p_message: String(data.get('message') || '').trim() || null,
          p_wants_updates: data.get('updates') === 'on',
          p_source: form.getAttribute('data-source') || 'site'
        })
      })
        .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
        .then(function (result) {
          if (result === 'ok') {
            // stats.js counts it; the bot trap above never gets here.
            document.dispatchEvent(new CustomEvent('gamut:lead', {
              detail: { source: form.getAttribute('data-source') || 'site' }
            }));
            return thanks();
          }
          button.disabled = false;
          if (result === 'invalid') say('That email doesn\'t look right. Check it and try again.', true);
          else say('Too many messages from here today. Email support@gamutapp.com instead.', true);
        })
        .catch(function () {
          button.disabled = false;
          say('Couldn\'t send that. Check your connection, or email support@gamutapp.com.', true);
        });
    });
  });
})();
