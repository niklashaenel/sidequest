// =====================================================================
//  sw.js – Service Worker (PWA + OneSignal-Push in EINEM Worker)
// =====================================================================
//
// OneSignal wird offiziell empfohlen so integriert: importScripts ganz oben.
// Dadurch braucht es KEINEN zweiten Worker und keinen Sonder-Scope – dieser
// eine Worker (Scope /sidequest/) übernimmt Installierbarkeit UND Push.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDKWorker.js");

const CACHE_VERSION = "sidequest-v2";

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
