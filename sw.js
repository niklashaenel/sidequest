// =====================================================================
//  sw.js – minimaler Service Worker
// =====================================================================
//
// Zweck im MVP: erlaubt "Zum Startbildschirm hinzufügen" (Installierbarkeit).
// Wir cachen bewusst NICHTS aggressiv, damit du beim Entwickeln immer die
// neueste Version siehst. Beim Erhöhen von CACHE_VERSION wird alter Cache geleert.

const CACHE_VERSION = "sidequest-v1";

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
