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
  var lowPower = (navigator.connection && navigator.connection.saveData) === true;

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
     Hero canvas — 3D node ecosystem with depth, links and data pulses
     ---------------------------------------------------------------------- */
  function initHeroCanvas() {
    var canvas = document.getElementById('gis-hero-canvas');
    if (!canvas || reduced || lowPower) return;
    if (!canvas.getContext || !canvas.getContext('2d')) return;

    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    var width = 0, height = 0;
    var mobile = window.innerWidth < 768;
    var COUNT = mobile ? 26 : 66;
    var LINK_DIST = mobile ? 120 : 165;
    var FOV = 460;

    var nodes = [];
    var pulses = [];
    var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    var running = true;
    var visible = true;
    var rafId = null;
    var lastT = 0;

    function seed() {
      nodes = [];
      for (var i = 0; i < COUNT; i++) {
        nodes.push({
          x: (Math.random() - 0.5) * 2,
          y: (Math.random() - 0.5) * 2,
          z: (Math.random() - 0.5) * 2,
          vx: (Math.random() - 0.5) * 0.00022,
          vy: (Math.random() - 0.5) * 0.00022,
          vz: (Math.random() - 0.5) * 0.00016,
          r: Math.random() < 0.16 ? 2.6 : 1.5,
          hue: Math.random() < 0.22 ? 'cyan' : 'blue'
        });
      }
      pulses = [];
      var pCount = mobile ? 3 : 7;
      for (var j = 0; j < pCount; j++) {
        pulses.push({ a: Math.floor(Math.random() * COUNT), t: Math.random(), speed: 0.0016 + Math.random() * 0.0022 });
      }
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mobile = window.innerWidth < 768;
    }

    function project(n) {
      var scale = FOV / (FOV + n.z * (FOV * 0.55));
      var cx = width * 0.62;
      var cy = height * 0.5;
      return {
        x: cx + n.x * width * 0.46 * scale + pointer.x * 34 * scale,
        y: cy + n.y * height * 0.62 * scale + pointer.y * 24 * scale,
        s: scale
      };
    }

    function step(now) {
      if (!running) return;
      var dt = lastT ? Math.min(now - lastT, 60) : 16;
      lastT = now;

      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;

      ctx.clearRect(0, 0, width, height);

      var i, j, n, p;
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        n.z += n.vz * dt;
        if (n.x > 1 || n.x < -1) n.vx *= -1;
        if (n.y > 1 || n.y < -1) n.vy *= -1;
        if (n.z > 1 || n.z < -1) n.vz *= -1;
      }

      var pts = [];
      for (i = 0; i < nodes.length; i++) pts.push(project(nodes[i]));

      /* links */
      ctx.lineWidth = 1;
      for (i = 0; i < nodes.length; i++) {
        for (j = i + 1; j < nodes.length; j++) {
          var dx = nodes[i].x - nodes[j].x;
          var dy = nodes[i].y - nodes[j].y;
          var dz = nodes[i].z - nodes[j].z;
          var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > LINK_DIST / 460) continue;
          var alpha = (1 - d / (LINK_DIST / 460)) * 0.34;
          ctx.strokeStyle = 'rgba(120, 160, 255, ' + alpha.toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }

      /* travelling data pulses */
      for (i = 0; i < pulses.length; i++) {
        p = pulses[i];
        p.t += p.speed * dt;
        if (p.t >= 1) {
          p.t = 0;
          p.a = Math.floor(Math.random() * nodes.length);
          p.b = Math.floor(Math.random() * nodes.length);
        }
        if (typeof p.b !== 'number') p.b = (p.a + 1) % nodes.length;
        if (p.a === p.b) continue;
        var ax = pts[p.a], bx = pts[p.b];
        var alpha2 = Math.sin(p.t * Math.PI) * 0.85;
        if (alpha2 <= 0.02) continue;
        ctx.fillStyle = 'rgba(90, 230, 255, ' + alpha2.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(ax.x + (bx.x - ax.x) * p.t, ax.y + (bx.y - ax.y) * p.t, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }

      /* nodes */
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        p = pts[i];
        var radius = n.r * p.s;
        var glow = n.hue === 'cyan' ? '140, 240, 255' : '130, 170, 255';
        if (n.r > 2) {
          ctx.fillStyle = 'rgba(' + glow + ', 0.16)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius * 3.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(' + glow + ', ' + (0.35 + p.s * 0.45).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = window.requestAnimationFrame(step);
    }

    function start() {
      if (rafId === null && visible && running) {
        lastT = 0;
        rafId = window.requestAnimationFrame(step);
      }
    }
    function stop() {
      if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; }
    }

    seed();
    resize();
    start();

    window.addEventListener('resize', function () {
      resize();
    }, { passive: true });

    window.addEventListener('pointermove', function (e) {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running) start(); else stop();
    });

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible && running) start(); else stop();
      }, { threshold: 0 });
      io.observe(canvas);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
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
    initHeroCanvas();
    initTimeline();
    initAccordionState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
