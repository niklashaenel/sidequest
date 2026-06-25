// =====================================================================
//  challenges.js – aktive Challenges laden (Typ + Zeitfenster) + Countdown
// =====================================================================

const Challenges = {

  // Anzeige-Infos je Challenge-Typ (Label-Key, Icon-CSS-Klasse, Tabler-Icon).
  kindMeta: {
    hourly:  { labelKey: "kind.hourly",  icon: "ti-bolt", cls: "k-hourly"  },
    daily:   { labelKey: "kind.daily",   icon: "ti-sun",  cls: "k-daily"   },
    special: { labelKey: "kind.special", icon: "ti-star", cls: "k-special" },
  },
  meta(kind) {
    const m = Challenges.kindMeta[kind] || { labelKey: "kind.generic", icon: "ti-flag", cls: "k-daily" };
    return { label: t(m.labelKey), icon: m.icon, cls: m.cls };
  },

  // Challenge-Titel in der aktuellen Sprache (englischer Titel, falls vorhanden + EN gewählt).
  titleOf(q) {
    if (!q) return "";
    return (I18N.lang === "en" && q.title_en) ? q.title_en : q.title;
  },

  // Sorgt (serverseitig) dafür, dass für JETZT eine Tages- + Stunden-Challenge
  // existiert – automatisch aus dem Challenge-Pool. Fehler nur loggen, nicht blockieren.
  async ensure() {
    try {
      const { error } = await sb.rpc("ensure_active_challenges");
      if (error) console.warn("[SideQuest] ensure_active_challenges:", error.message);
    } catch (e) {
      console.warn("[SideQuest] ensure_active_challenges:", e.message);
    }
  },

  // Alle Challenges, die GERADE aktiv sind (starts_at <= jetzt <= ends_at).
  async active() {
    const nowIso = new Date().toISOString();
    const q = (cols) => sb.from("quests").select(cols)
      .lte("starts_at", nowIso).gte("ends_at", nowIso).order("ends_at", { ascending: true });
    let res = await q("id, title, title_en, kind, starts_at, ends_at");
    if (res.error) res = await q("id, title, kind, starts_at, ends_at"); // title_en-Spalte noch nicht da
    if (res.error) throw res.error;
    return res.data || [];
  },

  // Vergangene Challenges der letzten 7 Tage (abgelaufen, nur noch ansehbar – kein Upload).
  async recent() {
    const now = new Date().toISOString();
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const q = (cols) => sb.from("quests").select(cols)
      .lt("ends_at", now).gte("ends_at", since).order("ends_at", { ascending: false });
    let res = await q("id, title, title_en, kind, starts_at, ends_at");
    if (res.error) res = await q("id, title, kind, starts_at, ends_at");
    if (res.error) throw res.error;
    return res.data || [];
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
    if (ms <= 0) return t("time.expired");
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    const secs = Math.floor((ms % 60000) / 1000);
    if (days >= 1) return days + " " + (days === 1 ? t("time.day") : t("time.days"));
    if (hours >= 1) return hours + " " + t("word.std") + " " + mins + " " + t("word.min");
    // Unter 1 Stunde: live mitzählende mm:ss-Anzeige
    return String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0") + " " + t("word.min");
  },

  // Soll der Countdown sekündlich blinken/warnen? (unter 1 Stunde Restzeit)
  isUrgent(endsAtIso) {
    const ms = new Date(endsAtIso).getTime() - Date.now();
    return ms > 0 && ms < 3600000;
  },
};
