// =====================================================================
//  onboarding.js – Willkommens-Hinweis beim ersten Öffnen
//  (Zum Startbildschirm hinzufügen; Benachrichtigungen folgen mit OneSignal)
// =====================================================================

const Onboarding = {
  deferredPrompt: null, // Android: gespeichertes Installations-Event

  isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
           window.navigator.standalone === true;
  },
  isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  },

  init() {
    // Android/Chrome bietet ein natives Installations-Event an – auffangen.
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      Onboarding.deferredPrompt = e;
    });

    const close = () => Onboarding.dismiss();
    document.getElementById("onboardClose").addEventListener("click", close);
    document.getElementById("onboardLater").addEventListener("click", close);

    document.getElementById("onboardInstallBtn").addEventListener("click", async () => {
      if (!Onboarding.deferredPrompt) return;
      Onboarding.deferredPrompt.prompt();
      await Onboarding.deferredPrompt.userChoice;
      Onboarding.deferredPrompt = null;
      Onboarding.dismiss();
    });
  },

  // Zeigt den Hinweis, falls die App noch nicht installiert ist und der
  // Nutzer ihn nicht schon weggetippt hat.
  maybeShow() {
    if (Onboarding.isStandalone()) return;                       // läuft schon als App
    if (localStorage.getItem("sq-onboard") === "done") return;   // schon gesehen

    const card = document.getElementById("onboardCard");
    const text = document.getElementById("onboardText");
    const installBtn = document.getElementById("onboardInstallBtn");

    if (Onboarding.isIOS()) {
      text.innerHTML = 'Tippe unten auf das <b>Teilen-Symbol</b> ' +
        '(Quadrat mit Pfeil nach oben) und dann auf <b>„Zum Home-Bildschirm"</b>. ' +
        'So liegt SideQuest als App bei dir – und du kannst bald Benachrichtigungen erlauben.';
      installBtn.classList.add("hidden");
    } else if (Onboarding.deferredPrompt) {
      text.textContent = "Installiere SideQuest mit einem Tipp – dann liegt es als App " +
        "auf deinem Startbildschirm und du verpasst keine Challenge.";
      installBtn.classList.remove("hidden");
    } else {
      text.innerHTML = 'Öffne das Browser-Menü <b>(⋮)</b> und wähle ' +
        '<b>„App installieren"</b> bzw. <b>„Zum Startbildschirm hinzufügen"</b>.';
      installBtn.classList.add("hidden");
    }

    card.classList.remove("hidden");
  },

  dismiss() {
    localStorage.setItem("sq-onboard", "done");
    document.getElementById("onboardCard").classList.add("hidden");
  },
};
