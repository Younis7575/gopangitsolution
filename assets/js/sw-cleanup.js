// One-time cleanup for visitors who still carry the old ad/push service worker.
// The ad code is gone from the site, but a service worker registered on an
// earlier visit keeps living in the browser and can still deliver push ads.
// This unsubscribes any push subscription, unregisters every service worker
// registered for this origin, and clears their caches.
(function () {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    function cleanup() {
        try {
            navigator.serviceWorker.getRegistrations().then(function (regs) {
                regs.forEach(function (reg) {
                    try {
                        reg.pushManager.getSubscription().then(function (sub) {
                            if (sub) {
                                sub.unsubscribe().catch(function () {});
                            }
                        }).catch(function () {});
                    } catch (err) {
                        // Push may be unavailable; unregistering still matters.
                    }
                    reg.unregister().catch(function () {});
                });
            }).catch(function () {});
        } catch (err) {
            // Cleanup must never break the page.
        }

        try {
            if (window.caches && caches.keys) {
                caches.keys().then(function (keys) {
                    keys.forEach(function (k) {
                        caches.delete(k).catch(function () {});
                    });
                }).catch(function () {});
            }
        } catch (err) {
            // Best-effort only.
        }
    }

    if (document.readyState === 'complete') {
        cleanup();
    } else {
        window.addEventListener('load', cleanup, { once: true });
    }
})();
