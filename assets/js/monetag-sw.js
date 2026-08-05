// Registers the Monetag service worker (root /sw.js) so ad delivery works site-wide.
(function () {
    if (!('serviceWorker' in navigator)) {
        return;
    }
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
})();
