// Monetag ads loader — public/application pages only. Never include on admin pages.
// Loads ad delivery only after the page has finished loading and gone idle, so ads
// can never block first paint, navigation, form submission, or other page scripts.
(function () {
    if (window.__monetagInit) {
        return;
    }
    window.__monetagInit = true;

    var TAG_SRC = 'https://quge5.com/88/tag.min.js';
    var TAG_ZONE = '267255';

    function loadAdTag() {
        if (document.querySelector('script[data-zone="' + TAG_ZONE + '"]')) {
            return;
        }
        try {
            var tag = document.createElement('script');
            tag.src = TAG_SRC;
            tag.async = true;
            tag.setAttribute('data-zone', TAG_ZONE);
            tag.setAttribute('data-cfasync', 'false');
            tag.onerror = function () {
                window.__monetagTagFailed = true;
            };
            (document.body || document.documentElement).appendChild(tag);
        } catch (err) {
            window.__monetagTagFailed = true;
        }
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            return;
        }
        try {
            navigator.serviceWorker.register('/sw.js').catch(function () {});
        } catch (err) {
            // Ads must never break the page.
        }
    }

    // Some Monetag creatives render a fixed, viewport-covering, ultra-high z-index
    // overlay (interstitial/vignette) that captures every click on the page,
    // including nav links and form buttons, until the user dismisses it. That is
    // the real cause of the site feeling "stuck" when an ad loads. This watchdog
    // gives the ad a fair grace window to be seen, then force-clears any overlay
    // that is still blocking the whole page so navigation and forms never stay
    // locked out.
    var OVERLAY_GRACE_MS = 8000;
    var OVERLAY_Z_THRESHOLD = 999999;
    var watchedOverlays = (typeof WeakSet !== 'undefined') ? new WeakSet() : null;

    function isFullPageOverlay(el) {
        if (!el || el.nodeType !== 1 || el === document.documentElement || el === document.body) {
            return false;
        }
        var cs;
        try {
            cs = getComputedStyle(el);
        } catch (err) {
            return false;
        }
        if (!cs || (cs.position !== 'fixed' && cs.position !== 'absolute')) {
            return false;
        }
        var z = parseInt(cs.zIndex, 10);
        if (!z || z < OVERLAY_Z_THRESHOLD) {
            return false;
        }
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        if (!vw || !vh) {
            return false;
        }
        var r = el.getBoundingClientRect();
        return r.width >= vw * 0.9 && r.height >= vh * 0.9;
    }

    function watchOverlay(el) {
        if (!watchedOverlays || watchedOverlays.has(el)) {
            return;
        }
        watchedOverlays.add(el);
        setTimeout(function () {
            try {
                if (document.documentElement.contains(el) && isFullPageOverlay(el)) {
                    el.remove();
                }
            } catch (err) {
                // Best-effort cleanup only.
            }
        }, OVERLAY_GRACE_MS);
    }

    function scanForOverlays(node) {
        if (!node || node.nodeType !== 1) {
            return;
        }
        if (isFullPageOverlay(node)) {
            watchOverlay(node);
        }
        if (node.querySelectorAll) {
            var candidates = node.querySelectorAll('iframe, div');
            for (var i = 0; i < candidates.length; i++) {
                if (isFullPageOverlay(candidates[i])) {
                    watchOverlay(candidates[i]);
                }
            }
        }
    }

    function startOverlayWatchdog() {
        if (typeof MutationObserver === 'undefined') {
            return;
        }
        try {
            scanForOverlays(document.body);
            var observer = new MutationObserver(function (mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    var m = mutations[i];
                    if (m.type === 'childList') {
                        m.addedNodes.forEach(scanForOverlays);
                    } else if (m.type === 'attributes' && m.target) {
                        scanForOverlays(m.target);
                    }
                }
            });
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class']
            });
        } catch (err) {
            // Watchdog is best-effort; it must never break the page either.
        }
    }

    function start() {
        loadAdTag();
        registerServiceWorker();
        startOverlayWatchdog();
    }

    function schedule() {
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(start, { timeout: 4000 });
        } else {
            setTimeout(start, 1500);
        }
    }

    if (document.readyState === 'complete') {
        schedule();
    } else {
        window.addEventListener('load', schedule, { once: true });
    }
})();
