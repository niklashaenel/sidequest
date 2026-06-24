// =====================================================================
//  feed.js – Beiträge anzeigen + Likes + Kommentare
// =====================================================================

const Feed = {

  formatTime(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    const sameDay = d.toDateString() === new Date().toDateString();
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return sameDay ? time : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${time}`;
  },

  escape(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  },

  initial(name) {
    return (name || "?").trim().charAt(0).toUpperCase() || "?";
  },

  async render(quest, onDeleted) {
    const me = await Auth.getUser();
    const myId = me ? me.id : null;
    const list  = document.getElementById("feedList");
    const empty = document.getElementById("feedEmpty");
    list.innerHTML = '<p class="spinner-text">Lade Beiträge…</p>';
    empty.classList.add("hidden");

    // 1) Beiträge zur Challenge (neueste zuerst).
    const { data: subs, error } = await sb
      .from("submissions")
      .select("id, user_id, image_url, created_at")
      .eq("quest_id", quest.id)
      .order("created_at", { ascending: false });

    if (error) {
      list.innerHTML = `<p class="spinner-text">Fehler beim Laden: ${Feed.escape(error.message)}</p>`;
      return;
    }
    list.innerHTML = "";
    if (!subs || !subs.length) { empty.classList.remove("hidden"); return; }

    // 2) Namen, Likes und Kommentar-Zähler parallel holen.
    const subIds  = subs.map((s) => s.id);
    const userIds = [...new Set(subs.map((s) => s.user_id))];
    const [profRes, likes, commentCounts] = await Promise.all([
      sb.from("profiles").select("id, username").in("id", userIds),
      Social.likesFor(subIds),
      Social.commentCountsFor(subIds),
    ]);
    const nameById = {};
    (profRes.data || []).forEach((p) => { nameById[p.id] = p.username; });

    // 3) Jeden Beitrag rendern + interaktiv machen.
    for (const item of subs) {
      const username = nameById[item.user_id] || "Jemand";
      const liked = likes.likedByMe.has(item.id);
      const likeCount = likes.countById[item.id] || 0;
      const commentCount = commentCounts[item.id] || 0;

      const el = document.createElement("article");
      el.className = "feed-item";
      el.innerHTML = `
        <div class="fi-head">
          <div class="fi-avatar">${Feed.escape(Feed.initial(username))}</div>
          <div>
            <div class="fi-user">${Feed.escape(username)}</div>
            <div class="fi-time">${Feed.formatTime(item.created_at)}</div>
          </div>
          ${item.user_id === myId ? '<button class="fi-del" aria-label="Beitrag löschen"><i class="ti ti-trash"></i></button>' : ""}
        </div>
        <img class="fi-img" src="${Feed.escape(item.image_url)}" alt="Beitrag von ${Feed.escape(username)}" loading="lazy" />
        <div class="fi-actions">
          <button class="fi-act fi-like ${liked ? "liked" : ""}" aria-label="Gefällt mir">
            <i class="ti ti-heart"></i><span class="like-count">${likeCount}</span>
          </button>
          <button class="fi-act fi-comment-toggle" aria-label="Kommentare">
            <i class="ti ti-message-circle"></i><span class="comment-count">${commentCount}</span>
          </button>
        </div>
        <div class="fi-comments hidden"></div>`;

      Feed.wireItem(el, item, liked, onDeleted);
      list.appendChild(el);
    }
  },

  // Like-Button, Kommentar-Aufklapp und (bei eigenen) Löschen verkabeln.
  wireItem(el, item, liked, onDeleted) {
    let isLiked = liked;
    let busy = false;

    const likeBtn = el.querySelector(".fi-like");
    const likeCountEl = el.querySelector(".like-count");
    likeBtn.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      // Optimistisch umschalten, bei Fehler zurückdrehen.
      const prev = isLiked;
      isLiked = !isLiked;
      likeBtn.classList.toggle("liked", isLiked);
      likeCountEl.textContent = Math.max(0, parseInt(likeCountEl.textContent, 10) + (isLiked ? 1 : -1));
      try {
        await Social.toggleLike(item.id, prev);
      } catch (e) {
        isLiked = prev;
        likeBtn.classList.toggle("liked", isLiked);
        likeCountEl.textContent = Math.max(0, parseInt(likeCountEl.textContent, 10) + (isLiked ? 1 : -1));
      } finally { busy = false; }
    });

    const box = el.querySelector(".fi-comments");
    const toggle = el.querySelector(".fi-comment-toggle");
    const countEl = el.querySelector(".comment-count");
    let loaded = false;
    toggle.addEventListener("click", async () => {
      const willShow = box.classList.contains("hidden");
      box.classList.toggle("hidden", !willShow);
      if (willShow && !loaded) { loaded = true; await Feed.renderComments(box, item.id, countEl); }
    });

    // Löschen (nur bei eigenem Beitrag vorhanden)
    const del = el.querySelector(".fi-del");
    if (del) {
      del.addEventListener("click", async () => {
        if (!confirm("Diesen Beitrag wirklich löschen?")) return;
        del.disabled = true;
        try {
          await Social.deleteSubmission(item.id, item.image_url);
          el.style.transition = "opacity .2s ease";
          el.style.opacity = "0";
          setTimeout(() => el.remove(), 200);
          if (typeof onDeleted === "function") onDeleted(item);
        } catch (e) {
          del.disabled = false;
          alert("Löschen fehlgeschlagen: " + e.message);
        }
      });
    }
  },

  // Kommentarbereich eines Beitrags füllen (Liste + Eingabefeld).
  async renderComments(box, submissionId, countEl) {
    box.innerHTML = '<p class="comment-empty">Lade Kommentare…</p>';
    let comments = [];
    try { comments = await Social.commentsFor(submissionId); }
    catch (e) { box.innerHTML = `<p class="comment-empty">Fehler: ${Feed.escape(e.message)}</p>`; return; }

    const renderList = () => {
      const items = comments.map((c) =>
        `<p class="comment"><b>${Feed.escape(c.username)}</b>${Feed.escape(c.body)}<span class="c-time">${Feed.formatTime(c.created_at)}</span></p>`
      ).join("");
      box.innerHTML =
        (comments.length ? items : '<p class="comment-empty">Noch keine Kommentare. Schreib den ersten!</p>') +
        `<form class="comment-form">
           <input type="text" placeholder="Kommentar schreiben…" maxlength="300" />
           <button type="submit">Senden</button>
         </form>`;

      const form = box.querySelector(".comment-form");
      const input = box.querySelector("input");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.disabled = true;
        try {
          await Social.addComment(submissionId, text);
          comments.push({ body: text, created_at: new Date().toISOString(), username: "Du" });
          if (countEl) countEl.textContent = comments.length;
          renderList();
        } catch (err) {
          input.disabled = false;
          alert("Kommentar fehlgeschlagen: " + err.message);
        }
      });
    };
    renderList();
  },
};
