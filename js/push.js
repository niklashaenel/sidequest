// =====================================================================
//  push.js – Benachrichtigungen über OneSignal (Web Push)
// =====================================================================
//
// Der Service Worker von OneSignal liegt bewusst im Unterordner /sidequest/push/,
// damit er sich nicht mit unserem PWA-Worker (sw.js) im Scope /sidequest/ beißt.

const Push = {
  APP_ID: "feaa262d-1008-4c6f-b385-fd707f0ef763",

  init() {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.init({
          appId: Push.APP_ID,
          serviceWorkerPath: "sidequest/push/OneSignalSDKWorker.js",
          serviceWorkerParam: { scope: "/sidequest/push/" },
          allowLocalhostAsSecureOrigin: true, // erlaubt lokale Tests
        });
      } catch (e) {
        console.warn("[SideQuest] OneSignal init:", e && e.message);
      }
    });
  },

  // Können wir den "Benachrichtigungen erlauben"-Knopf sinnvoll anzeigen?
  // (Browser unterstützt es, noch nicht erlaubt, und auf iPhone nur als installierte App.)
  canPrompt() {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return false;
    if (Notification.permission === "denied") return false;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (ios && !standalone) return false; // iPhone: erst nach "Zum Home-Bildschirm"
    return true;
  },

  // Fragt die Erlaubnis ab (über OneSignal). Gibt true zurück, wenn erlaubt.
  async enable() {
    return new Promise((resolve) => {
      let done = false;
      const finish = (val) => { if (!done) { done = true; resolve(val); } };
      // Falls das SDK gar nicht lädt (z. B. Blocker): nach 8 s aufgeben.
      setTimeout(() => finish(Notification.permission === "granted"), 8000);

      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          await OneSignal.Notifications.requestPermission();
        } catch (e) {
          console.warn("[SideQuest] enable push:", e && e.message);
        } finally {
          finish(Notification.permission === "granted");
        }
      });
    });
  },
};
