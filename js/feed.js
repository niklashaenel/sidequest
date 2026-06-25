// =====================================================================
//  feed.js – Beiträge anzeigen + Likes + Kommentare
// =====================================================================

const Feed = {

  mode: "all",      // "all" | "friends"
  current: null,    // { quest, onDeleted } – für Neu-Rendern beim Umschalten

  // Profile robust laden: erst mit Kosmetik-Spalten, sonst Fallback (Spalten noch nicht angelegt).
  async fetchProfiles(ids) {
    const by = {};
    if (!ids.length) return by;
    let res = await sb.from("profiles").select("id, username, avatar_url, title, frame").in("id", ids);
    if (res.error) res = await sb.from("profiles").select("id, username").in("id", ids);
    (res.data || []).forEach((p) => { by[p.id] = p; });
    return by;
  },

  // Beiträge einer Challenge laden – mit hidden-Spalte, sonst Fallback (Spalte noch nicht da).
  async fetchSubs(questId) {
    let res = await sb.from("submissions")
      .select("id, user_id, image_url, created_at, hidden")
      .eq("quest_id", questId).order("created_at", { ascending: false });
    if (res.error) res = await sb.from("submissions")
      .select("id, user_id, image_url, created_at")
      .eq("quest_id", questId).order("created_at", { ascending: false });
    return res;
  },

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

  // Abzeichen für die frühesten Beiträge (wie „erster Kommentar" auf TikTok).
  earlyLabel(rank) {
    return rank === 1 ? t("early.first") : rank === 2 ? t("early.second") : t("early.third");
  },

  // Avatar als HTML: eigenes Foto (avatar_url) oder Anfangsbuchstabe, mit optionalem Rahmen.
  avatarHTML(name, avatarUrl, frame, baseCls) {
    const f = frame && frame !== "none" ? " frame-" + frame : "";
    if (avatarUrl) {
      return `<div class="${baseCls} has-img${f}" style="background-image:url('${Feed.escape(avatarUrl)}')"></div>`;
    }
    return `<div class="${baseCls}${f}">${Feed.escape(Feed.initial(name))}</div>`;
  },

  // Reaktions-Leiste (5 Emoji-Chips, eigene Reaktion hervorgehoben).
  reactionBar(counts, mine) {
    const chips = Social.REACTIONS.map((e) => {
      const n = counts[e] || 0;
      const active = mine === e ? " active" : "";
      return `<button class="re-chip${active}" type="button" data-emoji="${e}">${e}${n ? `<span>${n}</span>` : ""}</button>`;
    }).join("");
    return `<div class="fi-reactions" data-mine="${mine || ""}">${chips}</div>`;
  },

  // Reaktions-Chips optimistisch umrechnen (from -1, to +1, Aktiv-Markierung setzen).
  applyReaction(reBar, from, to) {
    const adj = (emoji, delta) => {
      if (!emoji) return;
      const chip = reBar.querySelector(`.re-chip[data-emoji="${emoji}"]`);
      if (!chip) return;
      let span = chip.querySelector("span");
      let n = (span ? parseInt(span.textContent, 10) : 0) + delta;
      n = Math.max(0, n);
      if (n > 0) { if (!span) { span = document.createElement("span"); chip.appendChild(span); } span.textContent = n; }
      else if (span) { span.remove(); }
    };
    adj(from, -1); adj(to, 1);
    reBar.querySelectorAll(".re-chip").forEach((c) => c.classList.toggle("active", c.dataset.emoji === to));
  },

  async render(quest, onDeleted) {
    Feed.current = { quest, onDeleted };
    const mode = Feed.mode || "all";
    const me = await Auth.getUser();
    const myId = me ? me.id : null;
    const list  = document.getElementById("feedList");
    const empty = document.getElementById("feedEmpty");
    list.innerHTML = `<p class="spinner-text">${t("feed.loading")}</p>`;
    empty.classList.add("hidden");

    // 1) Alle Beiträge zur Challenge (neueste zuerst) + Folgen + Freunde – parallel.
    const [subsRes, follows, friends] = await Promise.all([
      Feed.fetchSubs(quest.id),
      Social.myFollows(),
      Social.friendData(),
    ]);
    if (subsRes.error) {
      list.innerHTML = `<p class="spinner-text">${Feed.escape(t("feed.loadError", { msg: subsRes.error.message }))}</p>`;
      return;
    }

    // Gemeldete/auto-deaktivierte Beiträge raus (hidden).
    const rows = (subsRes.data || []).filter((s) => !s.hidden);

    // Frühe-Vögel: die ersten 1-3 Beiträge (chronologisch) der Challenge bekommen ein Abzeichen.
    const allByTime = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const earlyRank = {};
    allByTime.slice(0, 3).forEach((s, i) => { earlyRank[s.id] = i + 1; });

    // 2) Im Freunde-Modus nur Beiträge von Gefolgten (und mir selbst).
    const subs = (mode === "friends")
      ? rows.filter((s) => follows.has(s.user_id) || s.user_id === myId)
      : rows;

    list.innerHTML = "";
    if (!subs.length) {
      empty.innerHTML = (mode === "friends")
        ? `<i class="ti ti-users"></i>${Feed.escape(t("feed.emptyFriends"))}`
        : `<i class="ti ti-photo"></i>${Feed.escape(t("feed.emptyAll"))}`;
      empty.classList.remove("hidden");
      return;
    }

    // 3) Profile (Name/Avatar/Titel/Rahmen), Likes, Kommentare, Reaktionen parallel holen.
    const subIds  = subs.map((s) => s.id);
    const userIds = [...new Set(subs.map((s) => s.user_id))];
    const [profById, likes, commentCounts, reactions] = await Promise.all([
      Feed.fetchProfiles(userIds),
      Social.likesFor(subIds),
      Social.commentCountsFor(subIds),
      Social.reactionsFor(subIds),
    ]);

    // 4) Jeden Beitrag rendern + interaktiv machen.
    for (const item of subs) {
      const prof = profById[item.user_id] || {};
      const username = prof.username || t("feed.someone");
      const liked = likes.likedByMe.has(item.id);
      const likeCount = likes.countById[item.id] || 0;
      const commentCount = commentCounts[item.id] || 0;
      const isMine = item.user_id === myId;
      const following = follows.has(item.user_id);
      const isFriend = friends.friends.has(item.user_id);
      const reqPending = friends.outgoing.has(item.user_id);
      const uid = Feed.escape(item.user_id);
      const rank = earlyRank[item.id];

      const el = document.createElement("article");
      el.className = "feed-item";
      el.innerHTML = `
        <div class="fi-head">
          ${Feed.avatarHTML(username, prof.avatar_url, prof.frame, "fi-avatar")}
          <div class="fi-id">
            <div class="fi-user">${Feed.escape(username)}${prof.title ? ` <span class="fi-title">${Feed.escape(prof.title)}</span>` : ""}${rank ? ` <span class="fi-early r${rank}">${Feed.earlyLabel(rank)}</span>` : ""}</div>
            <div class="fi-time">${Feed.formatTime(item.created_at)}</div>
          </div>
          ${isMine
            ? '<button class="fi-del"><i class="ti ti-trash"></i></button>'
            : `<div class="fi-head-actions">
                 <button class="fi-follow${following ? " following" : ""}" data-uid="${uid}">${following ? t("feed.following2") : t("feed.follow")}</button>
                 ${isFriend
                   ? `<span class="fi-friend done" title="${Feed.escape(t("friend.added.title"))}"><i class="ti ti-user-check"></i></span>`
                   : `<button class="fi-friend${reqPending ? " pending" : ""}" data-uid="${uid}" ${reqPending ? "disabled" : ""} title="${Feed.escape(t("friend.add.title"))}"><i class="ti ti-user-plus"></i></button>`}
               </div>`}
        </div>
        <img class="fi-img" src="${Feed.escape(item.image_url)}" alt="Beitrag von ${Feed.escape(username)}" loading="lazy" />
        <div class="fi-actions">
          <button class="fi-act fi-like ${liked ? "liked" : ""}" aria-label="Gefällt mir">
            <i class="ti ti-heart"></i><span class="like-count">${likeCount}</span>
          </button>
          <button class="fi-act fi-comment-toggle" aria-label="Kommentare">
            <i class="ti ti-message-circle"></i><span class="comment-count">${commentCount}</span>
          </button>
          ${isMine ? "" : `<button class="fi-act fi-report" title="${Feed.escape(t("rep.title"))}"><i class="ti ti-flag"></i></button>`}
        </div>
        ${Feed.reactionBar(reactions.countById[item.id] || {}, reactions.mineById[item.id])}
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

    // Folgen / Entfolgen (nur bei fremden Beiträgen vorhanden)
    const followBtn = el.querySelector(".fi-follow");
    if (followBtn) {
      let following = followBtn.classList.contains("following");
      let fBusy = false;
      followBtn.addEventListener("click", async () => {
        if (fBusy) return; fBusy = true;
        const prev = following;
        following = !following;
        followBtn.classList.toggle("following", following);
        followBtn.textContent = following ? t("feed.following2") : t("feed.follow");
        try {
          await Social.toggleFollow(followBtn.dataset.uid, prev);
        } catch (e) {
          following = prev;
          followBtn.classList.toggle("following", following);
          followBtn.textContent = following ? t("feed.following2") : t("feed.follow");
          alert(t("common.failed", { msg: e.message }));
        } finally { fBusy = false; }
      });
    }

    // Als Freund anfragen (nur bei fremden, noch-nicht-Freunden vorhanden)
    const friendBtn = el.querySelector("button.fi-friend");
    if (friendBtn && !friendBtn.disabled) {
      let fbBusy = false;
      friendBtn.addEventListener("click", async () => {
        if (fbBusy) return; fbBusy = true;
        friendBtn.disabled = true;
        try {
          const res = await Social.sendFriendRequest(friendBtn.dataset.uid);
          if (res === "accepted" || res === "friends") {
            friendBtn.classList.add("done");
            friendBtn.innerHTML = '<i class="ti ti-user-check"></i>';
            friendBtn.title = t("friend.added.title");
          } else {
            friendBtn.classList.add("pending");
            friendBtn.title = t("friend.requested.title");
          }
        } catch (e) { friendBtn.disabled = false; alert(t("common.failed", { msg: e.message })); }
        finally { fbBusy = false; }
      });
    }

    // Beitrag melden (öffnet Melde-Dialog; Auto-Deaktivierung ab mehreren Meldungen serverseitig)
    const reportBtn = el.querySelector(".fi-report");
    if (reportBtn && typeof openReport === "function") {
      reportBtn.addEventListener("click", () => openReport(item.id));
    }

    // Reaktionen (eine pro User; Tippen setzt/wechselt/entfernt)
    const reBar = el.querySelector(".fi-reactions");
    if (reBar) {
      let mine = reBar.dataset.mine || null;
      let reBusy = false;
      reBar.querySelectorAll(".re-chip").forEach((chip) => {
        chip.addEventListener("click", async () => {
          if (reBusy) return; reBusy = true;
          const emoji = chip.dataset.emoji;
          const prevMine = mine;
          const newMine = (prevMine === emoji) ? null : emoji;
          Feed.applyReaction(reBar, prevMine, newMine);
          mine = newMine;
          try {
            await Social.setReaction(item.id, emoji, prevMine);
          } catch (e) {
            Feed.applyReaction(reBar, newMine, prevMine); // zurückdrehen
            mine = prevMine;
          } finally { reBusy = false; }
        });
      });
    }

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
        if (!confirm(t("post.delConfirm"))) return;
        del.disabled = true;
        try {
          await Social.deleteSubmission(item.id, item.image_url);
          el.style.transition = "opacity .2s ease";
          el.style.opacity = "0";
          setTimeout(() => el.remove(), 200);
          if (typeof onDeleted === "function") onDeleted(item);
        } catch (e) {
          del.disabled = false;
          alert(t("post.delFailed", { msg: e.message }));
        }
      });
    }
  },

  // Kommentarbereich eines Beitrags füllen (Liste + Eingabefeld).
  async renderComments(box, submissionId, countEl) {
    box.innerHTML = `<p class="comment-empty">${t("comments.loading")}</p>`;
    let comments = [];
    try { comments = await Social.commentsFor(submissionId); }
    catch (e) { box.innerHTML = `<p class="comment-empty">${Feed.escape(t("common.error", { msg: e.message }))}</p>`; return; }

    const renderList = () => {
      const items = comments.map((c) =>
        `<p class="comment"><b>${Feed.escape(c.username)}</b>${Feed.escape(c.body)}<span class="c-time">${Feed.formatTime(c.created_at)}</span></p>`
      ).join("");
      box.innerHTML =
        (comments.length ? items : `<p class="comment-empty">${Feed.escape(t("comments.empty"))}</p>`) +
        `<form class="comment-form">
           <input type="text" placeholder="${Feed.escape(t("comments.ph"))}" maxlength="300" />
           <button type="submit">${Feed.escape(t("comments.send"))}</button>
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
          comments.push({ body: text, created_at: new Date().toISOString(), username: t("feed.you") });
          if (countEl) countEl.textContent = comments.length;
          renderList();
        } catch (err) {
          input.disabled = false;
          alert(t("comment.failed", { msg: err.message }));
        }
      });
    };
    renderList();
  },
};
