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

    document.getElementById("onboardNotifyBtn").addEventListener("click", async () => {
      const btn = document.getElementById("onboardNotifyBtn");
      btn.disabled = true;
      btn.innerHTML = t("auth.moment");
      const ok = await Push.enable();
      if (ok) {
        btn.innerHTML = `<i class="ti ti-check"></i> ${t("onboard.activated")}`;
        setTimeout(Onboarding.dismiss, 1000);
      } else {
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-bell"></i> ${t("onboard.notify")}`;
      }
    });
  },

  // Zeigt den Hinweis, falls es etwas einzurichten gibt (App installieren
  // und/oder Benachrichtigungen erlauben) und der Nutzer ihn nicht weggetippt hat.
  maybeShow() {
    if (localStorage.getItem("sq-onboard") === "done") return;

    const showInstall = !Onboarding.isStandalone();
    const showNotify  = (typeof Push !== "undefined") && Push.canPrompt();
    if (!showInstall && !showNotify) return; // nichts zu tun

    const card  = document.getElementById("onboardCard");
    const title = document.querySelector(".onboard-title");
    const text  = document.getElementById("onboardText");
    const installBtn = document.getElementById("onboardInstallBtn");
    const notifyBtn  = document.getElementById("onboardNotifyBtn");

    if (showInstall) {
      title.textContent = t("onboard.title");
      if (Onboarding.isIOS()) {
        text.innerHTML = t("onboard.iosText");
        installBtn.classList.add("hidden");
      } else if (Onboarding.deferredPrompt) {
        text.innerHTML = t("onboard.androidText");
        installBtn.classList.remove("hidden");
      } else {
        text.innerHTML = t("onboard.genericText");
        installBtn.classList.add("hidden");
      }
    } else {
      // Schon installiert -> nur noch Benachrichtigungen anbieten.
      title.textContent = t("onboard.titleNotify");
      text.innerHTML = t("onboard.notifyText");
      installBtn.classList.add("hidden");
    }

    notifyBtn.classList.toggle("hidden", !showNotify);
    card.classList.remove("hidden");
  },

  dismiss() {
    localStorage.setItem("sq-onboard", "done");
    document.getElementById("onboardCard").classList.add("hidden");
  },
};
