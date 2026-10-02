/**
 * Gopang ambient 3D particle field.
 *
 * A fixed full-viewport background layer that runs behind every page. The
 * particles are genuinely 3D: each one holds an (x, y, z) position in world
 * space, the
 * cloud is rotated about the Y axis every frame, and each point is projected
 * through a pinhole camera so that size, opacity and connection density all
 * scale with real depth rather than being faked with CSS blur.
 *
 * It is deliberately NOT built on three.js. A second WebGL context for a
 * background layer costs ~670KB and a second GPU pipeline for something that a
 * projected point cloud renders perfectly well on a 2D canvas. That keeps the
 * hero scene as the only 3D context on the page.
 *
 * Design constraints this file honours:
 *  - readability first: the field is dim and never drawn over content
 *  - adapts: particle count, link density and DPR come from a measured device tier
 *  - throttles: idle pages drop to a low frame budget, hidden tabs stop entirely
 *  - respects prefers-reduced-motion by painting one static frame
 *  - no dependencies, no layout reads in the render loop
 */
(function (window, document) {
  'use strict';

  var root = document.documentElement;
  if (window.__gisParticles) return;
  window.__gisParticles = true;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(pointer: fine)').matches;

  var PALETTE = [
    [111, 155, 255],   // accent blue
    [165, 139, 255],   // violet
    [103, 232, 249]    // cyan
  ];

  var DEPTH = 58;          // z-extent of the cloud
  var SPREAD_X = 15;
  var SPREAD_Y = 9.5;
  var CAM_Z = 6.5;
  var FOCAL = 30;
  var DRIFT = 1.55;        // world units per second toward the camera

  /* ------------------------------------------------------------ tiering --- */
  function tier() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    var px = w * h * (window.devicePixelRatio || 1) * (window.devicePixelRatio || 1);
    var lowPower = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

    if (lowPower || w < 700) return { count: 90, links: 120, dpr: 1.4, fps: 30, idle: 12 };
    if (px > 5.2e6 || w > 2100) return { count: 210, links: 230, dpr: 1.5, fps: 60, idle: 14 };
    if (px > 2.6e6) return { count: 280, links: 300, dpr: 1.8, fps: 60, idle: 16 };
    return { count: 230, links: 280, dpr: 2, fps: 60, idle: 16 };
  }

  /* ------------------------------------------------------------- sprites --- */
  function makeSprite(rgb) {
    var s = 64;
    var c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    var col = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
    // The core is deliberately capped short of pure white. This field sits
    // behind translucent glass panels, so a 255-luma core would be visible
    // through them and could sit directly under body copy.
    grad.addColorStop(0, 'rgba(' + Math.min(255, rgb[0] + 120) + ',' + Math.min(255, rgb[1] + 120) + ',' + Math.min(255, rgb[2] + 120) + ',1)');
    grad.addColorStop(0.13, 'rgba(' + col + ',0.92)');
    grad.addColorStop(0.34, 'rgba(' + col + ',0.4)');
    grad.addColorStop(0.62, 'rgba(' + col + ',0.1)');
    grad.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return c;
  }

  /* -------------------------------------------------------------- engine --- */
  function start() {
    var canvas = document.createElement('canvas');
    canvas.className = 'gis-particles-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    root.appendChild(canvas);

    var ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) { canvas.remove(); return; }

    // The CSS-only depth layers: a perspective grid and three drifting aurora
    // blobs. Injected here so a page needs exactly one script tag.
    var grid = document.createElement('div');
    grid.className = 'gis-ambient-grid';
    grid.setAttribute('aria-hidden', 'true');
    root.appendChild(grid);

    var aurora = document.createElement('div');
    aurora.className = 'gis-aurora';
    aurora.setAttribute('aria-hidden', 'true');
    aurora.innerHTML = '<i></i><i></i><i></i>';
    root.appendChild(aurora);

    var sprites = PALETTE.map(makeSprite);
    var cfg = tier();
    var points = [];
    var packets = [];
    var w = 0, h = 0, unit = 1, cx = 0, cy = 0;

    var angle = 0;
    var mouseX = 0, mouseY = 0;      // eased camera offset
    var targetX = 0, targetY = 0;
    var scrollShift = 0, scrollTarget = 0;

    var last = 0;
    var raf = 0;
    var acc = 0;
    var running = false;
    var idleAt = 0;
    var frameBudget = 1000 / cfg.fps;
    var idleBudget = 1000 / 20;

    var proj = [];

    function spawn(p, initial) {
      p.x = (Math.random() * 2 - 1) * SPREAD_X;
      p.y = (Math.random() * 2 - 1) * SPREAD_Y;
      p.z = initial ? Math.random() * DEPTH : 0;
      p.size = 2.1 + Math.random() * 3.6;
      p.tint = Math.random() * 3;
      p.phase = Math.random() * Math.PI * 2;
      p.twinkle = 0.55 + Math.random() * 0.45;
      p.lane = Math.random();
    }

    function build() {
      points.length = 0;
      for (var i = 0; i < cfg.count; i++) {
        var p = {};
        spawn(p, true);
        points.push(p);
      }
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, cfg.dpr);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = w / 2;
      cy = h * 0.52;
      unit = Math.min(w, h) * 0.078;
    }

    function project() {
      var ca = Math.cos(angle), sa = Math.sin(angle);
      proj.length = 0;
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        var xr = p.x * ca + p.z * sa;
        var zr = -p.x * sa + p.z * ca;
        var zr2 = zr + CAM_Z;
        var s = FOCAL / (FOCAL + zr2);
        proj.push({
          p: p,
          s: s,
          x: cx + xr * s * unit + mouseX * (0.6 + p.lane),
          y: cy + p.y * s * unit + mouseY * (0.6 + p.lane) + scrollShift * (0.25 + p.lane * 0.9)
        });
      }
    }

    function drawLinks() {
      var limit = cfg.links;
      var threshold = Math.min(w, h) * 0.185;
      var threshold2 = threshold * threshold;
      var drawn = 0;

      ctx.lineWidth = 1;
      for (var i = 0; i < proj.length && drawn < limit; i++) {
        var a = proj[i];
        // depth cull: only the nearest two thirds participate in the mesh
        if (a.s < 0.42) continue;
        for (var j = i + 1; j < proj.length && drawn < limit; j++) {
          var b = proj[j];
          if (b.s < 0.42) continue;
          var dx = a.x - b.x, dy = a.y - b.y;
          var d2 = dx * dx + dy * dy;
          if (d2 > threshold2) continue;
          var f = 1 - Math.sqrt(d2) / threshold;
          var alpha = f * f * 0.42 * Math.min(a.s, b.s);
          if (alpha < 0.012) continue;
          ctx.strokeStyle = 'rgba(126,168,255,' + alpha.toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          drawn++;
        }
      }
    }

    function drawPoints(t) {
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < proj.length; i++) {
        var o = proj[i];
        var depth = Math.min(1, Math.max(0, (o.s - 0.28) / 0.6));
        var tw = 0.62 + 0.38 * Math.sin(t * 0.0016 + o.p.phase);
        var alpha = Math.pow(depth, 0.62) * o.p.twinkle * tw * 0.82;
        if (alpha < 0.015) continue;

        var tint = o.p.tint;
        // depth re-tints: distant points drift violet, near points cyan
        if (depth > 0.72 && tint === 0) tint = 2;
        else if (depth < 0.45 && tint === 2) tint = 1;

        var size = o.p.size * (0.55 + o.s * 1.15) * (0.86 + tw * 0.2);
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprites[tint | 0], o.x - size, o.y - size, size * 2, size * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // Bright packets that travel along a link, so the mesh reads as live data
    // moving between nodes rather than a static constellation.
    function stepPackets(dt) {
      if (packets.length < 5 && Math.random() < 0.22 && proj.length > 8) {
        var i = (Math.random() * proj.length) | 0;
        var j = (Math.random() * proj.length) | 0;
        var a = proj[i], b = proj[j];
        if (a !== b && Math.min(a.s, b.s) > 0.5) {
          packets.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, t: 0, v: 0.0045 + Math.random() * 0.006 });
        }
      }
      for (var k = packets.length - 1; k >= 0; k--) {
        var pk = packets[k];
        pk.t += pk.v * dt * 60;
        if (pk.t >= 1) packets.splice(k, 1);
      }
    }

    function drawPackets() {
      ctx.globalCompositeOperation = 'lighter';
      for (var k = 0; k < packets.length; k++) {
        var pk = packets[k];
        var x = pk.ax + (pk.bx - pk.ax) * pk.t;
        var y = pk.ay + (pk.by - pk.ay) * pk.t;
        var fade = Math.sin(pk.t * Math.PI);
        ctx.globalAlpha = 0.8 * fade;
        ctx.drawImage(sprites[2], x - 6, y - 6, 12, 12);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    function advance(dt) {
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        p.z += DRIFT * dt;
        if (p.z > DEPTH) spawn(p, false);
      }
      angle += dt * 0.055;
      mouseX += (targetX - mouseX) * Math.min(1, dt * 0.045);
      mouseY += (targetY - mouseY) * Math.min(1, dt * 0.045);
      scrollShift += (scrollTarget - scrollShift) * Math.min(1, dt * 0.02);
      stepPackets(dt);
    }

    function render(t) {
      ctx.clearRect(0, 0, w, h);
      project();
      drawLinks();
      drawPoints(t);
      drawPackets();
    }

    function frame(t) {
      raf = window.requestAnimationFrame(frame);
      if (!last) { last = t; idleAt = t; }
      var dt = Math.min(0.05, (t - last) / 1000);
      last = t;

      // Frame budget is enforced by accumulating elapsed time, not by
      // comparing a single frame delta to the target period: rAF deltas are
      // almost always smaller than the period, so a delta comparison would
      // skip every frame forever.
      acc += dt * 1000;
      var idle = t - idleAt;
      var budget = idle > cfg.idle * 1000 ? idleBudget : frameBudget;
      if (acc < budget) return;
      acc = 0;

      advance(dt);
      render(t);
    }

    function play() {
      if (running) return;
      running = true;
      last = 0;
      acc = 0;
      idleAt = performance.now();
      raf = window.requestAnimationFrame(frame);
    }

    function pause() {
      running = false;
      window.cancelAnimationFrame(raf);
    }

    /* ------------------------------------------------------------ events --- */
    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        var next = tier();
        var changed = next.count !== cfg.count;
        cfg = next;
        resize();
        if (changed) build();
      }, 180);
    }, { passive: true });

    window.addEventListener('scroll', function () {
      var y = window.pageYOffset || root.scrollTop || 0;
      scrollTarget = (y / Math.max(1, h)) * -46;
      idleAt = performance.now();
    }, { passive: true });

    if (finePointer) {
      window.addEventListener('mousemove', function (e) {
        var nx = (e.clientX / Math.max(1, w)) - 0.5;
        var ny = (e.clientY / Math.max(1, h)) - 0.5;
        targetX = -nx * Math.min(120, w * 0.07);
        targetY = -ny * Math.min(90, h * 0.08);
        idleAt = performance.now();
      }, { passive: true });
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause(); else play();
    });

    if (reduced.addEventListener) {
      reduced.addEventListener('change', function (e) {
        if (e.matches) { pause(); render(0); } else { play(); }
      });
    }

    build();
    resize();

    if (reduced.matches) {
      render(0);
      root.classList.add('gis-particles-ready');
      return;
    }

    play();
    root.classList.add('gis-particles-ready');

    // Test seam. Automated/headless environments frequently starve
    // requestAnimationFrame, which makes the field impossible to verify. With
    // ?gisdebug=1 the same code paths can be stepped synchronously. Absent the
    // query flag nothing is exposed.
    if (/[?&]gisdebug=1/.test(window.location.search)) {
      window.__gisParticlesDebug = {
        step: function (frames) {
          for (var i = 0; i < (frames || 1); i++) { advance(1 / 60); render(i * 16.7); }
          return { points: points.length, packets: packets.length, angle: angle };
        },
        stats: function () {
          return { count: cfg.count, links: cfg.links, dpr: cfg.dpr, fps: cfg.fps, w: w, h: h };
        }
      };
    }
  }

  /* Load once the DOM exists, after first paint so it never delays LCP. */
  function boot() {
    if (root.classList.contains('no-particles')) return;
    if (document.body && document.body.classList.contains('no-particles')) return;
    if (!document.getElementById('gis-particles-css')) {
      // Stylesheet tag missing (a page added the script by hand) — bail out so
      // we never paint an unpositioned canvas over the content.
      return;
    }
    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    window.setTimeout(boot, 0);
  }
})(window, document);