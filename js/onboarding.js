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
      btn.innerHTML = 'Moment…';
      const ok = await Push.enable();
      if (ok) {
        btn.innerHTML = '<i class="ti ti-check"></i> Aktiviert';
        setTimeout(Onboarding.dismiss, 1000);
      } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-bell"></i> Benachrichtigungen erlauben';
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
      title.textContent = "SideQuest als App installieren";
      if (Onboarding.isIOS()) {
        text.innerHTML = 'Tippe unten auf das <b>Teilen-Symbol</b> ' +
          '(Quadrat mit Pfeil nach oben) und dann auf <b>„Zum Home-Bildschirm"</b>. ' +
          'Danach kannst du auch Benachrichtigungen erlauben.';
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
    } else {
      // Schon installiert -> nur noch Benachrichtigungen anbieten.
      title.textContent = "Bleib auf dem Laufenden";
      text.textContent = "Erlaube Benachrichtigungen, dann sagen wir dir Bescheid, " +
        "sobald eine neue Challenge startet.";
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
