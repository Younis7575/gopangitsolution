/* ==========================================================================
   Homepage Student Project Hub.

   Three small jobs, all of them enhancements rather than requirements:

     1. parallax + cursor tilt on the 3D hub visual,
     2. the glowing progress line through the five-step journey,
     3. filtering the real-work showcase.

   Every block bails out when its markup is absent, so nothing here can throw
   on a page that does not carry the section. All of it is skipped under
   prefers-reduced-motion. The Lottie icons inside the section are handled by
   gis-lottie.js, which already hydrates them lazily as they approach the
   viewport — nothing here plays them, so they can never run twice.
   ========================================================================== */
(function () {
    'use strict';

    var $ = function (sel, root) { return (root || document).querySelector(sel); };
    var $$ = function (sel, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    };
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------------- 1. 3D hub: parallax + cursor tilt ---------------- */
    function initHub() {
        var stage = $('#sh-stage');
        var scene = $('#sh-scene');
        if (!stage || !scene) { return; }

        if (reduce) { return; }

        var frame = null;
        var targetX = 0, targetY = 0, curX = 0, curY = 0;

        function loop() {
            curX += (targetX - curX) * 0.08;
            curY += (targetY - curY) * 0.08;
            scene.style.transform =
                'rotateX(' + (curY * -6).toFixed(2) + 'deg) rotateY(' + (curX * 8).toFixed(2) + 'deg)';

            var scrollTop = window.pageYOffset;
            var rect = stage.getBoundingClientRect();
            if (rect.bottom > -200 && rect.top < window.innerHeight + 200) {
                var centre = (rect.top + rect.height / 2 - window.innerHeight / 2);
                scene.style.setProperty('--sh-scroll', (centre * -0.045).toFixed(1) + 'px');
            }

            if (Math.abs(targetX - curX) > 0.001 || Math.abs(targetY - curY) > 0.001) {
                frame = requestAnimationFrame(loop);
            } else {
                frame = null;
            }
        }

        function wake() { if (frame === null) { frame = requestAnimationFrame(loop); } }

        stage.addEventListener('pointermove', function (e) {
            var rect = stage.getBoundingClientRect();
            targetX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
            targetY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
            wake();
        });
        stage.addEventListener('pointerleave', function () { targetX = 0; targetY = 0; wake(); });
        window.addEventListener('scroll', function () {
            var rect = stage.getBoundingClientRect();
            if (rect.bottom > -200 && rect.top < window.innerHeight + 200) { wake(); }
        }, { passive: true });
    }

    /* ---------------- 2. Journey progress rail ---------------- */
    function initJourney() {
        var steps = $('#sh-steps');
        var rail = $('#sh-rail');
        if (!steps || !rail) { return; }

        var items = $$('.sh-step', steps);
        var ticking = false;

        function update() {
            ticking = false;
            var rect = steps.getBoundingClientRect();
            var anchor = window.innerHeight * 0.6;
            var progress = Math.min(1, Math.max(0, (anchor - rect.top) / Math.max(1, rect.height)));
            rail.style.height = (progress * 100).toFixed(2) + '%';

            items.forEach(function (step, i) {
                var top = step.getBoundingClientRect().top;
                step.classList.toggle('is-in', top < anchor || i === 0);
            });
        }

        function onScroll() {
            if (ticking) { return; }
            ticking = true;
            requestAnimationFrame(update);
        }

        if (reduce) {
            items.forEach(function (s) { s.classList.add('is-in'); });
            rail.style.height = '100%';
            return;
        }

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        update();
    }

    /* ---------------- 3. Showcase filters ---------------- */
    function initFilters() {
        var filters = $('#sh-filters');
        var grid = $('#sh-grid');
        if (!filters || !grid) { return; }

        filters.addEventListener('click', function (e) {
            var btn = e.target.closest('.sh-showcase__filter');
            if (!btn) { return; }
            var key = btn.dataset.filter;
            $$('.sh-showcase__filter', filters).forEach(function (b) {
                b.setAttribute('aria-pressed', String(b === btn));
            });
            $$('.sh-card', grid).forEach(function (card) {
                var show = key === 'all' || card.dataset.cat === key;
                card.hidden = !show;
            });
        });
    }

    /* ---------------- 4. Mobile-first ordering guard ---------------- */
    function initOrder() {
        /* On small screens the brief wants the free-consultation card before
           the project-development card. That is already the DOM order, so this
           only guards against a future reorder silently breaking it. */
        var free = $('.sh-path--free', document);
        var build = $('.sh-path--build', document);
        if (!free || !build || window.innerWidth > 991) { return; }
        if (!(free.compareDocumentPosition(build) & Node.DOCUMENT_POSITION_FOLLOWING)) {
            free.parentElement.insertBefore(free, build);
        }
    }

    function boot() {
        initHub();
        initJourney();
        initFilters();
        initOrder();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
