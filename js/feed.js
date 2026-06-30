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
    const q = (cols) => sb.from("submissions").select(cols)
      .eq("quest_id", questId).order("created_at", { ascending: false });
    let res = await q("id, user_id, quest_id, image_url, images, image_url_2, visibility, created_at, hidden");
    if (res.error) res = await q("id, user_id, quest_id, image_url, images, image_url_2, created_at, hidden"); // visibility-Spalte noch nicht da
    if (res.error) res = await q("id, user_id, quest_id, image_url, image_url_2, created_at, hidden"); // images-Spalte noch nicht da
    if (res.error) res = await q("id, user_id, quest_id, image_url, created_at, hidden");
    if (res.error) res = await q("id, user_id, image_url, created_at"); // ganz alter Stand
    return res;
  },

  // Alle Foto-URLs eines Beitrags ermitteln (images-Array > image_url_2 > Einzelbild).
  photoList(item) {
    if (Array.isArray(item.images) && item.images.length) return item.images.filter(Boolean);
    if (item.image_url_2) return [item.image_url, item.image_url_2];
    return item.image_url ? [item.image_url] : [];
  },

  // Bild(er) eines Beitrags: eins, oder mehrere als Collage-Grid.
  imagesHTML(item, username) {
    const alt = `Beitrag von ${Feed.escape(username)}`;
    const urls = Feed.photoList(item);
    const img = (src) => `<img class="fi-img" src="${Feed.escape(src)}" alt="${alt}" loading="lazy" />`;
    if (urls.length > 1) {
      return `<div class="fi-imgs multi n${Math.min(urls.length, 4)}">${urls.map(img).join("")}</div>`;
    }
    return `<div class="fi-imgs">${img(urls[0] || item.image_url)}</div>`;
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
    // Private Beiträge ("friends") nur zeigen, wenn ich der Autor bin oder ihm folge / befreundet bin.
    const canSeePrivate = (uid) => uid === myId || follows.has(uid) || friends.friends.has(uid);
    const rows = (subsRes.data || []).filter((s) =>
      !s.hidden && (s.visibility !== "friends" || canSeePrivate(s.user_id)));

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
      const icon = mode === "friends" ? "ti-users" : "ti-photo";
      const txt  = mode === "friends" ? t("feed.emptyFriends") : t("feed.emptyAll");
      empty.innerHTML = `<i class="ti ${icon}"></i>${Feed.escape(txt)}`
        + `<button class="btn btn-sm" data-share style="margin-top:16px"><i class="ti ti-user-plus"></i> ${Feed.escape(t("share.invite"))}</button>`;
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
        ${Feed.imagesHTML(item, username)}
        ${isMine && Feed.photoList(item).length < 4
          ? `<button class="fi-add2"><i class="ti ti-photo-plus"></i> ${Feed.escape(t("up.addPhoto"))}</button>
             <input type="file" accept="image/*" multiple class="hidden fi-add2-input" />`
          : ""}
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
          await Social.deleteSubmission(item.id, Feed.photoList(item));
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

    // Weitere Fotos nachreichen (nur bei eigenem Beitrag, zeitversetzt, bis zu 4).
    const add2 = el.querySelector(".fi-add2");
    const add2Input = el.querySelector(".fi-add2-input");
    if (add2 && add2Input) {
      add2.addEventListener("click", () => add2Input.click());
      add2Input.addEventListener("change", async (e) => {
        const files = e.target.files ? [...e.target.files] : [];
        if (!files.length) return;
        add2.disabled = true;
        const questId = Feed.current && Feed.current.quest ? Feed.current.quest.id : item.quest_id;
        try {
          let current = Feed.photoList(item);
          for (const f of files) {
            if (current.length >= 4) break;
            current = await Upload.appendPhoto(item.id, questId, current, f);
          }
          item.images = current; // Item aktualisieren
          // Bilder-Block neu aufbauen (Collage).
          const imgs = el.querySelector(".fi-imgs");
          if (imgs) imgs.outerHTML = Feed.imagesHTML(item, item.user_id);
          add2.remove(); add2Input.remove();
        } catch (err) {
          add2.disabled = false;
          alert(t("common.error", { msg: err.message }));
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
