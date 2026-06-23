// =====================================================================
//  feed.js – Beiträge der anderen laden + anzeigen
// =====================================================================
//
//   Feed.render(quest)  -> lädt alle Beiträge zur Quest und zeichnet sie
//                          in #feedList. Neueste zuerst.

const Feed = {

  // Uhrzeit hübsch formatieren, z. B. "14:05".
  formatTime(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  // Einfaches Escaping, damit Usernamen kein HTML einschleusen können.
  escape(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  },

  async render(quest) {
    const list  = document.getElementById("feedList");
    const empty = document.getElementById("feedEmpty");
    list.innerHTML = '<p class="spinner-text">Lade Beiträge…</p>';
    empty.classList.add("hidden");

    // 1) Beiträge zur Quest holen (neueste zuerst).
    const { data: subs, error } = await sb
      .from("submissions")
      .select("user_id, image_url, created_at")
      .eq("quest_id", quest.id)
      .order("created_at", { ascending: false });

    if (error) {
      list.innerHTML = `<p class="spinner-text">Fehler beim Laden: ${Feed.escape(error.message)}</p>`;
      return;
    }

    list.innerHTML = "";

    if (!subs || subs.length === 0) {
      empty.classList.remove("hidden");
      return;
    }

    // 2) Passende Anzeigenamen in einer zweiten Abfrage holen und je User-ID merken.
    const ids = [...new Set(subs.map((s) => s.user_id))];
    const { data: profs } = await sb
      .from("profiles")
      .select("id, username")
      .in("id", ids);
    const nameById = {};
    (profs || []).forEach((p) => { nameById[p.id] = p.username; });

    // 3) Beiträge anzeigen.
    for (const item of subs) {
      const username = nameById[item.user_id] || "Jemand";
      const el = document.createElement("article");
      el.className = "feed-item";
      el.innerHTML = `
        <img src="${Feed.escape(item.image_url)}" alt="Beitrag von ${Feed.escape(username)}" loading="lazy" />
        <div class="feed-meta">
          <span class="feed-user">${Feed.escape(username)}</span>
          <span class="feed-time">${Feed.formatTime(item.created_at)}</span>
        </div>`;
      list.appendChild(el);
    }
  },
};
