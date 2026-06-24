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
  // Glocke nur zeigen, wenn Benachrichtigungen noch aktiviert werden können.
  notifyBell.classList.toggle("hidden", !(typeof Push !== "undefined" && Push.canPrompt()));
}
notifyBell.addEventListener("click", async () => {
  notifyBell.disabled = true;
  const ok = await Push.enable();
  notifyBell.disabled = false;
  refreshBell();
  if (ok) alert("🔔 Benachrichtigungen aktiviert! Du verpasst keine Challenge mehr.");
});

async function loadOverview() {
  const listEl = $("challengeList");
  listEl.innerHTML =
    '<div class="skeleton skel-card"></div><div class="skeleton skel-card"></div><div class="skeleton skel-card"></div>';
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
// Zahl von 0 auf Zielwert hochzählen (kleine Animation, mit Sicherheits-Fallback).
function countUp(el, target, dur) {
  target = Number(target) || 0; dur = dur || 650;
  const start = performance.now();
  (function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  })(start);
  // Falls requestAnimationFrame gedrosselt ist (Hintergrund-Tab): Zielwert sicher setzen.
  setTimeout(() => { el.textContent = target; }, dur + 200);
}
function statCard(val, label, cls, icon) {
  return `<div class="stat-card ${cls || ""}">
    <div class="stat-val">${icon ? `<i class="ti ${icon}"></i>` : ""}<span class="num" data-target="${val}">0</span></div>
    <div class="stat-label">${label}</div></div>`;
}
function renderStatsStrip(el, cards) {
  el.innerHTML = cards.map((c) => statCard(c.val, c.label, c.cls, c.icon)).join("");
  el.querySelectorAll(".num[data-target]").forEach((n) => countUp(n, n.dataset.target));
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
// Kurze Einblendung unten (z. B. Serien-Belohnung).
let toastTimer = null;
function toast(html, ms) {
  const el = $("toast");
  if (!el) return;
  el.innerHTML = html;
  el.classList.remove("hidden");
  void el.offsetWidth; // Reflow erzwingen, damit die Einblend-Transition greift (rAF wird im Hintergrund gedrosselt)
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.classList.add("hidden"), 300);
  }, ms || 4200);
}

// Serien-Meilenstein einmalig feiern (gemerkt in localStorage).
function celebrateStreak(s) {
  if (!s || !s.milestone) return;
  const seen = parseInt(localStorage.getItem("sq-streak-celebrated") || "0", 10);
  if (s.milestone.days > seen) {
    localStorage.setItem("sq-streak-celebrated", String(s.milestone.days));
    toast(`🔥 <b>${Feed.escape(s.milestone.label)}</b><br>+${s.milestone.xp} Bonus-XP kassiert!`, 5200);
  }
}

function renderWeekly(list) {
  const section = $("weeklySection");
  const el = $("weeklyBoard");
  if (!list || !list.length) { section.classList.add("hidden"); return; }
  const medals = ["🥇", "🥈", "🥉"];
  el.innerHTML = list.map((t, i) => `
    <div class="wb-item${t.isMe ? " me" : ""}">
      <div class="wb-rank">${medals[i] || (i + 1) + "."}</div>
      <div class="wb-avatar">${Feed.escape(Feed.initial(t.username))}</div>
      <div class="wb-name">${Feed.escape(t.username)}${t.isMe ? " <span class='wb-you'>(du)</span>" : ""}</div>
      <div class="wb-pts">${t.points} <span>XP</span></div>
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
    if (s) celebrateStreak(s);
    Stats.weeklyBoard().then(renderWeekly).catch((e) => console.warn("[SideQuest] weekly:", e.message));
    const top = await Stats.topToday(state.challenges.map((c) => c.id));
    renderTopToday(top);

    const com = await Stats.community(state.challenges.map((c) => c.id));
    const comEl = $("community");
    if (com.posts > 0) {
      comEl.innerHTML = `🔥 <b>${com.posts}</b> ${com.posts === 1 ? "Beitrag" : "Beiträge"} heute · <b>${com.people}</b> dabei`;
      comEl.classList.remove("hidden");
    } else {
      comEl.classList.add("hidden");
    }
  } catch (e) { console.warn("[SideQuest] stats:", e.message); }
}

// --- Profil ---
async function openProfile() {
  showScreen("profileScreen");
  // IMMER frisch laden, damit neue Beiträge + Stats sofort erscheinen.
  const s = await Stats.forMe();
  state.stats = s;
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
      `<div class="post-cell">
         <img src="${Feed.escape(p.image_url)}" alt="" loading="lazy" />
         <button class="post-del" data-id="${p.id}" data-quest="${p.quest_id}" aria-label="Beitrag löschen"><i class="ti ti-trash"></i></button>
       </div>`).join("");

    grid.querySelectorAll(".post-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const p = s.posts.find((x) => String(x.id) === btn.dataset.id);
        if (!p || !confirm("Diesen Beitrag wirklich löschen?")) return;
        btn.disabled = true;
        try {
          await Social.deleteSubmission(p.id, p.image_url);
          state.doneIds.delete(Number(btn.dataset.quest)); // Challenge wieder offen
          const fresh = await Stats.forMe();
          state.stats = fresh;
          renderProfile(fresh);
        } catch (e) { btn.disabled = false; alert("Löschen fehlgeschlagen: " + e.message); }
      });
    });
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
  await Feed.render(ch, () => {
    // Eigener Beitrag gelöscht -> Challenge wieder als offen markieren, Stats neu.
    state.doneIds.delete(ch.id);
    loadStatsAndTop();
  });
}

$("challengeBack").addEventListener("click", () => { renderOverview(); showScreen("overviewScreen"); });
$("feedBack").addEventListener("click", () => { renderOverview(); showScreen("overviewScreen"); });
$("headerAvatar").addEventListener("click", openProfile);
$("profileBack").addEventListener("click", () => showScreen("overviewScreen"));

// Challenge-Idee vorschlagen
$("suggestForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("suggestInput");
  const msg = $("suggestMsg");
  const btn = e.target.querySelector("button");
  setMessage(msg, "");
  btn.disabled = true;
  try {
    await Social.suggestChallenge(input.value);
    input.value = "";
    msg.textContent = "Danke! Idee eingereicht 💜";
    msg.className = "suggest-msg ok";
  } catch (err) {
    msg.textContent = err.message || "Hat nicht geklappt.";
    msg.className = "suggest-msg error";
  } finally { btn.disabled = false; }
});

// Den gerade sichtbaren Screen neu laden.
async function refreshCurrentScreen() {
  if (!$("overviewScreen").classList.contains("hidden")) await loadOverview();
  else if (!$("profileScreen").classList.contains("hidden")) await openProfile();
  else if (!$("feedScreen").classList.contains("hidden") && state.current) await goToFeed(state.current);
}

// Pull-to-Refresh (runterwischen am oberen Rand, wie bei Instagram/X).
(function setupPullToRefresh() {
  const ptr = $("ptr");
  if (!ptr) return;
  let startY = null, active = false;
  const onAuth = () => !$("authScreen").classList.contains("hidden");

  window.addEventListener("touchstart", (e) => {
    startY = (window.scrollY <= 0 && !onAuth()) ? e.touches[0].clientY : null;
    active = false;
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 6 && window.scrollY <= 0) {
      active = true;
      const pull = Math.min(dy * 0.5, 80);
      ptr.style.height = pull + "px";
      ptr.style.opacity = Math.min(1, pull / 60);
      ptr.classList.toggle("ready", pull >= 60);
    }
  }, { passive: true });

  window.addEventListener("touchend", async () => {
    if (!active) { startY = null; return; }
    const ready = ptr.classList.contains("ready");
    startY = null; active = false;
    if (ready) {
      ptr.classList.remove("ready");
      ptr.classList.add("refreshing");
      ptr.style.height = "46px"; ptr.style.opacity = "1";
      try { await refreshCurrentScreen(); } catch (e) {}
      ptr.classList.remove("refreshing");
    }
    ptr.style.height = "0"; ptr.style.opacity = "0";
  }, { passive: true });
})();

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
