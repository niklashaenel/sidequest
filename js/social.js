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
    if (!user) throw new Error("Nicht eingeloggt.");

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
      username: nameById[r.user_id] || "Jemand",
    }));
  },

  // Eigenen Beitrag löschen: Foto aus dem Storage + DB-Zeile (Likes/Kommentare per cascade weg).
  async deleteSubmission(id, imageUrl) {
    // Storage-Pfad aus der öffentlichen URL ziehen und Datei entfernen (Fehler hier egal).
    try {
      const marker = "/submissions/";
      const i = (imageUrl || "").indexOf(marker);
      if (i >= 0) {
        const path = decodeURIComponent(imageUrl.slice(i + marker.length).split("?")[0]);
        await sb.storage.from("submissions").remove([path]);
      }
    } catch (e) { /* DB-Zeile ist das Wichtige */ }

    // .select() zurückgeben lassen: bei 0 gelöschten Zeilen (fehlende Berechtigung/Policy)
    // werfen wir bewusst einen Fehler, statt fälschlich "gelöscht" zu melden.
    const { data, error } = await sb.from("submissions").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Keine Berechtigung zum Löschen.");
  },

  // Neuen Kommentar speichern.
  async addComment(submissionId, body) {
    const user = await Auth.getUser();
    if (!user) throw new Error("Nicht eingeloggt.");
    const text = (body || "").trim();
    if (!text) return;
    const { error } = await sb.from("comments")
      .insert({ submission_id: submissionId, user_id: user.id, body: text });
    if (error) throw error;
  },
};
