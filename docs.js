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
})();
