// Ad/push service worker removed.
// This stub stays in place so browsers that already registered the old ad
// worker replace it with something inert and then drop it entirely. It shows
// no notifications and serves no ads under any circumstances.
self.addEventListener('install', function () {
    self.skipWaiting();
});

// Swallow anything the old push subscription may still deliver before the
// registration is torn down, so no ad notification can ever be shown.
self.addEventListener('push', function (event) {
    event.waitUntil(Promise.resolve());
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        Promise.resolve()
            .then(function () {
                return self.registration.pushManager.getSubscription();
            })
            .then(function (sub) {
                return sub ? sub.unsubscribe() : null;
            })
            .catch(function () {})
            .then(function () {
                return self.registration.unregister();
            })
            .then(function () {
                return self.clients.matchAll({ type: 'window' });
            })
            .then(function (clients) {
                clients.forEach(function (client) {
                    client.navigate(client.url);
                });
            })
            .catch(function () {})
    );
});
