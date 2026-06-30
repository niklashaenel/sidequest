// =====================================================================
//  social.js – Likes & Kommentare
// =====================================================================

const Social = {

  // Likes für mehrere Beiträge auf einmal holen.
  // Liefert: countById (wie viele Likes je Beitrag) + likedByMe (Set meiner Likes).
  async likesFor(submissionIds) {
    const countById = {};
    const likedByMe = new Set();
    if (!submissionIds.length) return { countById, likedByMe };

    const user = await Auth.getUser();
    const { data, error } = await sb
      .from("likes")
      .select("submission_id, user_id")
      .in("submission_id", submissionIds);
    if (error) throw error;

    (data || []).forEach((row) => {
      countById[row.submission_id] = (countById[row.submission_id] || 0) + 1;
      if (user && row.user_id === user.id) likedByMe.add(row.submission_id);
    });
    return { countById, likedByMe };
  },

  // Like setzen oder entfernen. Gibt den neuen Zustand zurück (true = jetzt geliked).
  async toggleLike(submissionId, currentlyLiked) {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));

    if (currentlyLiked) {
      const { error } = await sb.from("likes")
        .delete().eq("submission_id", submissionId).eq("user_id", user.id);
      if (error) throw error;
      return false;
    } else {
      const { error } = await sb.from("likes")
        .insert({ submission_id: submissionId, user_id: user.id });
      if (error) throw error;
      return true;
    }
  },

  // ---- Reaktionen (eine Emoji-Reaktion pro User & Beitrag) ----
  REACTIONS: ["😂", "🔥", "😍", "😮", "👏"],

  // Reaktionen für mehrere Beiträge holen.
  // Liefert: countById[subId] = {emoji: anzahl}, mineById[subId] = mein-emoji|undefined.
  // Fail-soft: fehlt die Tabelle noch, kommt einfach Leeres zurück (Feed bleibt heil).
  async reactionsFor(submissionIds) {
    const countById = {}; const mineById = {};
    if (!submissionIds.length) return { countById, mineById };
    try {
      const user = await Auth.getUser();
      const { data, error } = await sb
        .from("reactions")
        .select("submission_id, user_id, emoji")
        .in("submission_id", submissionIds);
      if (error) throw error;
      (data || []).forEach((r) => {
        const m = (countById[r.submission_id] = countById[r.submission_id] || {});
        m[r.emoji] = (m[r.emoji] || 0) + 1;
        if (user && r.user_id === user.id) mineById[r.submission_id] = r.emoji;
      });
    } catch (e) { console.warn("[SideQuest] reactionsFor:", e.message); }
    return { countById, mineById };
  },

  // Reaktion setzen/wechseln/entfernen. Gibt das neue eigene Emoji zurück (oder null).
  async setReaction(submissionId, emoji, current) {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));
    if (current === emoji) {
      const { error } = await sb.from("reactions")
        .delete().eq("submission_id", submissionId).eq("user_id", user.id);
      if (error) throw error;
      return null;
    }
    const { error } = await sb.from("reactions")
      .upsert({ submission_id: submissionId, user_id: user.id, emoji }, { onConflict: "submission_id,user_id" });
    if (error) throw error;
    return emoji;
  },

  // Anzahl Kommentare je Beitrag (für die Zähler im Feed).
  async commentCountsFor(submissionIds) {
    const countById = {};
    if (!submissionIds.length) return countById;
    const { data, error } = await sb
      .from("comments")
      .select("submission_id")
      .in("submission_id", submissionIds);
    if (error) throw error;
    (data || []).forEach((row) => {
      countById[row.submission_id] = (countById[row.submission_id] || 0) + 1;
    });
    return countById;
  },

  // Alle Kommentare eines Beitrags inkl. Anzeigename (zweite Abfrage für Namen).
  async commentsFor(submissionId) {
    const { data, error } = await sb
      .from("comments")
      .select("id, user_id, body, created_at")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) return [];

    const ids = [...new Set(rows.map((r) => r.user_id))];
    const { data: profs } = await sb.from("profiles").select("id, username").in("id", ids);
    const nameById = {};
    (profs || []).forEach((p) => { nameById[p.id] = p.username; });

    return rows.map((r) => ({
      body: r.body,
      created_at: r.created_at,
      username: nameById[r.user_id] || t("feed.someone"),
    }));
  },

  // Eigenen Beitrag löschen: Foto(s) aus dem Storage + DB-Zeile (Likes/Kommentare per cascade weg).
  // imageUrl kann eine URL ODER ein Array von URLs sein (Multi-Foto).
  async deleteSubmission(id, imageUrl) {
    // Storage-Pfade aus den öffentlichen URLs ziehen und Dateien entfernen (Fehler hier egal).
    try {
      const marker = "/submissions/";
      const urls = (Array.isArray(imageUrl) ? imageUrl : [imageUrl]).filter(Boolean);
      const paths = urls.map((u) => {
        const i = u.indexOf(marker);
        return i >= 0 ? decodeURIComponent(u.slice(i + marker.length).split("?")[0]) : null;
      }).filter(Boolean);
      if (paths.length) await sb.storage.from("submissions").remove(paths);
    } catch (e) { /* DB-Zeile ist das Wichtige */ }

    // .select() zurückgeben lassen: bei 0 gelöschten Zeilen (fehlende Berechtigung/Policy)
    // werfen wir bewusst einen Fehler, statt fälschlich "gelöscht" zu melden.
    const { data, error } = await sb.from("submissions").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Keine Berechtigung zum Löschen.");
  },

  // ---- Freunde (Follow-Modell) ----
  // Wem folge ich? Set von friend_ids. Fail-soft (fehlt die Tabelle -> leeres Set).
  async myFollows() {
    const set = new Set();
    try {
      const user = await Auth.getUser();
      if (!user) return set;
      const { data, error } = await sb.from("friendships")
        .select("friend_id").eq("user_id", user.id);
      if (error) throw error;
      (data || []).forEach((r) => set.add(r.friend_id));
    } catch (e) { console.warn("[SideQuest] myFollows:", e.message); }
    return set;
  },

  // Folgen / Entfolgen. Gibt den neuen Zustand zurück (true = folge jetzt).
  async toggleFollow(friendId, currentlyFollowing) {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));
    if (user.id === friendId) throw new Error("Dir selbst kannst du nicht folgen.");
    if (currentlyFollowing) {
      const { error } = await sb.from("friendships")
        .delete().eq("user_id", user.id).eq("friend_id", friendId);
      if (error) throw error;
      return false;
    }
    const { error } = await sb.from("friendships")
      .insert({ user_id: user.id, friend_id: friendId });
    if (error) throw error;
    return true;
  },

  // ---- Echte Freunde (mit Zustimmung) über friend_requests ----
  // Liefert: { friends:Set(uid), incoming:[{id,uid}], outgoing:Set(uid) }. Fail-soft.
  async friendData() {
    const out = { friends: new Set(), incoming: [], outgoing: new Set() };
    try {
      const user = await Auth.getUser();
      if (!user) return out;
      const { data, error } = await sb.from("friend_requests")
        .select("id, requester, addressee, status")
        .or(`requester.eq.${user.id},addressee.eq.${user.id}`);
      if (error) throw error;
      (data || []).forEach((r) => {
        if (r.status === "accepted") {
          out.friends.add(r.requester === user.id ? r.addressee : r.requester);
        } else if (r.status === "pending") {
          if (r.addressee === user.id) out.incoming.push({ id: r.id, uid: r.requester });
          else out.outgoing.add(r.addressee);
        }
      });
    } catch (e) { console.warn("[SideQuest] friendData:", e.message); }
    return out;
  },

  // Freundschaftsanfrage schicken. Hat die Person mich schon angefragt -> direkt befreunden.
  // Rückgabe: "requested" | "accepted" | "pending" | "friends".
  async sendFriendRequest(addresseeId) {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));
    if (user.id === addresseeId) throw new Error("Dich selbst kannst du nicht anfragen.");
    const { data: existing } = await sb.from("friend_requests")
      .select("id, requester, addressee, status")
      .or(`and(requester.eq.${user.id},addressee.eq.${addresseeId}),and(requester.eq.${addresseeId},addressee.eq.${user.id})`);
    const rows = existing || [];
    const accepted = rows.find((r) => r.status === "accepted");
    if (accepted) return "friends";
    const theirs = rows.find((r) => r.status === "pending" && r.requester === addresseeId);
    if (theirs) { // sie haben mich schon angefragt -> annehmen
      const { error } = await sb.from("friend_requests").update({ status: "accepted" }).eq("id", theirs.id);
      if (error) throw error;
      return "accepted";
    }
    const mine = rows.find((r) => r.status === "pending" && r.requester === user.id);
    if (mine) return "pending";
    const { error } = await sb.from("friend_requests")
      .insert({ requester: user.id, addressee: addresseeId, status: "pending" });
    if (error) throw error;
    return "requested";
  },

  // Eingehende Anfrage beantworten (annehmen = accepted, ablehnen = löschen).
  async respondFriend(requestId, accept) {
    if (accept) {
      const { error } = await sb.from("friend_requests").update({ status: "accepted" }).eq("id", requestId);
      if (error) throw error;
    } else {
      const { error } = await sb.from("friend_requests").delete().eq("id", requestId);
      if (error) throw error;
    }
  },

  // Freundschaft beenden (akzeptierte Zeile in beliebiger Richtung löschen).
  async unfriend(otherId) {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));
    const { error } = await sb.from("friend_requests").delete().eq("status", "accepted")
      .or(`and(requester.eq.${user.id},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${user.id})`);
    if (error) throw error;
  },

  // Mir zugewiesene Spezial-Titel (aus title_grants → special_titles). Fail-soft.
  // Durch RLS sieht jeder NUR seine eigenen Zuweisungen – andere kennen den Titel gar nicht.
  async mySpecialTitles() {
    try {
      const user = await Auth.getUser();
      if (!user) return [];
      const { data, error } = await sb.from("title_grants")
        .select("special_titles(label)").eq("user_id", user.id);
      if (error) throw error;
      return (data || []).map((g) => g.special_titles && g.special_titles.label).filter(Boolean);
    } catch (e) { console.warn("[SideQuest] mySpecialTitles:", e.message); return []; }
  },

  // ---- Admin: Spezial-Titel verwalten (erstellen / zuweisen / entziehen) ----
  // Liefert alle Titel inkl. Zuweisungen [{id,label,grantees:[{user_id,username}]}].
  async adminTitles() {
    const { data: titles, error } = await sb.from("special_titles").select("id, label").order("created_at", { ascending: true });
    if (error) throw error;
    const ids = (titles || []).map((t) => t.id);
    const byTitle = {};
    if (ids.length) {
      const { data: grants } = await sb.from("title_grants").select("title_id, user_id").in("title_id", ids);
      const uids = [...new Set((grants || []).map((g) => g.user_id))];
      const { data: profs } = uids.length ? await sb.from("profiles").select("id, username").in("id", uids) : { data: [] };
      const nameById = {}; (profs || []).forEach((p) => { nameById[p.id] = p.username; });
      (grants || []).forEach((g) => {
        (byTitle[g.title_id] = byTitle[g.title_id] || []).push({ user_id: g.user_id, username: nameById[g.user_id] || "?" });
      });
    }
    return (titles || []).map((t) => ({ id: t.id, label: t.label, grantees: byTitle[t.id] || [] }));
  },

  // Mehrere Titel auf einmal anlegen (einer pro Eintrag). Gibt die Anzahl zurück.
  async adminCreateTitles(labels) {
    const rows = (labels || []).map((l) => (l || "").trim()).filter(Boolean).map((label) => ({ label }));
    if (!rows.length) return 0;
    const { error } = await sb.from("special_titles").insert(rows);
    if (error) throw error;
    return rows.length;
  },

  async adminDeleteTitle(id) {
    const { error } = await sb.from("special_titles").delete().eq("id", id);
    if (error) throw error;
  },

  // Per Anzeigename zuweisen (alle Treffer mit dem Namen). Gibt Anzahl zurück.
  async adminAssign(titleId, username) {
    const name = (username || "").trim();
    if (!name) throw new Error("Kein Name.");
    const { data: profs, error } = await sb.from("profiles").select("id").eq("username", name);
    if (error) throw error;
    if (!profs || !profs.length) throw new Error(t("ta.userNotFound", { name }));
    const rows = profs.map((p) => ({ title_id: titleId, user_id: p.id }));
    const { error: e2 } = await sb.from("title_grants").upsert(rows, { onConflict: "title_id,user_id", ignoreDuplicates: true });
    if (e2) throw e2;
    return profs.length;
  },

  async adminRevoke(titleId, userId) {
    const { error } = await sb.from("title_grants").delete().eq("title_id", titleId).eq("user_id", userId);
    if (error) throw error;
  },

  // ---- App-Konfiguration (Founder stellt ein, wie viel Archiv angezeigt wird) ----
  // Liefert {archiveHourly, archiveDaily} mit Standardwerten. Fail-soft.
  async getConfig() {
    const cfg = { archiveHourly: 6, archiveDaily: 7 };
    try {
      const { data, error } = await sb.from("app_config").select("key, value");
      if (error) throw error;
      (data || []).forEach((r) => {
        if (r.key === "archive_hourly_limit") cfg.archiveHourly = r.value;
        if (r.key === "archive_daily_limit") cfg.archiveDaily = r.value;
      });
    } catch (e) { /* Tabelle evtl. noch nicht da -> Standardwerte */ }
    return cfg;
  },

  // Founder: Anzeige-Grenzen speichern.
  async adminSetConfig(archiveHourly, archiveDaily) {
    const rows = [
      { key: "archive_hourly_limit", value: Math.max(0, archiveHourly | 0) },
      { key: "archive_daily_limit", value: Math.max(0, archiveDaily | 0) },
    ];
    const { error } = await sb.from("app_config").upsert(rows, { onConflict: "key" });
    if (error) throw error;
  },

  // Founder: ALLE Beiträge + Fotos löschen (Reset, z. B. nach der Testphase).
  async adminDeleteAllSubmissions() {
    // 1) DB-Einträge löschen (SQL-Löschung auf storage.objects ist in Supabase gesperrt).
    const { error } = await sb.rpc("admin_delete_all_submissions");
    if (error) throw error;
    // 2) Storage best-effort über die Storage-API leeren.
    try {
      const { data: top } = await sb.storage.from(Upload.BUCKET).list("", { limit: 1000 });
      for (const e of (top || [])) {
        if (e.id === null) { // Ordner -> Inhalt löschen
          const { data: files } = await sb.storage.from(Upload.BUCKET).list(e.name, { limit: 1000 });
          const paths = (files || []).map((f) => `${e.name}/${f.name}`);
          if (paths.length) await sb.storage.from(Upload.BUCKET).remove(paths);
        } else {
          await sb.storage.from(Upload.BUCKET).remove([e.name]);
        }
      }
    } catch (err) { console.warn("[SideQuest] storage clear:", err.message); }
  },

  // ---- Melden & Moderation ----
  // Beitrag melden. Doppel-Meldung (unique) wird stillschweigend ignoriert.
  async reportPost(submissionId, reason) {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));
    const { error } = await sb.from("reports")
      .insert({ submission_id: submissionId, reporter: user.id, reason: reason || null });
    if (error && error.code !== "23505") throw error; // 23505 = schon gemeldet
  },

  // Admin: alle versteckten (auto-deaktivierten) Beiträge + Melde-Infos.
  async reportedPosts() {
    const { data: subs, error } = await sb.from("submissions")
      .select("id, user_id, image_url, quest_id, created_at").eq("hidden", true)
      .order("created_at", { ascending: false });
    if (error || !subs || !subs.length) return [];
    const ids = subs.map((s) => s.id);
    const [reps, profs, quests] = await Promise.all([
      sb.from("reports").select("submission_id, reason").in("submission_id", ids),
      sb.from("profiles").select("id, username").in("id", subs.map((s) => s.user_id)),
      sb.from("quests").select("id, title").in("id", subs.map((s) => s.quest_id)),
    ]);
    const cnt = {}, reasons = {};
    (reps.data || []).forEach((r) => {
      cnt[r.submission_id] = (cnt[r.submission_id] || 0) + 1;
      if (r.reason) (reasons[r.submission_id] = reasons[r.submission_id] || []).push(r.reason);
    });
    const nameById = {}; (profs.data || []).forEach((p) => { nameById[p.id] = p.username; });
    const titleById = {}; (quests.data || []).forEach((q) => { titleById[q.id] = q.title; });
    return subs.map((s) => ({
      id: s.id, image_url: s.image_url,
      username: nameById[s.user_id] || "Jemand",
      quest_title: titleById[s.quest_id] || "",
      count: cnt[s.id] || 0,
      reasons: [...new Set(reasons[s.id] || [])],
    }));
  },

  // Admin: Beitrag wieder freigeben oder löschen.
  async moderate(id, action) {
    if (action === "approve") {
      const { error } = await sb.from("submissions").update({ hidden: false }).eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await sb.from("submissions").delete().eq("id", id);
      if (error) throw error;
    }
  },

  // Eigene Profil-Kosmetik speichern (Avatar/Titel/Rahmen).
  async saveProfile(patch) {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));
    const { error } = await sb.from("profiles").update(patch).eq("id", user.id);
    if (error) throw error;
  },

  // Challenge-Idee vorschlagen. Landet in challenge_ideas (nur der Admin liest sie
  // im Supabase-Dashboard und übernimmt gute Ideen in den challenge_pool).
  async suggestChallenge(text) {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));
    const body = (text || "").trim();
    if (body.length < 4) throw new Error(t("ov.suggest.short"));
    const { error } = await sb.from("challenge_ideas")
      .insert({ user_id: user.id, text: body.slice(0, 280) });
    if (error) throw error;
  },

  // Konto + alle zugehörigen Daten löschen (Recht auf Löschung, Art. 17 DSGVO).
  // Ruft eine SECURITY-DEFINER-Funktion auf, die den auth.users-Eintrag löscht;
  // per ON DELETE CASCADE verschwinden Profil, Beiträge, Likes, Kommentare usw.
  async deleteAccount() {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));
    // Eigene Foto-Dateien best-effort entfernen (Storage-API, vor dem Konto-Löschen).
    try {
      const { data: files } = await sb.storage.from(Upload.BUCKET).list(user.id, { limit: 1000 });
      const paths = (files || []).map((f) => `${user.id}/${f.name}`);
      const { data: av } = await sb.storage.from(Upload.BUCKET).list("avatars", { limit: 1000 });
      (av || []).forEach((f) => { if (f.name.startsWith(user.id)) paths.push(`avatars/${f.name}`); });
      if (paths.length) await sb.storage.from(Upload.BUCKET).remove(paths);
    } catch (e) { /* Konto-Löschung ist das Wichtige */ }
    const { error } = await sb.rpc("delete_my_account");
    if (error) throw error;
  },

  // Allgemeines App-Feedback / Verbesserungsvorschlag. Landet in app_feedback
  // (nur der Admin liest es im Supabase-Dashboard).
  async sendAppFeedback(text) {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));
    const body = (text || "").trim();
    if (body.length < 4) throw new Error(t("ov.suggest.short"));
    const { error } = await sb.from("app_feedback")
      .insert({ user_id: user.id, text: body.slice(0, 600) });
    if (error) throw error;
  },

  // Neuen Kommentar speichern.
  async addComment(submissionId, body) {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));
    const text = (body || "").trim();
    if (!text) return;
    const { error } = await sb.from("comments")
      .insert({ submission_id: submissionId, user_id: user.id, body: text });
    if (error) throw error;
  },
};
