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

    // Beiträge inkl. Username aus der verknüpften profiles-Tabelle holen.
    const { data, error } = await sb
      .from("submissions")
      .select("image_url, created_at, profiles(username)")
      .eq("quest_id", quest.id)
      .order("created_at", { ascending: false });

    if (error) {
      list.innerHTML = `<p class="spinner-text">Fehler beim Laden: ${Feed.escape(error.message)}</p>`;
      return;
    }

    list.innerHTML = "";

    if (!data || data.length === 0) {
      empty.classList.remove("hidden");
      return;
    }

    for (const item of data) {
      const username = item.profiles?.username || "Jemand";
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
