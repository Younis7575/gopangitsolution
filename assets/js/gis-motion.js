/**
 * Gopang interaction layer.
 *
 * Cursor glow, magnetic buttons, 3D card tilt, the technology hub tooltip and
 * the floating phone wall. Everything here is pointer-driven, so it is gated on
 * a fine pointer and disabled wholesale under prefers-reduced-motion. Reveal
 * animations fall back to IntersectionObserver with a rect sweep, because some
 * embedded webviews never fire observer callbacks.
 */
(function (window, document) {
  'use strict';

  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  /* ------------------------------------------------------ cursor glow --- */
  function initCursorGlow() {
    if (!finePointer || reduced) return;
    if (window.innerWidth < 1200) return;

    var glow = document.createElement('div');
    glow.className = 'gis-cursor-glow';
    glow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glow);

    var x = window.innerWidth / 2, y = window.innerHeight / 2;
    var tx = x, ty = y, raf = 0;

    // Declared as a hoisted binding so the visibilitychange handler below can
    // restart it; a named function expression would only be visible to itself.
    function loop() {
      raf = window.requestAnimationFrame(loop);
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      glow.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    }

    window.addEventListener('mousemove', function (e) {
      tx = e.clientX;
      ty = e.clientY;
      document.body.classList.add('has-cursor-glow');
    }, { passive: true });

    document.documentElement.addEventListener('mouseleave', function () {
      document.body.classList.remove('has-cursor-glow');
    });

    loop();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        window.cancelAnimationFrame(raf);
      } else {
        loop();
      }
    });
  }

  /* --------------------------------------------------- magnetic buttons --- */
  function initMagnetic() {
    if (!finePointer || reduced) return;

    document.addEventListener('mouseover', function (e) {
      var el = e.target.closest ? e.target.closest('.gis-magnetic') : null;
      if (!el || el.__gisMagnetic) return;
      el.__gisMagnetic = true;

      function move(ev) {
        var r = el.getBoundingClientRect();
        var dx = (ev.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (ev.clientY - (r.top + r.height / 2)) / r.height;
        el.style.transform = 'translate(' + (dx * 10).toFixed(2) + 'px,' + (dy * 6).toFixed(2) + 'px)';
      }
      function leave() {
        el.style.transform = '';
      }

      el.addEventListener('mousemove', move);
      el.addEventListener('mouseleave', leave);
      el.addEventListener('blur', leave);
    });
  }

  /* ------------------------------------------------------- 3D card tilt --- */
  function initTilt() {
    var cards = document.querySelectorAll('.gis-service-card, .svc-index-card');
    if (!cards.length) return;

    cards.forEach(function (card) {
      var animate = finePointer && !reduced;

      function onMove(e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        if (animate) {
          var rx = (0.5 - py) * 8;
          var ry = (px - 0.5) * 10;
          card.style.transform = 'perspective(900px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) translateY(-8px) scale(1.015)';
        }
      }

      function onLeave() {
        card.classList.remove('is-tilting');
        card.style.transform = '';
        card.style.setProperty('--mx', '50%');
        card.style.setProperty('--my', '0%');
      }

      if (animate) {
        card.addEventListener('mouseenter', function () { card.classList.add('is-tilting'); });
        card.addEventListener('mousemove', onMove);
        card.addEventListener('mouseleave', onLeave);
      }
    });
  }

  /* --------------------------------------------------- technology hub --- */
  function initTechHub() {
    var stage = document.getElementById('gis-techhub');
    if (!stage) return;

    var tip = document.getElementById('gis-techhub-tip');
    var nameEl = tip && tip.querySelector('.gis-techhub-tip-name');
    var descEl = tip && tip.querySelector('.gis-techhub-tip-desc');
    var capEl = tip && tip.querySelector('.gis-techhub-tip-cap');
    var scene = stage.querySelector('.gis-techhub-scene');
    var buttons = Array.prototype.slice.call(stage.querySelectorAll('.gis-technode-btn'));

    function show(btn) {
      if (!tip || !btn) return;
      buttons.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
      nameEl.textContent = btn.getAttribute('data-name') || '';
      descEl.textContent = btn.getAttribute('data-desc') || '';
      capEl.textContent = btn.getAttribute('data-capability') || '';
      tip.classList.add('is-on');
    }

    function hide() {
      if (tip) tip.classList.remove('is-on');
      buttons.forEach(function (b) { b.classList.remove('is-active'); });
    }

    buttons.forEach(function (btn) {
      btn.addEventListener('mouseenter', function () { show(btn); });
      btn.addEventListener('focus', function () { show(btn); });
      btn.addEventListener('click', function () { show(btn); });
    });
    stage.addEventListener('mouseleave', hide);

    // Gentle 3D lean of the whole hub toward the cursor.
    if (finePointer && !reduced && scene) {
      stage.addEventListener('mousemove', function (e) {
        var r = stage.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        scene.style.transform = 'rotateX(' + (-py * 7).toFixed(2) + 'deg) rotateY(' + (px * 9).toFixed(2) + 'deg)';
      });
      stage.addEventListener('mouseleave', function () { scene.style.transform = ''; });
    }
  }

  /* ------------------------------------------------------- phone wall --- */
  function initPhoneWall() {
    var wall = document.getElementById('gis-phonewall');
    if (!wall || !finePointer || reduced) return;

    var phones = Array.prototype.slice.call(wall.querySelectorAll('.gis-phone'));

    wall.addEventListener('mousemove', function (e) {
      var r = wall.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      phones.forEach(function (p, i) {
        var depth = parseFloat(p.getAttribute('data-depth')) || 1;
        var dy = -(px * 18 * depth) + (py * 6 * depth);
        var dx = (px * 12 * depth) + (py * 5 * depth);
        p.style.setProperty('translate', dx.toFixed(2) + 'px ' + dy.toFixed(2) + 'px');
      });
    });

    wall.addEventListener('mouseleave', function () {
      phones.forEach(function (p) { p.style.removeProperty('translate'); });
    });
  }

  /* ------------------------------------------------- scroll reveal ------- */
  function initReveal() {
    var items = document.querySelectorAll('.gis-reveal');
    if (!items.length) return;

    if (reduced) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    function reveal(el) { el.classList.add('is-visible'); }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          reveal(en.target);
          io.unobserve(en.target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      items.forEach(function (el) { io.observe(el); });
    }

    // Safety sweep for webviews where IntersectionObserver never fires.
    var ticking = false;
    function sweep() {
      var vh = window.innerHeight || 800;
      items.forEach(function (el) {
        if (el.classList.contains('is-visible')) return;
        var r = el.getBoundingClientRect();
        if (r.top < vh * 0.92 && r.bottom > 0) reveal(el);
      });
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () { ticking = false; sweep(); });
    }, { passive: true });
    sweep();
  }

  /* ------------------------------------------------------- bootstrap --- */
  function init() {
    initCursorGlow();
    initMagnetic();
    initTilt();
    initTechHub();
    initPhoneWall();
    initReveal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.GISMotion = { clamp: clamp };
})(window, document);