// =====================================================================
//  sw.js – PWA-Service-Worker (Installierbarkeit/Offline)
// =====================================================================
//
// OneSignal-Push läuft BEWUSST in einem eigenen Worker (push/OneSignalSDKWorker.js),
// damit ein Push-Problem niemals diesen PWA-Worker lahmlegt.

const CACHE_VERSION = "sidequest-v3";

self.addEventListener("install", (event) => {
  self.skipWaiting(); // neue Version sofort übernehmen
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Netzwerk zuerst (kein veralteter Inhalt). Ohne Netz keine Offline-Garantie –
// für den MVP völlig ausreichend.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
