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
  stats: null,        // letzte berechnete Statistik (für Avatar-Picker etc.)
  profile: { avatar_url: null, title: null, frame: null, unlockAll: false, isAdmin: false, specialTitle: null }, // eigene Kosmetik
  partCount: {},      // Teilnehmer je aktiver Challenge
};

// Jeder Skin ist ein Erfolg: Aufgabe (task) + Ziel (target) + aktueller Wert (cur) aus den
// Sammlungs-Metriken a. Freigeschaltet, sobald cur(a) >= target (oder Test-Freischaltung).
// Titel: gespeichert wird das Label. Rahmen: gespeichert wird die id.
const TITLES = [
  { label: "Frischling",          icon: "ti-seeding",      task: "Bist am Start",                  taskEn: "You're here",                    target: 0,   cur: () => 1 },
  { label: "Stammgast",           icon: "ti-photo",        task: "5 Challenges erledigen",         taskEn: "Complete 5 challenges",         target: 5,   cur: (a) => a.done },
  { label: "Plaudertasche 💬",     icon: "ti-message",      task: "20 Kommentare schreiben",        taskEn: "Write 20 comments",             target: 20,  cur: (a) => a.comments },
  { label: "Serientäter 🔥",       icon: "ti-flame",        task: "7 Tage Serie halten",            taskEn: "Keep a 7-day streak",           target: 7,   cur: (a) => a.streak },
  { label: "Liebling ❤️",          icon: "ti-heart",        task: "25 Likes erhalten",              taskEn: "Get 25 likes",                  target: 25,  cur: (a) => a.likesReceived },
  { label: "Frühaufsteher 🐦",     icon: "ti-medal",        task: "5× unter den ersten 3 sein",     taskEn: "Be in the first 3 five times",  target: 5,   cur: (a) => a.top3Count },
  { label: "Veteran 🎖️",           icon: "ti-award",        task: "25 Challenges erledigen",        taskEn: "Complete 25 challenges",        target: 25,  cur: (a) => a.done },
  { label: "Allgegenwärtig 🌗",    icon: "ti-clock",        task: "Zu allen 4 Tageszeiten posten",  taskEn: "Post at all 4 times of day",    target: 4,   cur: (a) => a.hoursCovered },
  { label: "Publikumsliebling 🌟", icon: "ti-stars",        task: "75 Likes erhalten",              taskEn: "Get 75 likes",                  target: 75,  cur: (a) => a.likesReceived },
  { label: "Geist 👻",             icon: "ti-ghost",        task: "In unter 60 Sek. nach Start posten", taskEn: "Post within 60s of start",  target: 1,   cur: (a) => a.within60 },
  { label: "Unaufhaltsam ⚡",       icon: "ti-bolt",         task: "30 Tage Serie — kein Aussetzer",  taskEn: "30-day streak — no misses",     target: 30,  cur: (a) => a.streak },
  { label: "Der Erste 🥇",         icon: "ti-trophy",       task: "10× als Erste:r einer Challenge", taskEn: "Be first in a challenge 10×",   target: 10,  cur: (a) => a.firstCount },
  { label: "Influencer 📣",        icon: "ti-speakerphone", task: "200 Likes erhalten",             taskEn: "Get 200 likes",                 target: 200, cur: (a) => a.likesReceived },
  { label: "Großmeister 🧠",        icon: "ti-brain",        task: "Level 20 erreichen",             taskEn: "Reach level 20",                target: 20,  cur: (a) => a.level },
  { label: "Mythos 🐉",            icon: "ti-dragon",       task: "Level 30 — fast unmöglich",       taskEn: "Level 30 — nearly impossible",  target: 30,  cur: (a) => a.level },
];
const FRAMES = [
  { id: "none",       label: "Kein Rahmen",   icon: "ti-circle",   task: "Standard",                    taskEn: "Default",                    target: 0,  cur: () => 1 },
  { id: "bronze",     label: "Bronze",        icon: "ti-medal",    task: "10 Challenges erledigen",     taskEn: "Complete 10 challenges",     target: 10, cur: (a) => a.done },
  { id: "silber",     label: "Silber",        icon: "ti-medal",    task: "50 Likes erhalten",           taskEn: "Get 50 likes",               target: 50, cur: (a) => a.likesReceived },
  { id: "gold",       label: "Gold",          icon: "ti-medal",    task: "Level 10 erreichen",          taskEn: "Reach level 10",             target: 10, cur: (a) => a.level },
  { id: "glow",       label: "Neon-Glow ✨",   icon: "ti-sparkles", task: "14 Tage Serie halten",        taskEn: "Keep a 14-day streak",       target: 14, cur: (a) => a.streak },
  { id: "diamant",    label: "Diamant 💎",     icon: "ti-diamond",  task: "Ein Beitrag mit 25+ Likes",   taskEn: "A post with 25+ likes",      target: 25, cur: (a) => a.maxLikes },
  { id: "feuer",      label: "Feuer 🔥",       icon: "ti-flame",    task: "30 Tage Serie halten",        taskEn: "Keep a 30-day streak",       target: 30, cur: (a) => a.streak },
  { id: "platin",     label: "Platin",        icon: "ti-shield",   task: "50 Challenges erledigen",     taskEn: "Complete 50 challenges",     target: 50, cur: (a) => a.done },
  { id: "regenbogen", label: "Regenbogen 🌈",  icon: "ti-rainbow",  task: "Level 30 — die Königsklasse", taskEn: "Level 30 — the king's class", target: 30, cur: (a) => a.level },
];

// Avatar-Element (Header/Profil) setzen: eigenes Foto oder Buchstabe, plus Rahmen-Klasse.
function applyAvatarEl(el, name, avatarUrl, frame, baseCls) {
  if (!el) return;
  el.className = baseCls + (frame && frame !== "none" ? " frame-" + frame : "") + (avatarUrl ? " has-img" : "");
  if (avatarUrl) { el.style.backgroundImage = `url('${avatarUrl}')`; el.textContent = ""; }
  else { el.style.backgroundImage = ""; el.textContent = Feed.initial(name); }
}
let pickedFile = null;
let registerMode = false;

// =====================================================================
//  Auth-Screen
// =====================================================================
function applyAuthMode() {
  $("usernameField").classList.toggle("hidden", !registerMode);
  $("primaryAuthBtn").textContent = registerMode ? t("auth.register") : t("auth.login");
  $("toggleText").textContent     = registerMode ? t("auth.haveAccount") : t("auth.noAccount");
  $("toggleModeBtn").textContent  = registerMode ? t("auth.login") : t("auth.register");
  setMessage($("authMessage"), "");
}
$("toggleModeBtn").addEventListener("click", () => { registerMode = !registerMode; applyAuthMode(); });

$("primaryAuthBtn").addEventListener("click", async () => {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;
  const username = $("usernameInput").value.trim();
  const btn = $("primaryAuthBtn");

  if (!email || !password) return setMessage($("authMessage"), t("auth.needCreds"), "error");
  if (registerMode && !username) return setMessage($("authMessage"), t("auth.needName"), "error");

  btn.disabled = true;
  setMessage($("authMessage"), t("auth.moment"));
  try {
    if (registerMode) {
      const res = await Auth.register(username, email, password);
      if (!res.session) {
        registerMode = false; applyAuthMode();
        setMessage($("authMessage"), t("auth.accountCreated"), "ok");
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
}

// Benachrichtigungs-Knopf im Profil: nur sichtbar, wenn Push noch aktiviert werden kann.
const profileNotifyBtn = $("profileNotifyBtn");
function refreshNotifyBtn() {
  profileNotifyBtn.classList.toggle("hidden", !(typeof Push !== "undefined" && Push.canPrompt()));
}
profileNotifyBtn.addEventListener("click", async () => {
  profileNotifyBtn.disabled = true;
  const ok = await Push.enable();
  profileNotifyBtn.disabled = false;
  refreshNotifyBtn();
  if (ok) alert(t("notify.enabled"));
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
    listEl.innerHTML = `<p class="spinner-text">${Feed.escape(t("common.error", { msg: err.message }))}</p>`;
    return;
  }
  try { state.partCount = await Stats.participantCounts(state.challenges.map((c) => c.id)); }
  catch (e) { state.partCount = {}; }
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
    const mLabel = (I18N.lang === "en" && s.milestone.labelEn) ? s.milestone.labelEn : s.milestone.label;
    toast(t("toast.streak", { label: Feed.escape(mLabel), xp: s.milestone.xp }), 5200);
  }
}

function renderBest(list) {
  const sec = $("bestSection"), el = $("bestPhotos");
  if (!list || !list.length) { sec.classList.add("hidden"); return; }
  el.innerHTML = list.map((p) => `
    <button class="best-cell" data-q="${p.quest_id}" data-title="${Feed.escape(p.quest_title)}" title="${Feed.escape(p.quest_title)}">
      <img src="${Feed.escape(p.image_url)}" loading="lazy" alt="" />
      <span class="best-likes"><i class="ti ti-heart"></i> ${p.likeCount}</span>
    </button>`).join("");
  el.querySelectorAll(".best-cell").forEach((c) =>
    c.addEventListener("click", () => goToFeed({ id: Number(c.dataset.q), title: c.dataset.title })));
  sec.classList.remove("hidden");
}

// Wann lief die Challenge? (heute/gestern + Uhrzeit, sonst Datum)
function archiveWhen(iso) {
  const d = new Date(iso), now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dayDiff = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()) -
     new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (dayDiff <= 0) return t("time.today") + " " + hm;
  if (dayDiff === 1) return t("time.yesterday") + " " + hm;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${hm}`;
}

function archiveGroup(label, items) {
  if (!items.length) return "";
  const rows = items.map((ch) => {
    const meta = Challenges.meta(ch.kind);
    return `<button class="archive-item" data-q="${ch.id}" data-title="${Feed.escape(ch.title)}">
        <i class="ti ${meta.icon}"></i>
        <span class="archive-title">${Feed.escape(ch.title)}</span>
        <span class="archive-when">${archiveWhen(ch.ends_at)}</span>
      </button>`;
  }).join("");
  return `<div class="arc-group">
      <button class="arc-group-head">
        <i class="ti ti-chevron-right arc-caret"></i><span class="arc-label">${label}</span>
        <span class="arc-count">${items.length}</span>
      </button>
      <div class="arc-group-body">${rows}</div>
    </div>`;
}

function renderArchive(list) {
  const sec = $("archiveSection"), el = $("archiveList");
  if (!list || !list.length) { sec.classList.add("hidden"); return; }
  const hourly = list.filter((c) => c.kind === "hourly");
  const daily  = list.filter((c) => c.kind !== "hourly"); // daily + special
  el.innerHTML = archiveGroup(t("ov.archiveHourly"), hourly) + archiveGroup(t("ov.archiveDaily"), daily);

  el.querySelectorAll(".arc-group-head").forEach((h) =>
    h.addEventListener("click", () => h.parentElement.classList.toggle("open")));
  el.querySelectorAll(".archive-item").forEach((c) =>
    c.addEventListener("click", () => goToFeed({ id: Number(c.dataset.q), title: c.dataset.title })));
  sec.classList.remove("hidden");
}

// ----- Melden -----
let reportTargetId = null;
function openReport(submissionId) {
  reportTargetId = submissionId;
  $("reportModal").classList.remove("hidden");
}
function closeReport() { reportTargetId = null; $("reportModal").classList.add("hidden"); }
async function submitReport(reason) {
  const id = reportTargetId;
  if (!id) return;
  closeReport();
  try {
    await Social.reportPost(id, reason);
    toast(t("rep.thanks"));
  } catch (e) { alert(t("rep.failed", { msg: e.message })); }
}

// ----- Admin: gemeldete Beiträge moderieren -----
function renderMod(list) {
  const sec = $("modSection"), el = $("modList");
  if (!sec) return;
  if (!list || !list.length) { sec.classList.add("hidden"); el.innerHTML = ""; return; }
  el.innerHTML = list.map((p) => `
    <div class="mod-item" data-id="${p.id}">
      <img src="${Feed.escape(p.image_url)}" alt="" loading="lazy" />
      <div class="mod-info">
        <div class="mod-user">${Feed.escape(p.username)} <span class="mod-count">🚩 ${p.count}</span></div>
        <div class="mod-quest">${Feed.escape(p.quest_title)}</div>
        ${p.reasons.length ? `<div class="mod-reasons">${p.reasons.map((r) => Feed.escape(r)).join(" · ")}</div>` : ""}
        <div class="mod-actions">
          <button class="soc-btn" data-act="approve"><i class="ti ti-check"></i> ${t("mod.approve")}</button>
          <button class="soc-btn ghost" data-act="delete"><i class="ti ti-trash"></i> ${t("mod.delete")}</button>
        </div>
      </div>
    </div>`).join("");
  el.querySelectorAll(".mod-item").forEach((row) => {
    row.querySelectorAll("button").forEach((b) => b.addEventListener("click", async () => {
      const act = b.dataset.act;
      if (act === "delete" && !confirm(t("mod.delConfirm"))) return;
      row.querySelectorAll("button").forEach((x) => (x.disabled = true));
      try { await Social.moderate(Number(row.dataset.id), act); loadMod(); }
      catch (e) { row.querySelectorAll("button").forEach((x) => (x.disabled = false)); alert(t("common.error", { msg: e.message })); }
    }));
  });
  sec.classList.remove("hidden");
}
function loadMod() {
  if (!state.profile.isAdmin) { const sec = $("modSection"); if (sec) sec.classList.add("hidden"); return; }
  Social.reportedPosts().then(renderMod).catch((e) => console.warn("[SideQuest] mod:", e.message));
}

function renderWeekly(list) {
  const section = $("weeklySection");
  const el = $("weeklyBoard");
  if (!list || !list.length) { section.classList.add("hidden"); return; }
  const medals = ["🥇", "🥈", "🥉"];
  el.innerHTML = list.map((w, i) => `
    <div class="wb-item${w.isMe ? " me" : ""}">
      <div class="wb-rank">${medals[i] || (i + 1) + "."}</div>
      <div class="wb-avatar">${Feed.escape(Feed.initial(w.username))}</div>
      <div class="wb-name">${Feed.escape(w.username)}${w.isMe ? ` <span class="wb-you">(${Feed.escape(t("wb.you"))})</span>` : ""}</div>
      <div class="wb-pts">${w.points} <span>XP</span></div>
    </div>`).join("");
  section.classList.remove("hidden");
}

async function loadStatsAndTop() {
  try {
    const s = await Stats.forMe();
    state.stats = s;
    if (s) renderStatsStrip($("statsStrip"), [
      { val: s.level,         label: t("stat.level"), cls: "level" },
      { val: s.streak,        label: t("stat.streak"), cls: "streak", icon: "ti-flame" },
      { val: s.likesReceived, label: t("stat.likes"), cls: "likes",  icon: "ti-heart" },
    ]);
    if (s) celebrateStreak(s);
    Stats.weeklyBoard().then(renderWeekly).catch((e) => console.warn("[SideQuest] weekly:", e.message));
    Stats.bestPhotos().then(renderBest).catch((e) => console.warn("[SideQuest] best:", e.message));
    Challenges.recent().then(renderArchive).catch((e) => console.warn("[SideQuest] archive:", e.message));
    loadMod(); // Admin: gemeldete Beiträge
    const top = await Stats.topToday(state.challenges.map((c) => c.id));
    renderTopToday(top);

    const com = await Stats.community(state.challenges.map((c) => c.id));
    const comEl = $("community");
    if (com.posts > 0) {
      comEl.innerHTML = t(com.posts === 1 ? "ov.communityOne" : "ov.communityMany", { posts: com.posts, people: com.people });
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
  refreshNotifyBtn();
  refreshFriendsBadge();
}

// Anfrage-Zähler am „Freunde"-Button (rot), damit man Anfragen trotz Overlay nicht verpasst.
async function refreshFriendsBadge() {
  const badge = $("friendsBadge");
  try {
    const fd = await Social.friendData();
    const n = fd.incoming.length;
    badge.textContent = n;
    badge.classList.toggle("hidden", n === 0);
  } catch (e) { badge.classList.add("hidden"); }
}

async function openFriends() {
  $("friendsModal").classList.remove("hidden");
  $("friendsList").innerHTML = `<p class="spinner-text">${t("common.loading")}</p>`;
  await renderSocial().catch((e) => console.warn("[SideQuest] social:", e.message));
  refreshFriendsBadge();
}
function closeFriends() { $("friendsModal").classList.add("hidden"); }

// Profil: Anfragen / Freunde / Folge-ich-Listen rendern.
async function renderSocial() {
  const [fd, follows] = await Promise.all([Social.friendData(), Social.myFollows()]);
  state.follows = follows;
  const ids = [...new Set([...fd.friends, ...follows, ...fd.incoming.map((i) => i.uid)])];
  const profs = await Feed.fetchProfiles(ids);
  const nameOf = (uid) => (profs[uid] && profs[uid].username) || "Jemand";
  const avatarOf = (uid) => Feed.avatarHTML(nameOf(uid), profs[uid] && profs[uid].avatar_url, profs[uid] && profs[uid].frame, "soc-avatar");
  const row = (uid, extra) => `<div class="soc-row" data-uid="${Feed.escape(uid)}">${avatarOf(uid)}<span class="soc-name">${Feed.escape(nameOf(uid))}</span>${extra}</div>`;

  // Eingehende Anfragen
  const reqWrap = $("friendRequests"), reqSec = $("friendRequestsSection");
  if (fd.incoming.length) {
    reqWrap.innerHTML = fd.incoming.map((r) =>
      `<div class="soc-row" data-id="${r.id}" data-uid="${Feed.escape(r.uid)}">${avatarOf(r.uid)}<span class="soc-name">${Feed.escape(nameOf(r.uid))}</span>
        <button class="soc-btn accept" data-act="accept"><i class="ti ti-check"></i> ${t("fr.accept")}</button>
        <button class="soc-btn ghost" data-act="decline" aria-label="Ablehnen"><i class="ti ti-x"></i></button></div>`).join("");
    reqSec.classList.remove("hidden");
    reqWrap.querySelectorAll(".soc-btn").forEach((b) => b.addEventListener("click", async () => {
      const rowEl = b.closest(".soc-row");
      rowEl.querySelectorAll(".soc-btn").forEach((x) => (x.disabled = true));
      try { await Social.respondFriend(Number(rowEl.dataset.id), b.dataset.act === "accept"); await renderSocial(); }
      catch (e) { rowEl.querySelectorAll(".soc-btn").forEach((x) => (x.disabled = false)); alert(t("common.error", { msg: e.message })); }
    }));
  } else { reqSec.classList.add("hidden"); }

  // Freunde
  const friends = [...fd.friends];
  $("friendsCount").textContent = friends.length;
  const frWrap = $("friendsList");
  frWrap.innerHTML = friends.length
    ? friends.map((uid) => row(uid, `<button class="soc-btn ghost" data-act="unfriend">${t("fr.remove")}</button>`)).join("")
    : `<p class="soc-empty">${Feed.escape(t("fr.noFriends"))}</p>`;
  frWrap.querySelectorAll('[data-act="unfriend"]').forEach((b) => b.addEventListener("click", async () => {
    if (!confirm(t("fr.endConfirm"))) return;
    b.disabled = true;
    try { await Social.unfriend(b.closest(".soc-row").dataset.uid); await renderSocial(); }
    catch (e) { b.disabled = false; alert(t("common.error", { msg: e.message })); }
  }));

  // Folge ich
  $("followsCount").textContent = follows.size;
  const foWrap = $("followsList");
  const fl = [...follows];
  foWrap.innerHTML = fl.length
    ? fl.map((uid) => {
        const tag = fd.friends.has(uid) ? `<span class="soc-tag">${t("fr.isFriend")}</span>`
          : fd.outgoing.has(uid) ? `<span class="soc-tag">${t("fr.requested")}</span>`
          : `<button class="soc-btn" data-act="friend">${t("fr.addFriend")}</button>`;
        return row(uid, tag + `<button class="soc-btn ghost" data-act="unfollow">${t("fr.unfollow")}</button>`);
      }).join("")
    : `<p class="soc-empty">${Feed.escape(t("fr.noFollows"))}</p>`;
  foWrap.querySelectorAll('[data-act="unfollow"]').forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try { await Social.toggleFollow(b.closest(".soc-row").dataset.uid, true); await renderSocial(); }
    catch (e) { b.disabled = false; alert(t("common.error", { msg: e.message })); }
  }));
  foWrap.querySelectorAll('[data-act="friend"]').forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try { await Social.sendFriendRequest(b.closest(".soc-row").dataset.uid); await renderSocial(); }
    catch (e) { b.disabled = false; alert(t("common.error", { msg: e.message })); }
  }));
}
function renderProfile(s) {
  if (!s) return;
  applyAvatarEl($("profileAvatar"), state.username, state.profile.avatar_url, state.profile.frame, "profile-avatar");
  $("profileName").textContent = state.username || t("feed.you");
  const pt = $("profileTitle");
  pt.textContent = state.profile.title || "";
  pt.classList.toggle("hidden", !state.profile.title);
  $("profileLevelLabel").textContent = t("prof.levelLabel", { n: s.level });
  $("profileXpFill").style.width = Math.round(s.progress * 100) + "%";
  $("profileXpHint").textContent = s.nextNeeded > 0
    ? t("prof.nextLevel", { xp: s.nextNeeded, lvl: s.level + 1 }) : t("prof.maxLevel");

  renderStatsStrip($("profileStats"), [
    { val: s.done,          label: t("stat.done"),      cls: "level" },
    { val: s.streak,        label: t("stat.streak"),         cls: "streak", icon: "ti-flame" },
    { val: s.likesReceived, label: t("stat.likesReceived"),cls: "likes",  icon: "ti-heart" },
  ]);

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
        if (!p || !confirm(t("post.delConfirm"))) return;
        btn.disabled = true;
        try {
          await Social.deleteSubmission(p.id, p.image_url);
          state.doneIds.delete(Number(btn.dataset.quest)); // Challenge wieder offen
          const fresh = await Stats.forMe();
          state.stats = fresh;
          renderProfile(fresh);
        } catch (e) { btn.disabled = false; alert(t("post.delFailed", { msg: e.message })); }
      });
    });
  }
}

// ----- Sammlung-Overlay (Erfolge + Titel/Rahmen ausrüsten) -----
function skinUnlocked(item, a) { return a.unlockAll || item.cur(a) >= item.target; }

function skinRow(item, kind, a) {
  const unlocked = skinUnlocked(item, a);
  const equipped = kind === "title"
    ? (state.profile.title || "Frischling") === item.label
    : (state.profile.frame || "none") === item.id;
  const val = kind === "title" ? item.label : item.id;
  const have = item.cur(a);
  const pct = item.target > 0 ? Math.min(100, Math.round(have / item.target * 100)) : 100;
  const preview = kind === "frame"
    ? `<span class="skin-prev frame-${item.id}"></span>`
    : `<span class="skin-prev skin-ico"><i class="ti ${item.icon}"></i></span>`;
  const btn = equipped
    ? '<button class="skin-btn on" disabled><i class="ti ti-check"></i></button>'
    : unlocked
      ? `<button class="skin-btn" data-kind="${kind}" data-val="${Feed.escape(val)}">${t("col.equip")}</button>`
      : '<button class="skin-btn locked" disabled><i class="ti ti-lock"></i></button>';
  return `<div class="skin-row${unlocked ? "" : " locked"}">
      ${preview}
      <div class="skin-main">
        <div class="skin-name">${Feed.escape(item.label)}</div>
        <div class="skin-task">${unlocked ? "✓ " : ""}${Feed.escape((I18N.lang === "en" && item.taskEn) ? item.taskEn : item.task)}${item.target > 0 && !unlocked ? ` · ${have}/${item.target}` : ""}</div>
        ${item.target > 0 ? `<div class="skin-bar"><div style="width:${pct}%"></div></div>` : ""}
      </div>
      ${btn}
    </div>`;
}

function renderCollection(a) {
  // Spezial-Titel (per Supabase persönlich vergeben) – immer ausrüstbar, ganz oben.
  const special = state.profile.specialTitle;
  if (special) {
    const item = { label: special, icon: "ti-crown", task: t("col.specialTask"), target: 0, cur: () => 1 };
    $("collectionSpecial").innerHTML = skinRow(item, "title", a);
    $("collectionSpecialSection").classList.remove("hidden");
  } else {
    $("collectionSpecial").innerHTML = "";
    $("collectionSpecialSection").classList.add("hidden");
  }

  $("collectionTitles").innerHTML = TITLES.map((t) => skinRow(t, "title", a)).join("");
  $("collectionFrames").innerHTML = FRAMES.map((f) => skinRow(f, "frame", a)).join("");
  const total = TITLES.length + FRAMES.length;
  const got = TITLES.filter((t) => skinUnlocked(t, a)).length + FRAMES.filter((f) => skinUnlocked(f, a)).length;
  $("collectionCount").textContent = t("col.unlocked", { got, total });

  document.querySelectorAll("#collectionModal .skin-btn[data-kind]").forEach((b) => {
    b.addEventListener("click", async () => {
      const kind = b.dataset.kind, val = b.dataset.val;
      const patch = kind === "title"
        ? { title: val === "Frischling" ? null : val }
        : { frame: val === "none" ? null : val };
      b.disabled = true;
      try {
        await Social.saveProfile(patch);
        if (kind === "title") state.profile.title = patch.title;
        else state.profile.frame = patch.frame;
        applyAvatarEl($("headerAvatar"), state.username, state.profile.avatar_url, state.profile.frame, "avatar");
        applyAvatarEl($("profileAvatar"), state.username, state.profile.avatar_url, state.profile.frame, "profile-avatar");
        const pt = $("profileTitle");
        pt.textContent = state.profile.title || "";
        pt.classList.toggle("hidden", !state.profile.title);
        renderCollection(a);
      } catch (e) { b.disabled = false; alert(t("common.saveFailed", { msg: e.message })); }
    });
  });
}

async function openCollection() {
  $("collectionModal").classList.remove("hidden");
  $("collectionTitles").innerHTML = `<p class="spinner-text">${t("common.loading")}</p>`;
  $("collectionFrames").innerHTML = "";
  $("collectionCount").textContent = "";
  try {
    const a = await Stats.collection();
    if (!a) return;
    a.unlockAll = state.profile.unlockAll;
    renderCollection(a);
  } catch (e) {
    $("collectionTitles").innerHTML = `<p class="spinner-text">${Feed.escape(t("common.error", { msg: e.message }))}</p>`;
  }
}
function closeCollection() { $("collectionModal").classList.add("hidden"); }

// Avatar-Picker: aus den eigenen Beiträgen wählen (oder zurück auf Buchstabe).
function openAvatarPicker(s) {
  const grid = $("avatarPickerGrid");
  const posts = (s && s.posts) || [];
  const cells = [
    `<button class="ap-cell ap-upload" data-upload="1"><i class="ti ti-photo-up"></i><span>${t("ap.gallery")}</span></button>`,
    `<button class="ap-cell ap-letter" data-url="">${Feed.escape(Feed.initial(state.username))}</button>`,
  ].concat(posts.map((p) =>
      `<button class="ap-cell" data-url="${Feed.escape(p.image_url)}"><img src="${Feed.escape(p.image_url)}" alt="" loading="lazy" /></button>`));
  grid.innerHTML = cells.join("");
  $("avatarPickerHint").classList.remove("hidden");
  grid.querySelectorAll(".ap-cell").forEach((c) => {
    c.addEventListener("click", async () => {
      if (c.dataset.upload) { $("avatarFile").click(); return; } // beliebiges Bild aus der Galerie
      const url = c.dataset.url || null;
      grid.querySelectorAll(".ap-cell").forEach((x) => (x.disabled = true));
      try {
        await Social.saveProfile({ avatar_url: url });
        state.profile.avatar_url = url;
        applyAvatarEl($("headerAvatar"), state.username, url, state.profile.frame, "avatar");
        applyAvatarEl($("profileAvatar"), state.username, url, state.profile.frame, "profile-avatar");
        closeAvatarPicker();
      } catch (e) {
        grid.querySelectorAll(".ap-cell").forEach((x) => (x.disabled = false));
        alert(t("common.saveFailed", { msg: e.message }));
      }
    });
  });
  $("avatarPicker").classList.remove("hidden");
}
function closeAvatarPicker() { $("avatarPicker").classList.add("hidden"); }

// Feed-Umschalter (Alle | Freunde) – aktive Markierung setzen.
function syncFeedToggle() {
  document.querySelectorAll("#feedToggle button").forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === (Feed.mode || "all")));
}

async function refreshGreeting() {
  const user = await Auth.getUser();
  if (!user) return;
  // Mit Kosmetik-Spalten laden; falls noch nicht angelegt -> Fallback auf username.
  let res = await sb.from("profiles").select("username, avatar_url, title, frame, unlock_all, is_admin, special_title").eq("id", user.id).maybeSingle();
  if (res.error) res = await sb.from("profiles").select("username").eq("id", user.id).maybeSingle();
  const data = res.data || {};
  state.username = data.username || user.email.split("@")[0];
  state.profile = { avatar_url: data.avatar_url || null, title: data.title || null, frame: data.frame || null, unlockAll: !!data.unlock_all, isAdmin: !!data.is_admin, specialTitle: data.special_title || null };
  $("greetingName").textContent = `Hi, ${state.username}!`;
  applyAvatarEl($("headerAvatar"), state.username, state.profile.avatar_url, state.profile.frame, "avatar");
}

function renderOverview() {
  const listEl = $("challengeList");
  listEl.innerHTML = "";

  if (!state.challenges.length) {
    listEl.innerHTML =
      `<div class="empty-state"><i class="ti ti-mood-empty"></i>${Feed.escape(t("ov.empty"))}</div>`;
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
      <div class="cc-meta">
        <span class="cc-part">${(state.partCount[ch.id] || 0) > 0
          ? `<i class="ti ti-users"></i> ${Feed.escape(t("cc.participants", { n: state.partCount[ch.id] }))}`
          : `<i class="ti ti-sparkles"></i> ${Feed.escape(t("cc.beFirst"))}`}</span>
        <span class="cc-xp">+10 XP</span>
      </div>
      <div class="cc-action ${done ? "done" : ""}">
        ${done ? `<i class="ti ti-check"></i> ${Feed.escape(t("cc.doneView"))}` : Feed.escape(t("cc.start"))}
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
  syncFeedToggle();
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

// Feed: Alle | Freunde umschalten
document.querySelectorAll("#feedToggle button").forEach((b) => {
  b.addEventListener("click", () => {
    Feed.mode = b.dataset.mode;
    syncFeedToggle();
    if (Feed.current) Feed.render(Feed.current.quest, Feed.current.onDeleted);
  });
});

// Profil: Avatar antippen -> Bild aus eigenen Fotos wählen
$("profileAvatar").addEventListener("click", () => openAvatarPicker(state.stats));
$("avatarPickerClose").addEventListener("click", closeAvatarPicker);
$("avatarPicker").addEventListener("click", (e) => { if (e.target.id === "avatarPicker") closeAvatarPicker(); });

// Beliebiges Bild aus der Galerie als Profilbild hochladen
$("avatarFile").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const grid = $("avatarPickerGrid");
  grid.querySelectorAll(".ap-cell").forEach((x) => (x.disabled = true));
  try {
    const url = await Upload.avatar(file);
    await Social.saveProfile({ avatar_url: url });
    state.profile.avatar_url = url;
    applyAvatarEl($("headerAvatar"), state.username, url, state.profile.frame, "avatar");
    applyAvatarEl($("profileAvatar"), state.username, url, state.profile.frame, "profile-avatar");
    closeAvatarPicker();
  } catch (err) {
    grid.querySelectorAll(".ap-cell").forEach((x) => (x.disabled = false));
    alert(t("ap.uploadFailed", { msg: err.message }));
  }
});

// Melde-Dialog
$("reportClose").addEventListener("click", closeReport);
$("reportModal").addEventListener("click", (e) => { if (e.target.id === "reportModal") closeReport(); });
document.querySelectorAll("#reportModal [data-reason]").forEach((b) =>
  b.addEventListener("click", () => submitReport(b.dataset.reason)));

// Freunde-Overlay
$("openFriendsBtn").addEventListener("click", openFriends);
$("friendsClose").addEventListener("click", closeFriends);
$("friendsModal").addEventListener("click", (e) => { if (e.target.id === "friendsModal") closeFriends(); });

// Sammlung-Overlay (Erfolge + Skins)
$("openCollectionBtn").addEventListener("click", openCollection);
$("collectionClose").addEventListener("click", closeCollection);
$("collectionModal").addEventListener("click", (e) => { if (e.target.id === "collectionModal") closeCollection(); });

// Info-Panel „So funktioniert's"
$("infoBtn").addEventListener("click", () => $("infoModal").classList.remove("hidden"));
$("infoClose").addEventListener("click", () => $("infoModal").classList.add("hidden"));
$("infoModal").addEventListener("click", (e) => { if (e.target.id === "infoModal") $("infoModal").classList.add("hidden"); });

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
    msg.textContent = t("ov.suggest.thanks");
    msg.className = "suggest-msg ok";
  } catch (err) {
    msg.textContent = err.message || t("common.failed", { msg: "" });
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
  if (/Invalid login credentials/i.test(msg)) return t("err.invalidLogin");
  if (/User already registered/i.test(msg))   return t("err.alreadyRegistered");
  if (/Password should be at least/i.test(msg)) return t("err.passwordShort");
  if (/Email not confirmed/i.test(msg))        return t("err.emailNotConfirmed");
  if (/Failed to fetch|NetworkError/i.test(msg)) return t("err.network");
  if (/row-level security/i.test(msg))         return t("err.rls");
  return msg;
}

// =====================================================================
//  Sprache (i18n)
// =====================================================================
// Sichtbaren Screen + offene Overlays nach Sprachwechsel neu zeichnen.
function relocalize() {
  if (!$("overviewScreen").classList.contains("hidden")) { renderOverview(); loadStatsAndTop(); }
  else if (!$("profileScreen").classList.contains("hidden")) { if (state.stats) renderProfile(state.stats); refreshNotifyBtn(); }
  else if (!$("challengeScreen").classList.contains("hidden") && state.current) showChallengeDetail(state.current);
  else if (!$("feedScreen").classList.contains("hidden") && state.current) goToFeed(state.current);
  if (!$("collectionModal").classList.contains("hidden")) openCollection();
  if (!$("friendsModal").classList.contains("hidden")) renderSocial();
}
document.querySelectorAll(".lang-toggle button").forEach((b) =>
  b.addEventListener("click", () => I18N.set(b.dataset.lang)));

// =====================================================================
//  Start: Session beobachten
// =====================================================================
document.documentElement.lang = I18N.lang;
I18N.apply();          // statische Texte in der gewählten Sprache
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
  // Lokale Session prüfen (kein Netzwerk-Check) -> bleibt eingeloggt, auch bei wackeligem Netz.
  const session = await Auth.getSession();
  if (session) await enterApp();
  else showScreen("authScreen");
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
