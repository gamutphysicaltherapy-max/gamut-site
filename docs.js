// Shared by privacy.html, terms.html and support.html. Everything here is an
// enhancement: with scripts off the contents list is simply open and static.
(function () {
  var toc = document.querySelector('details.toc');
  if (!toc) return;

  // On a phone the contents sit above the text, so they start closed. A
  // tap on an entry closes them again after jumping.
  var narrow = window.matchMedia('(max-width: 980px)');
  function fit() { toc.open = !narrow.matches; }
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
  if (!targets.length) return;
  var ticking = false;
  function update() {
    ticking = false;
    var line = window.innerHeight * 0.33;
    var current = targets[0];
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].getBoundingClientRect().top <= line) current = targets[i];
    }
    links.forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + current.id);
    });
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();
