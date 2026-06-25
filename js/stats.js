// =====================================================================
//  stats.js – Serie, Level/XP, Abzeichen, Top-3 (alles aus vorhandenen Daten)
// =====================================================================

const Stats = {

  localDate(iso) {
    const d = iso ? new Date(iso) : new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  // Serie = aufeinanderfolgende Tage mit mind. 1 Beitrag, bis heute (1 Tag Gnade).
  computeStreak(subs) {
    const days = new Set(subs.map((s) => Stats.localDate(s.created_at)));
    let streak = 0;
    const d = new Date();
    if (!days.has(Stats.localDate())) d.setDate(d.getDate() - 1); // heute noch nichts? ab gestern zählen
    while (days.has(Stats.localDate(d.toISOString()))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  },

  level(xp) {
    const level = Math.floor(Math.sqrt(xp / 25)) + 1;
    const curFloor = 25 * Math.pow(level - 1, 2);
    const nextFloor = 25 * Math.pow(level, 2);
    const progress = nextFloor > curFloor ? (xp - curFloor) / (nextFloor - curFloor) : 0;
    return { level, progress, nextNeeded: Math.max(0, nextFloor - xp) };
  },

  // Serien-Meilensteine: ab X Tagen Serie gibt es einmalig Bonus-XP + Glückwunsch.
  streakMilestones: [
    { days: 3,  xp: 25,  label: "3 Tage am Stück 🔥" },
    { days: 7,  xp: 60,  label: "Eine ganze Woche! 🔥🔥" },
    { days: 14, xp: 150, label: "14 Tage – Maschine! ⚡" },
    { days: 30, xp: 400, label: "30 Tage – Legende! 👑" },
    { days: 100,xp: 1500,label: "100 Tage – unsterblich! 🏆" },
  ],

  // Summe der Bonus-XP aller bereits erreichten Serien-Meilensteine.
  streakBonus(streak) {
    return Stats.streakMilestones
      .filter((m) => streak >= m.days)
      .reduce((sum, m) => sum + m.xp, 0);
  },

  // Höchster bereits erreichter Meilenstein (oder null) – für den Glückwunsch-Toast.
  topMilestone(streak) {
    let hit = null;
    for (const m of Stats.streakMilestones) if (streak >= m.days) hit = m;
    return hit;
  },

  badges({ done, likesReceived, streak }) {
    return [
      { icon: "ti-camera",        label: "Erster Beitrag", unlocked: done >= 1 },
      { icon: "ti-flame",         label: "Serie x3",       unlocked: streak >= 3 },
      { icon: "ti-photo",         label: "Aktiv (5)",      unlocked: done >= 5 },
      { icon: "ti-heart",         label: "Beliebt (10)",   unlocked: likesReceived >= 10 },
      { icon: "ti-trophy",        label: "Star (25 Likes)",unlocked: likesReceived >= 25 },
      { icon: "ti-medal",         label: "Veteran (20)",   unlocked: done >= 20 },
    ];
  },

  // Komplette Statistik des eingeloggten Users (inkl. eigener Beiträge für die Galerie).
  async forMe() {
    const user = await Auth.getUser();
    if (!user) return null;

    const { data: subs } = await sb
      .from("submissions")
      .select("id, created_at, image_url, quest_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    const posts = subs || [];
    const done = posts.length;

    let likesReceived = 0;
    if (posts.length) {
      const { count } = await sb
        .from("likes")
        .select("*", { count: "exact", head: true })
        .in("submission_id", posts.map((p) => p.id));
      likesReceived = count || 0;
    }

    const streak = Stats.computeStreak(posts);
    const streakBonus = Stats.streakBonus(streak);
    const xp = done * 10 + likesReceived * 5 + streakBonus;
    const lvl = Stats.level(xp);

    return {
      done, likesReceived, streak, xp, streakBonus,
      milestone: Stats.topMilestone(streak),
      level: lvl.level, progress: lvl.progress, nextNeeded: lvl.nextNeeded,
      badges: Stats.badges({ done, likesReceived, streak }),
      posts,
    };
  },

  // Wochen-Bestenliste: Rangliste der letzten 7 Tage.
  // Punkte = Beiträge*10 + erhaltene Likes*5 (nur auf Beiträge dieser Woche).
  async weeklyBoard() {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: subs } = await sb
      .from("submissions")
      .select("id, user_id, created_at")
      .gte("created_at", since);
    if (!subs || !subs.length) return [];

    const likes = await Social.likesFor(subs.map((s) => s.id));
    const userIds = [...new Set(subs.map((s) => s.user_id))];
    const { data: profs } = await sb.from("profiles").select("id, username").in("id", userIds);
    const nameById = {};
    (profs || []).forEach((p) => { nameById[p.id] = p.username; });

    const byUser = {};
    for (const s of subs) {
      const u = (byUser[s.user_id] = byUser[s.user_id] || { posts: 0, likes: 0 });
      u.posts += 1;
      u.likes += likes.countById[s.id] || 0;
    }

    const me = await Auth.getUser();
    return Object.entries(byUser)
      .map(([uid, v]) => ({
        username: nameById[uid] || "Jemand",
        points: v.posts * 10 + v.likes * 5,
        posts: v.posts,
        isMe: me && uid === me.id,
      }))
      .sort((a, b) => b.points - a.points || b.posts - a.posts)
      .slice(0, 5);
  },

  // Community-Stat: wie viele Beiträge + wie viele Leute heute (zu den aktiven Challenges).
  async community(challengeIds) {
    if (!challengeIds || !challengeIds.length) return { posts: 0, people: 0 };
    const { data } = await sb.from("submissions").select("user_id").in("quest_id", challengeIds);
    const rows = data || [];
    return { posts: rows.length, people: new Set(rows.map((r) => r.user_id)).size };
  },

  // Wie viele haben je aktiver Challenge schon gepostet? (für „N dabei" auf der Karte)
  async participantCounts(challengeIds) {
    const map = {};
    if (!challengeIds || !challengeIds.length) return map;
    const { data } = await sb.from("submissions").select("quest_id").in("quest_id", challengeIds);
    (data || []).forEach((r) => { map[r.quest_id] = (map[r.quest_id] || 0) + 1; });
    return map;
  },

  // Beste Bilder der Woche: Top-Beiträge der letzten 7 Tage nach Likes (Top 6).
  async bestPhotos() {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: subs } = await sb
      .from("submissions")
      .select("id, user_id, image_url, quest_id, created_at")
      .gte("created_at", since);
    if (!subs || !subs.length) return [];

    const likes = await Social.likesFor(subs.map((s) => s.id));
    const ranked = subs
      .map((s) => ({ ...s, likeCount: likes.countById[s.id] || 0 }))
      .sort((a, b) => b.likeCount - a.likeCount || new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 6);

    const uids = [...new Set(ranked.map((s) => s.user_id))];
    const qids = [...new Set(ranked.map((s) => s.quest_id))];
    const [profs, quests] = await Promise.all([
      sb.from("profiles").select("id, username").in("id", uids),
      sb.from("quests").select("id, title").in("id", qids),
    ]);
    const nameById = {}; (profs.data || []).forEach((p) => { nameById[p.id] = p.username; });
    const titleById = {}; (quests.data || []).forEach((q) => { titleById[q.id] = q.title; });

    return ranked.map((s) => ({
      image_url: s.image_url,
      likeCount: s.likeCount,
      username: nameById[s.user_id] || "Jemand",
      quest_id: s.quest_id,
      quest_title: titleById[s.quest_id] || "",
    }));
  },

  // Die beliebtesten Beiträge (nach Likes) zu den gerade aktiven Challenges.
  async topToday(challengeIds) {
    if (!challengeIds || !challengeIds.length) return [];
    const { data: subs } = await sb
      .from("submissions")
      .select("id, user_id, image_url")
      .in("quest_id", challengeIds);
    if (!subs || !subs.length) return [];

    const likes = await Social.likesFor(subs.map((s) => s.id));
    const userIds = [...new Set(subs.map((s) => s.user_id))];
    const { data: profs } = await sb.from("profiles").select("id, username").in("id", userIds);
    const nameById = {};
    (profs || []).forEach((p) => { nameById[p.id] = p.username; });

    return subs
      .map((s) => ({
        image_url: s.image_url,
        likeCount: likes.countById[s.id] || 0,
        username: nameById[s.user_id] || "Jemand",
      }))
      .filter((s) => s.likeCount > 0)
      .sort((a, b) => b.likeCount - a.likeCount)
      .slice(0, 3);
  },
};
