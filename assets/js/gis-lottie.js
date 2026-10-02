/**
 * Gopang Lottie runtime.
 *
 * - lottie.min.js (298 KB) is only fetched when an animated icon scrolls into
 *   view, so it never blocks first paint.
 * - Animations self-pause when scrolled away from the viewport, which keeps the
 *   main thread free for the WebGL hero.
 * - Hover raises playbackRate to 1.6x and adds the "hot" class that the CSS
 *   uses for the glow/border treatment on the card.
 * - prefers-reduced-motion renders the animation frame 0 as a static icon.
 */
(function (window, document) {
  'use strict';

  var SRC = '/assets/js/vendor/lottie.min.js?v=1';
  var BASE = '/assets/lottie/';
  var loaded = null;
  var instances = [];
  var cache = {};
  var queue = [];
  var inFlight = 0;
  var MAX_PARALLEL = 3;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function loadLottie() {
    if (loaded) return loaded;
    loaded = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = SRC;
      s.async = true;
      s.onload = function () { resolve(window.lottie); };
      s.onerror = function () { reject(new Error('lottie failed to load')); };
      document.head.appendChild(s);
    });
    return loaded;
  }

  // A page can hold a dozen animated icons. Fetching them all at once bursts
  // past the browser's per-host connection limit, so requests are queued and
  // the parsed data is cached for the lifetime of the page.
  function pump() {
    while (inFlight < MAX_PARALLEL && queue.length) {
      var job = queue.shift();
      inFlight++;
      getData(job.name)
        .then(job.resolve, job.reject)
        .then(function () { inFlight--; pump(); });
    }
  }

  function getData(name) {
    if (cache[name]) return Promise.resolve(cache[name]);
    var attempt = function (n) {
      return fetch(BASE + name + '.json', { cache: 'force-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .catch(function (err) {
          if (n > 0) return attempt(n - 1);
          throw err;
        });
    };
    return attempt(1).then(function (data) {
      cache[name] = data;
      return data;
    });
  }

  function fetchData(name) {
    return new Promise(function (resolve, reject) {
      queue.push({ name: name, resolve: resolve, reject: reject });
      pump();
    });
  }

  function play(el, animData) {
    if (el.__gisLottie) return el.__gisLottie;

    var host = el.hasAttribute('data-lottie-mount') ? el : (el.querySelector('[data-lottie-mount]') || el);
    var inst = window.lottie.loadAnimation({
      container: host,
      renderer: 'svg',
      loop: true,
      autoplay: !reduceMotion,
      animationData: animData,
      rendererSettings: {
        progressiveLoad: true,
        preserveAspectRatio: 'xMidYMid meet'
      }
    });

    el.__gisLottie = inst;
    instances.push({ el: el, inst: inst });

    if (reduceMotion) {
      inst.goToAndStop(0, true);
      el.classList.add('gis-lottie-static');
    }

    // Hover = more active playback, per the interaction spec.
    var target = el.closest('.gis-service-card, .gis-lottie-tile, .gis-capability, a, button');
    if (target) {
      target.addEventListener('mouseenter', function () {
        if (reduceMotion) return;
        el.classList.add('is-active');
        inst.setSpeed(1.6);
      });
      target.addEventListener('mouseleave', function () {
        if (reduceMotion) return;
        el.classList.remove('is-active');
        inst.setSpeed(1);
      });
    }

    return inst;
  }

  function hydrate(el) {
    if (el.__gisRequested) return;
    el.__gisRequested = true;

    var name = el.getAttribute('data-lottie');
    if (!name) return;

    // Reduced-motion / no-JS fallback: the inline SVG shown in the markup stays.
    if (reduceMotion) {
      el.classList.add('gis-lottie-static');
      return;
    }

    fetchData(name)
      .then(play.bind(null, el))
      .catch(function () {
        el.classList.add('gis-lottie-failed');
        el.__gisRequested = false;
      });
  }

  function init() {
    var nodes = document.querySelectorAll('[data-lottie]');
    if (!nodes.length) return;

    loadLottie().catch(function () { return null; });

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var el = entry.target;
          if (entry.isIntersecting) {
            hydrate(el);
            if (el.__gisLottie && !reduceMotion) el.__gisLottie.play();
          } else if (el.__gisLottie && !reduceMotion) {
            el.__gisLottie.pause();
          }
        });
      }, { rootMargin: '160px 0px' });

      nodes.forEach(function (n) { io.observe(n); });
    }

    // Rect-based sweep. IntersectionObserver is not universal (some embedded
    // webviews never fire it), and this also catches icons that are already on
    // screen at load without waiting for an observer callback.
    var ticking = false;
    function sweep() {
      var vh = window.innerHeight || 800;
      nodes.forEach(function (el) {
        if (el.__gisRequested) return;
        var r = el.getBoundingClientRect();
        if (r.top < vh + 200 && r.bottom > -200) hydrate(el);
      });
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; sweep(); });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    window.addEventListener('load', sweep);
    sweep();

    // Stop every animation when the tab is hidden.
    document.addEventListener('visibilitychange', function () {
      instances.forEach(function (i) {
        if (!i.inst || reduceMotion) return;
        if (document.hidden) i.inst.pause();
        else i.inst.play();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.GISLottie = {
    play: function (name, container) {
      return loadLottie().then(function (l) {
        return fetchData(name)
          .then(function (d) { return l.loadAnimation({ container: container, renderer: 'svg', loop: true, autoplay: true, animationData: d }); });
      });
    },
    reduceMotion: reduceMotion
  };
})(window, document);