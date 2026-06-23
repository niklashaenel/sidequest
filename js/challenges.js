// =====================================================================
//  challenges.js – aktive Challenges laden (Typ + Zeitfenster) + Countdown
// =====================================================================

const Challenges = {

  // Anzeige-Infos je Challenge-Typ (Label, Icon-CSS-Klasse, Tabler-Icon).
  kindMeta: {
    hourly:  { label: "Stündlich",       icon: "ti-bolt", cls: "k-hourly"  },
    daily:   { label: "Tages-Challenge", icon: "ti-sun",  cls: "k-daily"   },
    special: { label: "Spezial-Event",   icon: "ti-star", cls: "k-special" },
  },
  meta(kind) {
    return Challenges.kindMeta[kind] || { label: "Challenge", icon: "ti-flag", cls: "k-daily" };
  },

  // Alle Challenges, die GERADE aktiv sind (starts_at <= jetzt <= ends_at).
  async active() {
    const nowIso = new Date().toISOString();
    const { data, error } = await sb
      .from("quests")
      .select("id, title, kind, starts_at, ends_at")
      .lte("starts_at", nowIso)
      .gte("ends_at", nowIso)
      .order("ends_at", { ascending: true });
    if (error) throw error;
    return data || [];
  },

  // Für welche dieser Challenges hat der eingeloggte User schon eingereicht?
  // Liefert ein Set mit den quest_ids.
  async doneIds(challengeIds) {
    const user = await Auth.getUser();
    if (!user || !challengeIds.length) return new Set();
    const { data, error } = await sb
      .from("submissions")
      .select("quest_id")
      .eq("user_id", user.id)
      .in("quest_id", challengeIds);
    if (error) throw error;
    return new Set((data || []).map((r) => r.quest_id));
  },

  // Restzeit bis ends_at hübsch formatieren, z. B. "23:11 Min", "6 Std", "2 Tage".
  formatRemaining(endsAtIso) {
    const ms = new Date(endsAtIso).getTime() - Date.now();
    if (ms <= 0) return "abgelaufen";
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    const secs = Math.floor((ms % 60000) / 1000);
    if (days >= 1) return days + (days === 1 ? " Tag" : " Tage");
    if (hours >= 1) return hours + " Std " + mins + " Min";
    // Unter 1 Stunde: live mitzählende mm:ss-Anzeige
    return String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0") + " Min";
  },

  // Soll der Countdown sekündlich blinken/warnen? (unter 1 Stunde Restzeit)
  isUrgent(endsAtIso) {
    const ms = new Date(endsAtIso).getTime() - Date.now();
    return ms > 0 && ms < 3600000;
  },
};
