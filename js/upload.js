// =====================================================================
//  upload.js – Foto in Supabase Storage hochladen + DB-Eintrag anlegen
// =====================================================================
//
//   Upload.submit(file, quest)  -> lädt das Foto hoch und legt eine Zeile
//                                   in "submissions" an. Gibt nichts zurück,
//                                   wirft bei Fehler eine Exception.
//   Upload.hasSubmittedToday(quest) -> true, wenn der User für diese Quest
//                                       schon einen Beitrag hat.

const Upload = {

  BUCKET: "submissions",

  // Prüft, ob der eingeloggte User für diese Quest schon eingereicht hat.
  async hasSubmittedToday(quest) {
    const user = await Auth.getUser();
    if (!user) return false;

    const { data, error } = await sb
      .from("submissions")
      .select("id")
      .eq("user_id", user.id)
      .eq("quest_id", quest.id)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  },

  // Freies Avatar-Bild (aus der Galerie) hochladen – OHNE submission-Eintrag.
  // Gibt die öffentliche URL zurück.
  async avatar(file) {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `avatars/${user.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage
      .from(Upload.BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
    if (upErr) throw upErr;
    const { data: pub } = sb.storage.from(Upload.BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  },

  // Eine Datei in den Storage laden und ihre öffentliche URL zurückgeben.
  async _put(file, path) {
    const { error: upErr } = await sb.storage
      .from(Upload.BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
    if (upErr) throw upErr;
    const { data: pub } = sb.storage.from(Upload.BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  },

  // Mehrere Fotos hochladen + Eintrag schreiben. files = Array (1..n).
  // Bei >1 werden sie automatisch als Collage zusammengefügt (Spalte "images").
  // visibility = "public" | "friends" (privater Modus).
  async submit(files, quest, visibility) {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));
    const list = Array.isArray(files) ? files : [files];
    if (!list.length) throw new Error(t("err.noPhoto"));

    const urls = [];
    for (let i = 0; i < list.length; i++) {
      const ext = (list[i].name.split(".").pop() || "jpg").toLowerCase();
      const suffix = i === 0 ? "" : "-" + (i + 1); // erstes Foto behält den alten Pfad
      urls.push(await Upload._put(list[i], `${user.id}/${quest.id}${suffix}.${ext}`));
    }

    // image_url = erstes Foto (für Galerie/Avatar/Bestenliste), images = alle, image_url_2 = 2. (Kompat).
    const row = {
      user_id: user.id, quest_id: quest.id,
      image_url: urls[0],
      images: urls.length > 1 ? urls : null,
      image_url_2: urls[1] || null,
      visibility: visibility === "friends" ? "friends" : "public",
    };
    await Upload._upsert(row);
  },

  // Upsert mit Fail-soft: fehlen die Spalten images/image_url_2 noch (SQL nicht eingespielt),
  // wird ohne sie gespeichert (dann eben nur das erste Foto) – App bleibt heil.
  async _upsert(row) {
    let { error } = await sb.from("submissions").upsert(row, { onConflict: "user_id,quest_id" });
    if (error && /image_url_2|images|column/i.test(error.message || "")) {
      const base = { user_id: row.user_id, quest_id: row.quest_id, image_url: row.image_url };
      ({ error } = await sb.from("submissions").upsert(base, { onConflict: "user_id,quest_id" }));
    }
    if (error) throw error;
  },

  // Foto NACHTRÄGLICH an einen bestehenden Beitrag anhängen (zeitversetzt).
  // existing = bisherige URL-Liste; gibt die neue vollständige Liste zurück.
  async appendPhoto(submissionId, questId, existing, file) {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));
    const list = (existing || []).filter(Boolean);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const url = await Upload._put(file, `${user.id}/${questId}-${list.length + 1}.${ext}`);
    const all = [...list, url];
    const { data, error } = await sb
      .from("submissions")
      .update({ images: all, image_url_2: all[1] || null })
      .eq("id", submissionId).eq("user_id", user.id)
      .select("id");
    if (error) throw error;
    if (!data || !data.length) throw new Error(t("err.notLoggedIn"));
    return all;
  },
};
