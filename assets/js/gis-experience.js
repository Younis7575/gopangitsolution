/* ==========================================================================
   Gopang IT Solution — Experience layer
   Canvas 3D hero ecosystem, parallax stage, magnetic CTAs, card depth,
   scroll progress and the process timeline. Zero dependencies, guarded so
   every effect degrades to static content (no-JS, reduced motion, mobile).
   ========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

  /* The template sizes <body> at height:100%; fall back to its scrollTop when
     the viewport is not the scroller (older cached stylesheets). */
  function scrollY() {
    return window.scrollY || window.pageYOffset ||
      (document.documentElement && document.documentElement.scrollTop) ||
      (document.body && document.body.scrollTop) || 0;
  }

  /* ----------------------------------------------------------------------
     Skip link (inner pages) + scroll progress bar
     ---------------------------------------------------------------------- */
  function initA11yHelpers() {
    if (!document.querySelector('.gis-skip-link') && document.getElementById('main-content')) {
      var skip = document.createElement('a');
      skip.className = 'gis-skip-link';
      skip.href = '#main-content';
      skip.textContent = 'Skip to main content';
      document.body.insertBefore(skip, document.body.firstChild);
    }

    var bar = document.createElement('div');
    bar.className = 'gis-scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);

    var ticking = false;
    function update() {
      var doc = document.documentElement;
      var max = (doc.scrollHeight - window.innerHeight) || 1;
      bar.style.width = clamp((scrollY() / max) * 100, 0, 100).toFixed(2) + '%';
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ----------------------------------------------------------------------
     Magnetic CTA buttons
     ---------------------------------------------------------------------- */
  function initMagnetic() {
    if (reduced || !finePointer) return;
    var els = document.querySelectorAll('.gis-magnetic');
    els.forEach(function (el) {
      var strength = el.classList.contains('theme-btn-sm') ? 0.28 : 0.34;
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) * strength;
        var dy = (e.clientY - (r.top + r.height / 2)) * strength;
        el.style.setProperty('--gis-mx', dx.toFixed(1) + 'px');
        el.style.setProperty('--gis-my', dy.toFixed(1) + 'px');
      });
      el.addEventListener('pointerleave', function () {
        el.style.setProperty('--gis-mx', '0px');
        el.style.setProperty('--gis-my', '0px');
      });
      el.addEventListener('blur', function () {
        el.style.setProperty('--gis-mx', '0px');
        el.style.setProperty('--gis-my', '0px');
      });
    });
  }

  /* ----------------------------------------------------------------------
     3D card tilt + pointer glow
     ---------------------------------------------------------------------- */
  function initTilt() {
    if (reduced || !finePointer) return;

    var tiltEls = document.querySelectorAll('[data-gis-tilt]');
    tiltEls.forEach(function (el) {
      var maxTilt = 7;
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var px = clamp((e.clientX - r.left) / r.width, 0, 1);
        var py = clamp((e.clientY - r.top) / r.height, 0, 1);
        el.style.setProperty('--ry', ((px - 0.5) * maxTilt * 2).toFixed(2) + 'deg');
        el.style.setProperty('--rx', ((0.5 - py) * maxTilt * 2).toFixed(2) + 'deg');
        el.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
        el.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
      });
      el.addEventListener('pointerleave', function () {
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });

    var glowEls = document.querySelectorAll('.gis-card, .gis-cap-card');
    glowEls.forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var px = ((e.clientX - r.left) / r.width) * 100;
        var py = ((e.clientY - r.top) / r.height) * 100;
        el.style.setProperty('--gx', px.toFixed(1) + '%');
        el.style.setProperty('--gy', py.toFixed(1) + '%');
        el.style.setProperty('--gis-mx', px.toFixed(1) + '%');
        el.style.setProperty('--gis-my', py.toFixed(1) + '%');
      });
    });
  }

  /* ----------------------------------------------------------------------
     Hero stage parallax (glass panels react to the pointer)
     ---------------------------------------------------------------------- */
  function initStageParallax() {
    if (reduced || !finePointer) return;
    var stage = document.querySelector('[data-gis-parallax]');
    if (!stage) return;
    var hero = stage.closest('.gis-hero') || stage;
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      stage.style.transform = 'rotateY(' + (px * 9).toFixed(2) + 'deg) rotateX(' + (-py * 7).toFixed(2) + 'deg) translateZ(0)';
    });
    hero.addEventListener('pointerleave', function () {
      stage.style.transform = 'rotateY(0deg) rotateX(0deg)';
    });
  }

  /* ----------------------------------------------------------------------
     Process timeline — progress line + stage activation
     ---------------------------------------------------------------------- */
  function initTimeline() {
    var timeline = document.getElementById('gis-timeline');
    if (!timeline) return;
    var progress = document.getElementById('gis-timeline-progress');
    var steps = timeline.querySelectorAll('.gis-timeline-step');
    var horizontal = window.matchMedia('(min-width: 992px)').matches;

    function onScroll() {
      var rect = timeline.getBoundingClientRect();
      var vh = window.innerHeight;
      var total = rect.height + vh * 0.5;
      var travelled = vh * 0.75 - rect.top;
      var pct = clamp((travelled / total) * 100, 0, 100);
      if (progress) progress.style.width = pct.toFixed(1) + '%';

      steps.forEach(function (step, idx) {
        var r = step.getBoundingClientRect();
        var active = horizontal
          ? r.left < window.innerWidth * (0.25 + (idx + 0.5) / steps.length * 0.9)
          : r.top < vh * 0.72;
        step.classList.toggle('is-active', active || (!horizontal && r.bottom < vh * 0.95 && r.top < vh * 0.72));
      });
    }

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(function () { onScroll(); ticking = false; });
      }
    }, { passive: true });
    window.addEventListener('resize', function () {
      horizontal = window.matchMedia('(min-width: 992px)').matches;
      onScroll();
    }, { passive: true });
    onScroll();
  }

  /* ----------------------------------------------------------------------
     FAQ accordion state (used by .gis-faq-item styling)
     ---------------------------------------------------------------------- */
  function initAccordionState() {
    var toggles = document.querySelectorAll('.accordion-button');
    toggles.forEach(function (btn) {
      var targetId = btn.getAttribute('data-bs-target') || btn.getAttribute('href');
      if (!targetId || targetId.charAt(0) !== '#') return;
      var panel = document.querySelector(targetId);
      if (!panel) return;
      var sync = function () {
        var open = panel.classList.contains('show');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        var item = btn.closest('.gis-faq-item');
        if (item) item.classList.toggle('is-open', open);
      };
      /* Bootstrap drives the collapse and emits these on the panel; mirroring
         them keeps aria-expanded and .is-open honest through the whole
         transition (a fixed timeout would read the panel mid-animation). */
      ['show.bs.collapse', 'shown.bs.collapse', 'hide.bs.collapse', 'hidden.bs.collapse']
        .forEach(function (evt) { panel.addEventListener(evt, sync); });
      sync();
    });
  }

  /* ----------------------------------------------------------------------
     Boot
     ---------------------------------------------------------------------- */
  function init() {
    initA11yHelpers();
    initMagnetic();
    initTilt();
    initStageParallax();
    initTimeline();
    initAccordionState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
