/* Settld service worker: Web Push only (Milestone 8). No caching, no fetch handler: offline
   support comes in Milestone 9. Keep this file small and dependency-free. */
self.addEventListener("install", function () {
  self.skipWaiting();
});
self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  var d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || "Settld", {
      body: d.body || "",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      icon: "/pwa-icon/192",
      badge: "/pwa-icon/96",
      data: { url: d.url || "/groups" },
    })
  );
});

/* Tap → the right screen: reuse an open Settld window (it navigates itself on our message),
   otherwise open one. */
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var path = (event.notification.data && event.notification.data.url) || "/groups";
  var url = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (wins) {
      for (var i = 0; i < wins.length; i++) {
        var w = wins[i];
        if (w.url.indexOf(self.location.origin) === 0) {
          w.postMessage({ type: "settld-open", url: path });
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
