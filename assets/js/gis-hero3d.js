/**
 * Gopang hero — real 3D technology ecosystem (Three.js).
 *
 * A procedurally-modelled software ecosystem rendered with actual depth,
 * perspective, lighting and reflections: an open laptop running a live-looking
 * dashboard, a floating phone, a pulsing neural network, a translucent cloud, a
 * database stack, orbiting API nodes, syntax-highlighted code panels, floating
 * technology cards and an additive particle field.
 *
 * Performance rules this file obeys:
 *  - Three.js itself is code-split and only fetched when the hero is on screen.
 *  - Device tier is measured before anything is built; mobile drops particles,
 *    reflections and shadow detail rather than hiding the scene.
 *  - The render loop stops when the hero scrolls away or the tab is hidden.
 *  - prefers-reduced-motion renders one frame and never starts the loop.
 *  - A no-WebGL / no-JS fallback keeps the CSS 3D stage visible.
 */
(function (window, document) {
  'use strict';

  var THREE_SRC = '/assets/js/vendor/three.module.min.js?v=1';
  // three.js is an ES module, so it arrives via import(). The texture helpers
  // below are plain functions and read this module-scoped reference.
  var THREE = null;

  var canvas = document.getElementById('gis-hero-canvas');
  var stage = document.getElementById('gis-hero-stage');
  if (!canvas || !stage) return;
  // The canvas lives in .gis-hero-bg, outside the stage column, so the
  // ready-state flag goes on the shared hero section.
  var hero = stage.closest('.gis-hero') || document.body;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ----------------------------------------------------------------- tiers ---
  var cores = navigator.hardwareConcurrency || 4;
  // Device tier is measured live rather than frozen at parse time, so a
  // rotation or a resized window still gets the right quality budget.
  function measureTier() {
    var w = window.innerWidth;
    var mobile = w < 768 || cores <= 4;
    var lowEnd = cores <= 2 || (mobile && w < 480);
    return {
      mobile: mobile,
      lowEnd: lowEnd,
      particles: lowEnd ? 260 : mobile ? 620 : 1400,
      reflections: !lowEnd,
      antialias: !mobile,
      pixelRatio: mobile ? 1.5 : 1.75,
      nodeCount: mobile ? 9 : 14
    };
  }
  var TIER = measureTier();

  // ------------------------------------------------------------- utilities ---
  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function makeCanvas(w2, h2) {
    var c = document.createElement('canvas');
    c.width = w2;
    c.height = h2;
    return c;
  }

  function roundRect(ctx, x, y, ww, hh, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + ww - r, y);
    ctx.quadraticCurveTo(x + ww, y, x + ww, y + r);
    ctx.lineTo(x + ww, y + hh - r);
    ctx.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh);
    ctx.lineTo(x + r, y + hh);
    ctx.quadraticCurveTo(x, y + hh, x, y + hh - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Palette shared with the CSS design tokens so the 3D matches the page.
  var C = {
    ink: '#f2f5fc',
    text: '#a6b0c4',
    muted: '#7b869c',
    blue: '#2b65f5',
    blueLite: '#7fa6ff',
    cyan: '#38ddf2',
    purple: '#7c5cff',
    surface: '#0b1020',
    deep: '#05070d'
  };

  // ------------------------------------------------------ canvas textures ---
  function dashboardTexture() {
    var S = 1024;
    var c = makeCanvas(S, S * 0.62);
    var x = c.getContext('2d');

    var g = x.createLinearGradient(0, 0, S, S * 0.62);
    g.addColorStop(0, '#0a0f1e');
    g.addColorStop(1, '#060a16');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S * 0.62);

    // sidebar
    x.fillStyle = 'rgba(255,255,255,0.04)';
    x.fillRect(0, 0, 168, S * 0.62);
    x.fillStyle = C.blue;
    roundRect(x, 26, 30, 116, 16, 8);
    x.fill();
    for (var i = 0; i < 6; i++) {
      x.fillStyle = i === 1 ? 'rgba(127,166,255,0.55)' : 'rgba(255,255,255,0.10)';
      roundRect(x, 26, 96 + i * 40, i === 1 ? 132 : 96, 14, 7);
      x.fill();
    }

    // KPI tiles
    var tiles = [[C.cyan, 0.62], [C.blueLite, 0.44], [C.purple, 0.34]];
    tiles.forEach(function (t, i) {
      var tx = 208 + i * 190;
      x.fillStyle = 'rgba(255,255,255,0.045)';
      roundRect(x, tx, 30, 168, 92, 14);
      x.fill();
      x.fillStyle = t[0];
      x.globalAlpha = t[1];
      roundRect(x, tx + 18, 52, 74, 10, 5);
      x.fill();
      x.globalAlpha = 1;
      x.fillStyle = 'rgba(255,255,255,0.16)';
      roundRect(x, tx + 18, 98, 120, 8, 4);
      x.fill();
    });

    // bar chart panel
    x.fillStyle = 'rgba(255,255,255,0.035)';
    roundRect(x, 208, 150, 380, 220, 16);
    x.fill();
    var heights = [0.45, 0.72, 0.34, 0.88, 0.58, 0.66, 0.40, 0.80];
    heights.forEach(function (h, i) {
      var bx = 240 + i * 42;
      var bh = 150 * h;
      var bg = x.createLinearGradient(0, 350 - bh, 0, 350);
      bg.addColorStop(0, C.cyan);
      bg.addColorStop(1, 'rgba(43,101,245,0.25)');
      x.fillStyle = bg;
      roundRect(x, bx, 350 - bh, 22, bh, 6);
      x.fill();
    });

    // trend line panel
    x.fillStyle = 'rgba(255,255,255,0.035)';
    roundRect(x, 614, 150, 380, 220, 16);
    x.fill();
    x.strokeStyle = 'rgba(56,221,242,0.9)';
    x.lineWidth = 5;
    x.lineJoin = 'round';
    x.beginPath();
    var pts = [[640, 330], [700, 296], [760, 312], [820, 254], [880, 272], [940, 208], [980, 186]];
    pts.forEach(function (p, i) { i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); });
    x.stroke();
    x.lineTo(980, 350);
    x.lineTo(640, 350);
    x.closePath();
    var lg = x.createLinearGradient(0, 186, 0, 350);
    lg.addColorStop(0, 'rgba(56,221,242,0.30)');
    lg.addColorStop(1, 'rgba(56,221,242,0)');
    x.fillStyle = lg;
    x.fill();

    // table rows
    x.fillStyle = 'rgba(255,255,255,0.035)';
    roundRect(x, 208, 396, 786, 120, 16);
    x.fill();
    for (var r = 0; r < 3; r++) {
      x.fillStyle = 'rgba(255,255,255,0.10)';
      roundRect(x, 232, 418 + r * 32, 150, 10, 5);
      x.fill();
      x.fillStyle = 'rgba(127,166,255,0.30)';
      roundRect(x, 470, 418 + r * 32, 260, 10, 5);
      x.fill();
      x.fillStyle = 'rgba(124,92,255,0.55)';
      roundRect(x, 830, 418 + r * 32, 140, 10, 5);
      x.fill();
    }
    return c;
  }

  function phoneTexture() {
    var W = 540, H = 1080;
    var c = makeCanvas(W, H);
    var x = c.getContext('2d');

    var g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0c1224');
    g.addColorStop(1, '#070b18');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);

    // app bar
    var ag = x.createLinearGradient(0, 0, W, 150);
    ag.addColorStop(0, 'rgba(43,101,245,0.55)');
    ag.addColorStop(1, 'rgba(124,92,255,0.35)');
    x.fillStyle = ag;
    x.fillRect(0, 0, W, 150);
    x.fillStyle = '#fff';
    x.font = '600 40px system-ui, -apple-system, "Segoe UI", sans-serif';
    x.fillText('Dashboard', 34, 72);
    x.fillStyle = 'rgba(255,255,255,0.7)';
    x.font = '400 26px system-ui, sans-serif';
    x.fillText('Live overview', 34, 112);

    // hero card
    x.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(x, 28, 186, W - 56, 190, 26);
    x.fill();
    x.strokeStyle = 'rgba(127,166,255,0.35)';
    x.lineWidth = 2;
    roundRect(x, 28, 186, W - 56, 190, 26);
    x.stroke();
    x.fillStyle = C.cyan;
    x.font = '700 54px system-ui, sans-serif';
    x.fillText('98.4%', 60, 280);
    x.fillStyle = C.text;
    x.font = '400 26px system-ui, sans-serif';
    x.fillText('Uptime this quarter', 60, 324);
    x.strokeStyle = C.cyan;
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(60, 352);
    for (var i = 0; i < 7; i++) x.lineTo(60 + i * 58, 352 - [0, 14, 8, 22, 16, 28, 34][i]);
    x.stroke();

    // list rows
    for (var r = 0; r < 4; r++) {
      var y = 410 + r * 96;
      x.fillStyle = 'rgba(255,255,255,0.045)';
      roundRect(x, 28, y, W - 56, 76, 20);
      x.fill();
      x.fillStyle = [C.blueLite, C.purple, C.cyan, C.blueLite][r];
      roundRect(x, 48, y + 18, 40, 40, 12);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.28)';
      roundRect(x, 106, y + 26, 250, 12, 6);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.12)';
      roundRect(x, 106, y + 46, 170, 10, 5);
      x.fill();
    }

    // bottom nav
    x.fillStyle = 'rgba(10,14,28,0.92)';
    x.fillRect(0, H - 120, W, 120);
    x.strokeStyle = 'rgba(255,255,255,0.08)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, H - 120);
    x.lineTo(W, H - 120);
    x.stroke();
    for (var n = 0; n < 4; n++) {
      x.fillStyle = n === 0 ? C.cyan : 'rgba(255,255,255,0.22)';
      roundRect(x, 52 + n * 118, H - 78, 44, 44, 14);
      x.fill();
    }
    return c;
  }

  function codeTexture() {
    var W = 640, H = 400;
    var c = makeCanvas(W, H);
    var x = c.getContext('2d');

    x.fillStyle = '#080d1c';
    roundRect(x, 0, 0, W, H, 18);
    x.fill();

    x.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(x, 0, 0, W, 52, 18);
    x.fill();
    ['#ff5f57', '#febc2e', '#28c840'].forEach(function (col, i) {
      x.fillStyle = col;
      x.beginPath();
      x.arc(34 + i * 26, 26, 8, 0, Math.PI * 2);
      x.fill();
    });

    var lines = [
      [[0, 30], [1, 60], [1, 40], [0, 46]],
      [[1, 0], [1, 60], [0, 36], [0, 26]],
      [[0, 22], [1, 56], [0, 26], [1, 60]],
      [[0, 20], [0, 44], [1, 40], [1, 64]],
      [[0, 26], [1, 50], [1, 30], [0, 30]],
      [[1, 0], [0, 44], [0, 30], [1, 56]],
      [[0, 24], [1, 52], [1, 34], [0, 44]],
      [[1, 0], [0, 40], [0, 24], [1, 46]]
    ];
    var palette = ['#38ddf2', '#7c5cff', '#7fa6ff', '#f2f5fc', '#5c6a86'];
    x.font = '400 22px ui-monospace, SFMono-Regular, Menlo, monospace';
    lines.forEach(function (ln, i) {
      var px = 34 + Math.random() * 10;
      ln.forEach(function (tok, ti) {
        var tw = 40 + tok[1] * 7;
        x.fillStyle = palette[(i + ti) % palette.length];
        x.globalAlpha = 0.85;
        roundRect(x, px, 88 + i * 34, tw, 12, 6);
        x.fill();
        px += tw + 14;
      });
      x.globalAlpha = 1;
    });
    return c;
  }

  function cardTexture(label, accent) {
    var W = 420, H = 200;
    var c = makeCanvas(W, H);
    var x = c.getContext('2d');

    x.fillStyle = 'rgba(11,16,32,0.92)';
    roundRect(x, 4, 4, W - 8, H - 8, 24);
    x.fill();
    var g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, accent + '55');
    g.addColorStop(1, 'rgba(11,16,32,0)');
    x.fillStyle = g;
    roundRect(x, 4, 4, W - 8, H - 8, 24);
    x.fill();
    x.strokeStyle = accent + 'aa';
    x.lineWidth = 3;
    roundRect(x, 4, 4, W - 8, H - 8, 24);
    x.stroke();

    x.fillStyle = accent;
    roundRect(x, 32, 40, 12, 56, 6);
    x.fill();

    x.fillStyle = C.ink;
    x.font = '700 40px system-ui, -apple-system, "Segoe UI", sans-serif';
    x.fillText(label, 32, 150);
    return c;
  }

  function glowTexture() {
    var S = 128;
    var c = makeCanvas(S, S);
    var x = c.getContext('2d');
    var g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(180,215,255,1)');
    g.addColorStop(0.35, 'rgba(80,150,255,0.55)');
    g.addColorStop(1, 'rgba(20,40,90,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    return c;
  }

  function shadowTexture() {
    var S = 256;
    var c = makeCanvas(S, S);
    var x = c.getContext('2d');
    var g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.62)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    return c;
  }

  function tex(canvas2, renderer) {
    var t = new THREE.CanvasTexture(canvas2);
    if (renderer) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    }
    return t;
  }

  // --------------------------------------------------------- environment ---
  function buildEnvironment(renderer, scene) {
    // A small procedural gradient environment gives the metal parts real
    // reflections without shipping an HDR file.
    var S = 256;
    var c = makeCanvas(S, S);
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#1b2a55');
    g.addColorStop(0.45, '#0a1024');
    g.addColorStop(1, '#04060c');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    var glow = x.createRadialGradient(S * 0.28, S * 0.3, 0, S * 0.28, S * 0.3, S * 0.5);
    glow.addColorStop(0, 'rgba(90,140,255,0.55)');
    glow.addColorStop(1, 'rgba(90,140,255,0)');
    x.fillStyle = glow;
    x.fillRect(0, 0, S, S);
    var glow2 = x.createRadialGradient(S * 0.76, S * 0.62, 0, S * 0.76, S * 0.62, S * 0.45);
    glow2.addColorStop(0, 'rgba(124,92,255,0.42)');
    glow2.addColorStop(1, 'rgba(124,92,255,0)');
    x.fillStyle = glow2;
    x.fillRect(0, 0, S, S);

    var t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    var pmrem = new THREE.PMREMGenerator(renderer);
    var env = pmrem.fromEquirectangular(t).texture;
    pmrem.dispose();
    t.dispose();
    return env;
  }

  // ------------------------------------------------------------- the scene ---
  function build(renderer, scene) {
    var root = new THREE.Group();
    scene.add(root);

    var floaters = [];
    function float(obj, amp, speed, phase) {
      floaters.push({ obj: obj, base: obj.position.y, amp: amp, speed: speed, phase: phase });
      return obj;
    }
    function registerFloat(obj, amp, speed, phase) {
      floaters.push({ obj: obj, base: obj.position.y, amp: amp, speed: speed, phase: phase });
    }

    var metal = new THREE.MeshStandardMaterial({
      color: 0x1a2138, metalness: 0.92, roughness: 0.28, envMapIntensity: 1.15
    });
    var darkMetal = new THREE.MeshStandardMaterial({
      color: 0x0c1120, metalness: 0.78, roughness: 0.42, envMapIntensity: 0.9
    });
    var glassBlue = new THREE.MeshPhysicalMaterial({
      color: 0x2b65f5, metalness: 0.1, roughness: 0.08, transmission: 0.55,
      thickness: 0.6, transparent: true, opacity: 0.75, envMapIntensity: 1.4
    });
    var neonCyan = new THREE.MeshBasicMaterial({ color: 0x38ddf2 });
    var neonBlue = new THREE.MeshBasicMaterial({ color: 0x7fa6ff });
    var neonPurple = new THREE.MeshBasicMaterial({ color: 0x7c5cff });

    // ---------------------------------------------------- laptop + screen ---
    var laptop = new THREE.Group();
    laptop.position.set(-1.35, 0.15, 0);
    laptop.rotation.set(-0.18, 0.42, 0.04);

    var base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.09, 2.15), metal);
    base.position.y = -0.62;
    laptop.add(base);

    // keyboard deck inset
    var deck = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.03, 1.5), darkMetal);
    deck.position.set(0, -0.56, 0.18);
    laptop.add(deck);

    // trackpad
    var pad = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.5), metal);
    pad.position.set(0, -0.555, -0.62);
    laptop.add(pad);

    var lid = new THREE.Group();
    lid.position.set(0, -0.58, 1.02);
    lid.rotation.x = -0.28;
    laptop.add(lid);

    var lidShell = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.1, 0.07), metal);
    lidShell.position.y = 1.05;
    lid.add(lidShell);

    var screen = new THREE.Mesh(
      new THREE.PlaneGeometry(3.16, 1.86),
      new THREE.MeshBasicMaterial({ map: tex(dashboardTexture(), renderer), toneMapped: false })
    );
    screen.position.set(0, 1.05, -0.045);
    screen.rotation.y = Math.PI;
    lid.add(screen);

    // screen glow
    var halo = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 3.4),
      new THREE.MeshBasicMaterial({
        map: tex(glowTexture(), renderer), transparent: true, opacity: 0.30,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
      })
    );
    halo.position.set(0, 1.05, -0.2);
    lid.add(halo);

    root.add(float(laptop, 0.09, 0.7, 0));

    // ------------------------------------------------------------- phone ---
    var phone = new THREE.Group();
    phone.position.set(1.55, 0.55, 1.25);
    phone.rotation.set(0.12, -0.5, -0.14);

    var body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.1, 0.09), metal);
    phone.add(body);

    var pScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 1.95),
      new THREE.MeshBasicMaterial({ map: tex(phoneTexture(), renderer), toneMapped: false })
    );
    pScreen.position.z = 0.048;
    phone.add(pScreen);

    var pGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 3.0),
      new THREE.MeshBasicMaterial({
        map: tex(glowTexture(), renderer), color: 0x7c5cff, transparent: true,
        opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
      })
    );
    pGlow.position.z = -0.06;
    phone.add(pGlow);

    // corner buttons
    var btn = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), darkMetal);
    btn.position.set(0.54, 0.45, 0);
    phone.add(btn);

    root.add(float(phone, 0.13, 0.95, 1.6));
    phone.userData.spin = 0.16;

    // ------------------------------------------------- neural network -----
    var netGroup = new THREE.Group();
    netGroup.position.set(0.15, 1.75, -0.9);
    root.add(netGroup);

    var cols = [
      { x: -1.5, ys: [0, 0.62, 1.24] },
      { x: -0.5, ys: [0.31, 0.93] },
      { x: 0.5, ys: [0, 0.62, 1.24] },
      { x: 1.5, ys: [0.31, 0.93] }
    ];
    var nodeGeo = new THREE.SphereGeometry(0.075, TIER.lowEnd ? 10 : 18, TIER.lowEnd ? 8 : 14);
    var nodeMat = new THREE.MeshStandardMaterial({
      color: 0x38ddf2, emissive: 0x1c6ea0, emissiveIntensity: 1.5, roughness: 0.3, metalness: 0.2
    });
    var netNodes = [];
    cols.forEach(function (col) {
      col.ys.forEach(function (y) {
        var m = new THREE.Mesh(nodeGeo, nodeMat);
        m.position.set(col.x, y, 0);
        netGroup.add(m);
        netNodes.push(m);
      });
    });

    var edgePts = [];
    for (var ci = 0; ci < cols.length - 1; ci++) {
      cols[ci].ys.forEach(function (y1) {
        cols[ci + 1].ys.forEach(function (y2) {
          edgePts.push(cols[ci].x, y1, 0, cols[ci + 1].x, y2, 0);
        });
      });
    }
    var edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePts, 3));
    var netLines = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({
      color: 0x7fa6ff, transparent: true, opacity: 0.3
    }));
    netGroup.add(netLines);

    // travelling pulses
    var pulseGeo = new THREE.SphereGeometry(0.045, 8, 8);
    var pulses = [];
    var routes = [
      [cols[0].ys[0], cols[1].ys[0], cols[2].ys[0], cols[3].ys[0]],
      [cols[0].ys[2], cols[1].ys[1], cols[2].ys[2], cols[3].ys[1]],
      [cols[0].ys[1], cols[1].ys[1], cols[2].ys[1], cols[3].ys[0]],
      [cols[0].ys[0], cols[1].ys[1], cols[2].ys[1], cols[3].ys[1]]
    ];
    routes.forEach(function (ys, i) {
      var p = new THREE.Mesh(pulseGeo, i % 2 ? neonPurple : neonCyan);
      p.userData = { ys: ys, xs: [-1.5, -0.5, 0.5, 1.5], t: i * 0.22 };
      netGroup.add(p);
      pulses.push(p);
    });

    // ------------------------------------------------------------- cloud ---
    var cloud = new THREE.Group();
    cloud.position.set(2.6, -0.95, -0.4);
    root.add(cloud);
    var puffs = [[0, 0, 0, 0.72], [0.55, 0.16, 0.05, 0.52], [-0.52, 0.12, 0.02, 0.48],
                 [0.24, 0.38, 0, 0.42], [-0.28, 0.34, -0.04, 0.40]];
    var puffGeo = new THREE.SphereGeometry(1, TIER.lowEnd ? 14 : 26, TIER.lowEnd ? 10 : 20);
    puffs.forEach(function (p) {
      var m = new THREE.Mesh(puffGeo, glassBlue.clone());
      m.material.opacity = 0.42;
      m.position.set(p[0], p[1], p[2]);
      m.scale.setScalar(p[3]);
      cloud.add(m);
    });
    root.add(float(cloud, 0.1, 0.6, 3.1));
    cloud.userData.spin = 0.06;

    // ----------------------------------------------------------- database ---
    var db = new THREE.Group();
    db.position.set(-2.7, -1.0, -1.1);
    root.add(db);
    for (var d = 0; d < 3; d++) {
      var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.26, 34), metal);
      disc.position.y = d * 0.3;
      db.add(disc);
      var ringMesh = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.022, 8, 40), d === 1 ? neonCyan : neonBlue);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = d * 0.3 + 0.13;
      db.add(ringMesh);
    }
    root.add(float(db, 0.07, 0.55, 2.2));

    // ------------------------------------------------------- API nodes -----
    var apiGroup = new THREE.Group();
    apiGroup.position.set(-0.4, -1.35, 0.9);
    root.add(apiGroup);
    var apiGeo = new THREE.OctahedronGeometry(0.1, 0);
    var apiMats = [neonCyan, neonBlue, neonPurple];
    var apiNodes = [];
    for (var n = 0; n < TIER.nodeCount; n++) {
      var a = (n / TIER.nodeCount) * Math.PI * 2;
      var m = new THREE.Mesh(apiGeo, apiMats[n % 3]);
      m.userData = { a: a, r: 1.45 + (n % 3) * 0.16, y: Math.sin(a * 2.2) * 0.28, sp: 0.22 + (n % 4) * 0.03 };
      apiGroup.add(m);
      apiNodes.push(m);
    }
    var core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), glassBlue.clone());
    core.material.opacity = 0.8;
    apiGroup.add(core);
    registerFloat(apiGroup, 0.08, 0.8, 0.4);

    // orbit ring
    var orbit = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.008, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0x7fa6ff, transparent: true, opacity: 0.35 })
    );
    orbit.rotation.x = Math.PI / 2;
    apiGroup.add(orbit);

    // ------------------------------------------------- code + tech cards ---
    var codePanel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.19),
      new THREE.MeshBasicMaterial({
        map: tex(codeTexture(), renderer), transparent: true, opacity: 0.94, toneMapped: false
      })
    );
    codePanel.position.set(-1.05, 1.42, 1.5);
    codePanel.rotation.set(-0.1, 0.28, 0.03);
    root.add(float(codePanel, 0.11, 0.75, 4.0));
    codePanel.userData.spin = 0.08;

    var cards = [];
    var cardDefs = [
      { t: 'Flutter', c: '#38ddf2', p: [2.2, 1.55, 0.3] },
      { t: 'React', c: '#7fa6ff', p: [-3.0, 1.35, -0.2] },
      { t: 'AWS', c: '#ffb454', p: [2.95, 0.15, -1.4] },
      { t: 'Python', c: '#7c5cff', p: [-2.1, 2.0, -0.9] },
      { t: 'Laravel', c: '#ff6b6b', p: [0.2, 2.55, -1.8] }
    ];
    if (TIER.lowEnd) cardDefs = cardDefs.slice(0, 3);
    cardDefs.forEach(function (def, i) {
      var m = new THREE.Mesh(
        new THREE.PlaneGeometry(1.05, 0.5),
        new THREE.MeshBasicMaterial({
          map: tex(cardTexture(def.t, def.c), renderer), transparent: true,
          opacity: 0.96, toneMapped: false, side: THREE.DoubleSide
        })
      );
      m.position.set(def.p[0], def.p[1], def.p[2]);
      m.rotation.y = (i % 2 ? -1 : 1) * 0.3;
      root.add(float(m, 0.12, 0.6 + i * 0.08, i * 1.3));
      m.userData.spin = 0.1 + i * 0.02;
      cards.push(m);
    });

    // ----------------------------------------------- abstract geometries ---
    var knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.42, 0.13, TIER.lowEnd ? 64 : 128, TIER.lowEnd ? 10 : 18, 2, 3),
      new THREE.MeshStandardMaterial({
        color: 0x2b65f5, metalness: 0.95, roughness: 0.22, envMapIntensity: 1.5
      })
    );
    knot.position.set(3.35, 1.5, -1.5);
    root.add(float(knot, 0.14, 0.5, 5.0));

    var ico = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 0),
      new THREE.MeshBasicMaterial({ color: 0x7fa6ff, wireframe: true, transparent: true, opacity: 0.3 })
    );
    ico.position.set(-3.5, -0.6, 0.9);
    root.add(float(ico, 0.13, 0.62, 1.1));

    var torus = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.035, 12, 72),
      new THREE.MeshStandardMaterial({
        color: 0x38ddf2, metalness: 0.9, roughness: 0.18, emissive: 0x0d3d4d, envMapIntensity: 1.4
      })
    );
    torus.position.set(-1.9, 2.35, 1.1);
    torus.rotation.set(1.1, 0.4, 0);
    root.add(float(torus, 0.12, 0.55, 2.8));

    // --------------------------------------------------------- particles ---
    var pCount = TIER.particles;
    var pos = new Float32Array(pCount * 3);
    var col = new Float32Array(pCount * 3);
    var c1 = new THREE.Color(0x38ddf2);
    var c2 = new THREE.Color(0x7fa6ff);
    var c3 = new THREE.Color(0x7c5cff);
    var speeds = new Float32Array(pCount);
    for (var pi = 0; pi < pCount; pi++) {
      pos[pi * 3] = (Math.random() - 0.5) * 16;
      pos[pi * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[pi * 3 + 2] = (Math.random() - 0.5) * 10 - 1;
      var c = Math.random();
      var src = c > 0.72 ? c3 : (c > 0.38 ? c2 : c1);
      col[pi * 3] = src.r;
      col[pi * 3 + 1] = src.g;
      col[pi * 3 + 2] = src.b;
      speeds[pi] = 0.06 + Math.random() * 0.18;
    }
    var pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: TIER.lowEnd ? 0.07 : 0.055,
      map: tex(glowTexture(), renderer),
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    }));
    root.add(particles);

    // ------------------------------------------------------ contact shadow ---
    var shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 4.5),
      new THREE.MeshBasicMaterial({
        map: tex(shadowTexture(), renderer), transparent: true, opacity: 0.55,
        depthWrite: false, toneMapped: false
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(-1.2, -2.5, 0.4);
    root.add(shadow);

    return {
      root: root,
      floaters: floaters,
      particles: particles,
      particleSpeeds: speeds,
      pulses: pulses,
      apiNodes: apiNodes,
      cards: cards,
      laptop: laptop,
      phone: phone,
      knot: knot,
      ico: ico,
      torus: torus,
      db: db,
      lid: lid,
      netGroup: netGroup,
      scene: scene
    };
  }

  // ---------------------------------------------------------------- start ---
  function start() {
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: TIER.antialias,
        powerPreference: 'high-performance'
      });
    } catch (e) {
      hero.classList.add('gis-hero-nogl');
      return;
    }
    if (!renderer.getContext()) {
      hero.classList.add('gis-hero-nogl');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TIER.pixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.4, 9.4);

    if (TIER.reflections) scene.environment = buildEnvironment(renderer, scene);

    // lighting
    scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x05070d, 1.15));
    var key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(4, 6, 6);
    scene.add(key);
    var rimA = new THREE.PointLight(0x2b65f5, 42, 22, 2);
    rimA.position.set(-4.5, 2.4, 3.2);
    scene.add(rimA);
    var rimB = new THREE.PointLight(0x7c5cff, 34, 20, 2);
    rimB.position.set(4.6, -2.2, 2.6);
    scene.add(rimB);
    var rimC = new THREE.PointLight(0x38ddf2, 26, 16, 2);
    rimC.position.set(0, 3.6, -3.4);
    scene.add(rimC);

    var world = build(renderer, scene);

    // ------------------------------------------------------------- sizing ---
    // The renderer must match the canvas element's own box, not the stage
    // column — the canvas is sized in CSS against the hero, so measuring the
    // stage would leave the drawing stretched and under-resolution.
    function resize() {
      var rect = canvas.getBoundingClientRect();
      var width = Math.round(rect.width);
      var height = Math.round(rect.height);
      if (!width || !height) return;
      TIER = measureTier();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TIER.pixelRatio));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Widen the lens on narrow/tall viewports so the whole ecosystem stays
      // in frame instead of being cropped.
      camera.fov = camera.aspect < 0.95 ? 54 : (width < 900 ? 48 : 42);
      camera.updateProjectionMatrix();
      var fit = Math.min(camera.aspect, 1.55);
      world.root.scale.setScalar(Math.max(0.62, Math.min(1, fit / 1.05)));
    }
    resize();

    if (window.ResizeObserver) {
      new ResizeObserver(function () { resize(); }).observe(canvas);
    }
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    });

    // -------------------------------------------------------- interaction ---
    var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    var finePointer = window.matchMedia('(pointer: fine)').matches;

    if (finePointer && !reducedMotion) {
      stage.addEventListener('mousemove', function (e) {
        var r = stage.getBoundingClientRect();
        pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      });
      stage.addEventListener('mouseleave', function () {
        pointer.tx = 0;
        pointer.ty = 0;
      });
    }

    // --------------------------------------------------------------- loop ---
    var clock = new THREE.Clock();
    var running = false;
    var visible = true;
    var rafId = 0;

    function tick() {
      rafId = window.requestAnimationFrame(tick);
      var t = clock.getElapsedTime();

      pointer.x += (pointer.tx - pointer.x) * 0.045;
      pointer.y += (pointer.ty - pointer.y) * 0.045;

      // camera parallax
      camera.position.x = pointer.x * 1.15;
      camera.position.y = 0.4 - pointer.y * 0.75;
      camera.lookAt(0, 0.25, 0);

      // scene tilt responds to the cursor
      world.root.rotation.y = pointer.x * 0.16 + Math.sin(t * 0.18) * 0.035;
      world.root.rotation.x = -pointer.y * 0.10 + Math.cos(t * 0.15) * 0.025;

      // floaters
      for (var i = 0; i < world.floaters.length; i++) {
        var f = world.floaters[i];
        f.obj.position.y = f.base + Math.sin(t * f.speed + f.phase) * f.amp;
        if (f.obj.userData.spin) {
          f.obj.rotation.y += 0.0016 * f.obj.userData.spin * 60 / 60;
        }
      }

      // neural pulses travel along their routes
      for (var p = 0; p < world.pulses.length; p++) {
        var pu = world.pulses[p];
        pu.userData.t = (pu.userData.t + 0.0055) % 1;
        var seg = pu.userData.t * 3;
        var i0 = Math.min(2, Math.floor(seg));
        var f2 = seg - i0;
        pu.position.x = pu.userData.xs[i0] + (pu.userData.xs[i0 + 1] - pu.userData.xs[i0]) * f2;
        pu.position.y = pu.userData.ys[i0] + (pu.userData.ys[i0 + 1] - pu.userData.ys[i0]) * f2;
      }

      // API nodes orbit the hub
      for (var a = 0; a < world.apiNodes.length; a++) {
        var nd = world.apiNodes[a];
        nd.userData.a += nd.userData.sp * 0.006;
        nd.position.set(
          Math.cos(nd.userData.a) * nd.userData.r,
          nd.userData.y + Math.sin(t * 0.8 + a) * 0.1,
          Math.sin(nd.userData.a) * nd.userData.r * 0.5
        );
        nd.rotation.x += 0.02;
        nd.rotation.y += 0.03;
      }

      world.knot.rotation.x += 0.005;
      world.knot.rotation.y += 0.008;
      world.ico.rotation.x -= 0.004;
      world.ico.rotation.y += 0.006;
      world.torus.rotation.z += 0.005;

      // laptop lid breathes very slightly
      world.lid.rotation.x = -0.28 + Math.sin(t * 0.5) * 0.02;

      // particles drift upward and wrap
      var posAttr = world.particles.geometry.attributes.position;
      var arr = posAttr.array;
      for (var q = 0; q < world.particleSpeeds.length; q++) {
        arr[q * 3 + 1] += world.particleSpeeds[q] * 0.016;
        if (arr[q * 3 + 1] > 5) arr[q * 3 + 1] = -5;
      }
      posAttr.needsUpdate = true;
      world.particles.rotation.y = t * 0.012;

      renderer.render(scene, camera);
    }

    function play() {
      if (running || reducedMotion) return;
      running = true;
      clock.getDelta();
      tick();
    }
    function pause() {
      if (!running) return;
      running = false;
      window.cancelAnimationFrame(rafId);
    }

    if (reducedMotion) {
      // Render exactly one frame so the scene is visible but static.
      tick();
      pause();
      hero.classList.add('gis-hero-static');
    } else {
      play();
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          visible = en.isIntersecting;
          if (visible && !document.hidden) play();
          else pause();
        });
      }, { threshold: 0.02 }).observe(stage);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause();
      else if (visible) play();
    });

    hero.classList.add('gis-hero-ready');
  }

  function fail(err) {
    hero.classList.add('gis-hero-nogl');
    window.__gisHeroError = err;
    if (window.console && console.warn) console.warn('[GIS hero 3D] falling back to the CSS stage:', err);
  }

  // three.js is 670 KB — fetch it only once the hero is actually on screen.
  function boot() {
    function run() {
      return import(THREE_SRC).then(function (m) {
        THREE = m;
        try {
          start();
        } catch (e) {
          fail(e);
        }
      }, fail);
    }

    if ('IntersectionObserver' in window) {
      var booted = false;
      var go = function () {
        if (booted) return;
        booted = true;
        io.disconnect();
        run();
      };
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) go();
      }, { rootMargin: '200px 0px' });
      io.observe(stage);

      // Rect sweep in case IntersectionObserver never fires in this webview.
      var sweep = function () {
        var r = stage.getBoundingClientRect();
        if (r.top < window.innerHeight + 200 && r.bottom > -200) go();
      };
      window.addEventListener('scroll', sweep, { passive: true });
      window.addEventListener('load', sweep);
      sweep();
    } else {
      run();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);