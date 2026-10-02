// Ad/push service worker removed.
// This stub stays in place so browsers that already registered the old worker
// unregister it on their next visit instead of keeping it alive indefinitely.
self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        self.registration.unregister().then(function () {
            return self.clients.matchAll({ type: 'window' });
        }).then(function (clients) {
            clients.forEach(function (client) {
                client.navigate(client.url);
            });
        })
    );
});
