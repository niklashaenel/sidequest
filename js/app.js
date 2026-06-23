// =====================================================================
//  app.js – Steuerzentrale: verbindet Screens, Buttons und die Module
// =====================================================================

// --- Kurzhelfer ---
const $ = (id) => document.getElementById(id);
const screens = ["authScreen", "questScreen", "uploadScreen", "feedScreen"];

// Zeigt genau einen Screen, versteckt die anderen. Header nur außerhalb von Auth.
function showScreen(id) {
  screens.forEach((s) => $(s).classList.toggle("hidden", s !== id));
  $("appHeader").classList.toggle("hidden", id === "authScreen");
  window.scrollTo(0, 0);
}

function setMessage(el, text, type) {
  el.textContent = text || "";
  el.className = "message" + (type ? " " + type : "");
}

// Zustand für den aktuellen Durchlauf.
let currentQuest = null;     // heutige Quest
let pickedFile = null;       // gerade aufgenommenes Foto (vor Upload)
let registerMode = false;    // Login- oder Registrieren-Modus im Auth-Screen

// =====================================================================
//  Auth-Screen: Umschalten Login <-> Registrieren
// =====================================================================
function applyAuthMode() {
  $("usernameField").classList.toggle("hidden", !registerMode);
  $("primaryAuthBtn").textContent = registerMode ? "Registrieren" : "Login";
  $("toggleText").textContent     = registerMode ? "Schon ein Konto?" : "Noch kein Konto?";
  $("toggleModeBtn").textContent  = registerMode ? "Login" : "Registrieren";
  setMessage($("authMessage"), "");
}

$("toggleModeBtn").addEventListener("click", () => {
  registerMode = !registerMode;
  applyAuthMode();
});

$("primaryAuthBtn").addEventListener("click", async () => {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;
  const username = $("usernameInput").value.trim();
  const btn = $("primaryAuthBtn");

  if (!email || !password) {
    return setMessage($("authMessage"), "Bitte E-Mail und Passwort eingeben.", "error");
  }
  if (registerMode && !username) {
    return setMessage($("authMessage"), "Bitte einen Anzeigenamen wählen.", "error");
  }

  btn.disabled = true;
  setMessage($("authMessage"), "Moment…");
  try {
    if (registerMode) {
      const res = await Auth.register(username, email, password);
      // Falls E-Mail-Bestätigung in Supabase AN ist, gibt es noch keine Session.
      if (!res.session) {
        // Erst Modus umschalten (applyAuthMode räumt Meldungen weg),
        // DANN die Meldung setzen, damit sie sichtbar bleibt.
        registerMode = false;
        applyAuthMode();
        setMessage($("authMessage"),
          "Konto angelegt. Bitte E-Mail bestätigen, dann einloggen.", "ok");
        return;
      }
    } else {
      await Auth.login(email, password);
      // Profil sicherstellen (z. B. falls beim ersten Login noch keins existiert).
      await Auth.ensureProfile(null);
    }
    await enterApp();
  } catch (err) {
    setMessage($("authMessage"), uebersetzeFehler(err), "error");
  } finally {
    btn.disabled = false;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await Auth.logout();
  // onAuthStateChange (unten) bringt uns automatisch zurück zum Login.
});

// =====================================================================
//  Quest-Screen: Kamera auslösen
// =====================================================================
$("startQuestBtn").addEventListener("click", () => {
  $("cameraInput").click(); // öffnet die native Kamera / Dateiauswahl
});

$("cameraInput").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  pickedFile = file;

  // Vorschau anzeigen und zum Upload-Screen wechseln.
  $("previewImage").src = URL.createObjectURL(file);
  $("uploadQuestLabel").textContent = currentQuest ? currentQuest.title : "";
  setMessage($("uploadMessage"), "");
  showScreen("uploadScreen");
});

// =====================================================================
//  Upload-Screen: hochladen oder neu aufnehmen
// =====================================================================
$("retakeBtn").addEventListener("click", () => {
  pickedFile = null;
  $("cameraInput").value = ""; // erlaubt erneutes Auswählen derselben Datei
  showScreen("questScreen");
});

$("confirmUploadBtn").addEventListener("click", async () => {
  if (!pickedFile || !currentQuest) return;
  const btn = $("confirmUploadBtn");
  btn.disabled = true;
  setMessage($("uploadMessage"), "Lade hoch…");

  try {
    await Upload.submit(pickedFile, currentQuest);
    pickedFile = null;
    $("cameraInput").value = "";
    await goToFeed(); // Beitrag steht -> Feed freigeschaltet
  } catch (err) {
    setMessage($("uploadMessage"), uebersetzeFehler(err), "error");
  } finally {
    btn.disabled = false;
  }
});

// =====================================================================
//  Ablauf-Steuerung
// =====================================================================

// Nach Login: entscheiden, welcher Screen dran ist.
async function enterApp() {
  showScreen("questScreen");
  setMessage($("questMessage"), "");
  $("questTitle").textContent = "Lade Quest…";

  try {
    currentQuest = await Quest.today();
  } catch (err) {
    return setMessage($("questMessage"), uebersetzeFehler(err), "error");
  }

  if (!currentQuest) {
    $("questTitle").textContent = "Heute gibt es noch keine Quest.";
    setMessage($("questMessage"), "Schau später wieder vorbei! 👀");
    return;
  }

  $("questTitle").textContent = currentQuest.title;

  // Schon heute eingereicht? Dann direkt in den Feed.
  try {
    if (await Upload.hasSubmittedToday(currentQuest)) {
      await goToFeed();
    }
  } catch (err) {
    setMessage($("questMessage"), uebersetzeFehler(err), "error");
  }
}

async function goToFeed() {
  $("feedQuestTitle").textContent = currentQuest ? currentQuest.title : "";
  showScreen("feedScreen");
  await Feed.render(currentQuest);
}

// =====================================================================
//  Fehler verständlich auf Deutsch machen
// =====================================================================
function uebersetzeFehler(err) {
  const msg = (err && err.message) ? err.message : String(err);
  if (/Invalid login credentials/i.test(msg)) return "E-Mail oder Passwort falsch.";
  if (/User already registered/i.test(msg))   return "Diese E-Mail ist schon registriert. Bitte einloggen.";
  if (/Password should be at least/i.test(msg)) return "Passwort muss mindestens 6 Zeichen haben.";
  if (/Email not confirmed/i.test(msg))        return "E-Mail noch nicht bestätigt.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Keine Verbindung zu Supabase. URL/Key prüfen.";
  return msg;
}

// =====================================================================
//  Start: Auth-Status beobachten (hält Session über Reloads hinweg)
// =====================================================================
applyAuthMode();

// Sicherheitsnetz: Wenn die Supabase-Keys noch nicht eingetragen sind,
// zeigen wir eine klare Anleitung statt eines stillen Fehlers.
if (!sb) {
  showScreen("authScreen");
  $("primaryAuthBtn").disabled = true;
  $("toggleModeBtn").disabled = true;
  setMessage(
    $("authMessage"),
    "Setup nötig: Trage deine Supabase-URL und den anon-Key in js/supabaseClient.js ein.",
    "error"
  );
  throw new Error("[SideQuest] Supabase nicht konfiguriert – Start abgebrochen.");
}

sb.auth.onAuthStateChange((event, session) => {
  if (session && session.user) {
    // Eingeloggt (auch nach Reload) -> in die App.
    if ($("authScreen").classList.contains("hidden") === false || event === "SIGNED_IN") {
      enterApp();
    }
  } else {
    // Ausgeloggt -> zurück zum Login.
    currentQuest = null;
    pickedFile = null;
    showScreen("authScreen");
  }
});

// Direkt beim Laden prüfen, ob schon eine Session existiert.
(async () => {
  const user = await Auth.getUser();
  if (user) {
    await enterApp();
  } else {
    showScreen("authScreen");
  }
})();

// Service Worker registrieren (PWA / "Zum Startbildschirm").
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {/* offline egal im MVP */});
  });
}
