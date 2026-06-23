// =====================================================================
//  app.js – Steuerzentrale: Screens, Übersicht, Countdown, Foto, Feed
// =====================================================================

const $ = (id) => document.getElementById(id);
const screens = ["authScreen", "overviewScreen", "challengeScreen", "uploadScreen", "feedScreen", "profileScreen"];

function showScreen(id) {
  screens.forEach((s) => $(s).classList.toggle("hidden", s !== id));
  $("appHeader").classList.toggle("hidden", id === "authScreen");
  window.scrollTo(0, 0);
}
function setMessage(el, text, type) {
  el.textContent = text || "";
  el.className = "message" + (type ? " " + type : "");
}

const state = {
  challenges: [],     // aktuell aktive Challenges
  doneIds: new Set(), // welche ich heute schon erledigt habe
  current: null,      // gerade gewählte Challenge
  username: "",
};
let pickedFile = null;
let registerMode = false;

// =====================================================================
//  Auth-Screen
// =====================================================================
function applyAuthMode() {
  $("usernameField").classList.toggle("hidden", !registerMode);
  $("primaryAuthBtn").textContent = registerMode ? "Registrieren" : "Login";
  $("toggleText").textContent     = registerMode ? "Schon ein Konto?" : "Noch kein Konto?";
  $("toggleModeBtn").textContent  = registerMode ? "Login" : "Registrieren";
  setMessage($("authMessage"), "");
}
$("toggleModeBtn").addEventListener("click", () => { registerMode = !registerMode; applyAuthMode(); });

$("primaryAuthBtn").addEventListener("click", async () => {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;
  const username = $("usernameInput").value.trim();
  const btn = $("primaryAuthBtn");

  if (!email || !password) return setMessage($("authMessage"), "Bitte E-Mail und Passwort eingeben.", "error");
  if (registerMode && !username) return setMessage($("authMessage"), "Bitte einen Anzeigenamen wählen.", "error");

  btn.disabled = true;
  setMessage($("authMessage"), "Moment…");
  try {
    if (registerMode) {
      const res = await Auth.register(username, email, password);
      if (!res.session) {
        registerMode = false; applyAuthMode();
        setMessage($("authMessage"), "Konto angelegt. Bitte E-Mail bestätigen, dann einloggen.", "ok");
        return;
      }
    } else {
      await Auth.login(email, password);
      await Auth.ensureProfile(null);
    }
    // Das Wechseln in die App übernimmt der onAuthStateChange-Listener (SIGNED_IN).
  } catch (err) {
    setMessage($("authMessage"), uebersetzeFehler(err), "error");
  } finally { btn.disabled = false; }
});

$("logoutBtn").addEventListener("click", async () => { await Auth.logout(); });

// =====================================================================
//  Übersicht (aktive Challenges)
// =====================================================================
async function enterApp() {
  showScreen("overviewScreen");
  await loadOverview();
  Onboarding.maybeShow();
  refreshBell();
}

// Glocke in der Kopfzeile: nur zeigen, wenn Benachrichtigungen erlaubt werden können.
const notifyBell = $("notifyBell");
function refreshBell() {
  notifyBell.classList.toggle("hidden", !(typeof Push !== "undefined" && Push.canPrompt()));
}
notifyBell.addEventListener("click", async () => {
  notifyBell.disabled = true;
  await Push.enable();
  notifyBell.disabled = false;
  refreshBell();
});

async function loadOverview() {
  const listEl = $("challengeList");
  listEl.innerHTML = '<p class="spinner-text">Lade Challenges…</p>';
  try {
    await Challenges.ensure();              // automatisch heutige/stündliche anlegen
    state.challenges = await Challenges.active();
    state.doneIds = await Challenges.doneIds(state.challenges.map((c) => c.id));
  } catch (err) {
    listEl.innerHTML = `<p class="spinner-text">Fehler: ${Feed.escape(err.message)}</p>`;
    return;
  }
  await refreshGreeting();
  renderOverview();
  loadStatsAndTop(); // Stats + Top-3 nachladen (blockiert die Challenge-Liste nicht)
}

// --- Stats-Leiste + Top-3 ---
function statCard(val, label, cls, icon) {
  return `<div class="stat-card ${cls || ""}">
    <div class="stat-val">${icon ? `<i class="ti ${icon}"></i>` : ""}${val}</div>
    <div class="stat-label">${label}</div></div>`;
}
function renderStatsStrip(el, cards) {
  el.innerHTML = cards.map((c) => statCard(c.val, c.label, c.cls, c.icon)).join("");
}
function renderTopToday(list) {
  const section = $("topTodaySection");
  const el = $("topToday");
  if (!list || !list.length) { section.classList.add("hidden"); return; }
  const medals = ["🥇", "🥈", "🥉"];
  el.innerHTML = list.map((t, i) => `
    <div class="top-item">
      <div class="top-rank">${medals[i] || ""}</div>
      <img class="top-thumb" src="${Feed.escape(t.image_url)}" alt="" loading="lazy" />
      <div class="top-info"><div class="top-user">${Feed.escape(t.username)}</div></div>
      <div class="top-likes"><i class="ti ti-heart"></i> ${t.likeCount}</div>
    </div>`).join("");
  section.classList.remove("hidden");
}
async function loadStatsAndTop() {
  try {
    const s = await Stats.forMe();
    state.stats = s;
    if (s) renderStatsStrip($("statsStrip"), [
      { val: s.level,         label: "Level", cls: "level" },
      { val: s.streak,        label: "Serie", cls: "streak", icon: "ti-flame" },
      { val: s.likesReceived, label: "Likes", cls: "likes",  icon: "ti-heart" },
    ]);
    const top = await Stats.topToday(state.challenges.map((c) => c.id));
    renderTopToday(top);
  } catch (e) { console.warn("[SideQuest] stats:", e.message); }
}

// --- Profil ---
async function openProfile() {
  showScreen("profileScreen");
  const s = state.stats || await Stats.forMe();
  renderProfile(s);
}
function renderProfile(s) {
  if (!s) return;
  $("profileAvatar").textContent = Feed.initial(state.username);
  $("profileName").textContent = state.username || "Du";
  $("profileLevelLabel").textContent = "Level " + s.level;
  $("profileXpFill").style.width = Math.round(s.progress * 100) + "%";
  $("profileXpHint").textContent = s.nextNeeded > 0
    ? `Noch ${s.nextNeeded} XP bis Level ${s.level + 1}` : "Höchstes Level!";

  renderStatsStrip($("profileStats"), [
    { val: s.done,          label: "Erledigt",      cls: "level" },
    { val: s.streak,        label: "Serie",         cls: "streak", icon: "ti-flame" },
    { val: s.likesReceived, label: "Likes erhalten",cls: "likes",  icon: "ti-heart" },
  ]);

  $("profileBadges").innerHTML = s.badges.map((b) => `
    <div class="badge ${b.unlocked ? "on" : ""}">
      <i class="ti ${b.unlocked ? b.icon : "ti-lock"}"></i>
      <div class="badge-label">${b.label}</div>
    </div>`).join("");

  const grid = $("profilePosts"), none = $("profileNoPosts");
  if (!s.posts.length) { grid.innerHTML = ""; none.classList.remove("hidden"); }
  else {
    none.classList.add("hidden");
    grid.innerHTML = s.posts.map((p) =>
      `<img src="${Feed.escape(p.image_url)}" alt="" loading="lazy" />`).join("");
  }
}

async function refreshGreeting() {
  const user = await Auth.getUser();
  if (!user) return;
  const { data } = await sb.from("profiles").select("username").eq("id", user.id).maybeSingle();
  state.username = (data && data.username) || user.email.split("@")[0];
  $("greetingName").textContent = `Hi, ${state.username}!`;
  $("headerAvatar").textContent = Feed.initial(state.username);
}

function renderOverview() {
  const listEl = $("challengeList");
  listEl.innerHTML = "";

  if (!state.challenges.length) {
    listEl.innerHTML =
      '<div class="empty-state"><i class="ti ti-mood-empty"></i>Gerade keine aktive Challenge. Schau später wieder vorbei!</div>';
    return;
  }

  for (const ch of state.challenges) {
    const meta = Challenges.meta(ch.kind);
    const done = state.doneIds.has(ch.id);
    const urgent = Challenges.isUrgent(ch.ends_at);

    const card = document.createElement("div");
    card.className = `challenge-card ${meta.cls}${urgent ? " urgent" : ""}`;
    card.innerHTML = `
      <div class="cc-top">
        <div class="cc-icon"><i class="ti ${meta.icon}"></i></div>
        <div style="flex:1"><span class="cc-badge">${meta.label}</span></div>
        <div class="cc-count ${urgent ? "warn" : ""}" data-ends="${ch.ends_at}">
          <i class="ti ti-clock"></i> <span>${Challenges.formatRemaining(ch.ends_at)}</span>
        </div>
      </div>
      <p class="cc-title">${Feed.escape(ch.title)}</p>
      <div class="cc-action ${done ? "done" : ""}">
        ${done ? '<i class="ti ti-check"></i> Erledigt – Feed ansehen' : "Challenge starten"}
      </div>`;
    card.addEventListener("click", () => openChallenge(ch));
    listEl.appendChild(card);
  }
}

function openChallenge(ch) {
  state.current = ch;
  if (state.doneIds.has(ch.id)) { goToFeed(ch); return; }
  showChallengeDetail(ch);
}

function showChallengeDetail(ch) {
  const meta = Challenges.meta(ch.kind);
  const icon = $("detailIcon");
  icon.className = "cc-icon";
  icon.innerHTML = `<i class="ti ${meta.icon}"></i>`;
  // Typ-Farbe an Icon/Badge über die Kind-Klasse am Detail-Header setzen:
  const head = $("detailIcon").parentElement;
  head.className = `detail-head ${meta.cls}`;
  const badge = $("detailBadge");
  badge.className = "cc-badge";
  badge.textContent = meta.label;
  $("questTitle").textContent = ch.title;
  const cd = $("detailCountdown");
  cd.dataset.ends = ch.ends_at;
  cd.querySelector("span").textContent = Challenges.formatRemaining(ch.ends_at);
  setMessage($("questMessage"), "");
  showScreen("challengeScreen");
}

// =====================================================================
//  Foto machen + hochladen
// =====================================================================
$("startQuestBtn").addEventListener("click", () => $("cameraInput").click());

$("cameraInput").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  pickedFile = file;
  $("previewImage").src = URL.createObjectURL(file);
  $("uploadQuestLabel").textContent = state.current ? state.current.title : "";
  setMessage($("uploadMessage"), "");
  showScreen("uploadScreen");
});

$("retakeBtn").addEventListener("click", () => {
  pickedFile = null; $("cameraInput").value = "";
  showScreen("challengeScreen");
});
$("uploadBack").addEventListener("click", () => {
  pickedFile = null; $("cameraInput").value = "";
  showScreen("challengeScreen");
});

$("confirmUploadBtn").addEventListener("click", async () => {
  if (!pickedFile || !state.current) return;
  const btn = $("confirmUploadBtn");
  btn.disabled = true;
  setMessage($("uploadMessage"), "Lade hoch…");
  try {
    await Upload.submit(pickedFile, state.current);
    state.doneIds.add(state.current.id);
    pickedFile = null; $("cameraInput").value = "";
    goToFeed(state.current);
  } catch (err) {
    setMessage($("uploadMessage"), uebersetzeFehler(err), "error");
  } finally { btn.disabled = false; }
});

// =====================================================================
//  Feed
// =====================================================================
async function goToFeed(ch) {
  $("feedQuestTitle").textContent = ch ? ch.title : "";
  showScreen("feedScreen");
  await Feed.render(ch);
}

$("challengeBack").addEventListener("click", () => { renderOverview(); showScreen("overviewScreen"); });
$("feedBack").addEventListener("click", () => { renderOverview(); showScreen("overviewScreen"); });
$("headerAvatar").addEventListener("click", openProfile);
$("profileBack").addEventListener("click", () => showScreen("overviewScreen"));

// =====================================================================
//  Countdown-Ticker (jede Sekunde alle sichtbaren Countdowns aktualisieren)
// =====================================================================
setInterval(() => {
  document.querySelectorAll("[data-ends]").forEach((el) => {
    const span = el.querySelector("span");
    if (span) span.textContent = Challenges.formatRemaining(el.dataset.ends);
    const urgent = Challenges.isUrgent(el.dataset.ends);
    el.classList.toggle("warn", urgent && el.classList.contains("cc-count"));
    const card = el.closest(".challenge-card");
    if (card) card.classList.toggle("urgent", urgent);
  });
}, 1000);

// =====================================================================
//  Fehlertexte auf Deutsch
// =====================================================================
function uebersetzeFehler(err) {
  const msg = (err && err.message) ? err.message : String(err);
  if (/Invalid login credentials/i.test(msg)) return "E-Mail oder Passwort falsch.";
  if (/User already registered/i.test(msg))   return "Diese E-Mail ist schon registriert. Bitte einloggen.";
  if (/Password should be at least/i.test(msg)) return "Passwort muss mindestens 6 Zeichen haben.";
  if (/Email not confirmed/i.test(msg))        return "E-Mail noch nicht bestätigt.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Keine Verbindung zu Supabase. URL/Key prüfen.";
  if (/row-level security/i.test(msg))         return "Keine Berechtigung (RLS). Policies prüfen.";
  return msg;
}

// =====================================================================
//  Start: Session beobachten
// =====================================================================
applyAuthMode();
Onboarding.init();
Push.init();

sb.auth.onAuthStateChange((event, session) => {
  // Frischer Login (oder Registrierung mit Session) -> in die App.
  if (event === "SIGNED_IN" && session && session.user) {
    enterApp();
  } else if (event === "SIGNED_OUT") {
    state.current = null; pickedFile = null;
    showScreen("authScreen");
  }
});

// Beim Laden: bestehende Session? -> direkt in die App, sonst Login.
// (INITIAL_SESSION wird oben bewusst ignoriert, damit es hier nicht doppelt lädt.)
(async () => {
  const user = await Auth.getUser();
  if (user) await enterApp();
  else showScreen("authScreen");
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
