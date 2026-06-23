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
    const xp = done * 10 + likesReceived * 5;
    const lvl = Stats.level(xp);

    return {
      done, likesReceived, streak, xp,
      level: lvl.level, progress: lvl.progress, nextNeeded: lvl.nextNeeded,
      badges: Stats.badges({ done, likesReceived, streak }),
      posts,
    };
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
