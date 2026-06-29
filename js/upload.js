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

  // Foto(s) hochladen + Eintrag schreiben. file2 ist optional (Doppelfoto).
  async submit(file, file2, quest) {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const imageUrl = await Upload._put(file, `${user.id}/${quest.id}.${ext}`);

    // Optionales zweites Foto (z. B. Vorher/Nachher) – eigener Pfad mit "-2".
    let imageUrl2 = null;
    if (file2) {
      const ext2 = (file2.name.split(".").pop() || "jpg").toLowerCase();
      imageUrl2 = await Upload._put(file2, `${user.id}/${quest.id}-2.${ext2}`);
    }

    // Eintrag schreiben/aktualisieren (upsert pro User+Quest).
    const row = { user_id: user.id, quest_id: quest.id, image_url: imageUrl };
    if (file2) row.image_url_2 = imageUrl2;
    const { error: dbErr } = await sb
      .from("submissions")
      .upsert(row, { onConflict: "user_id,quest_id" });
    if (dbErr) throw dbErr;
  },

  // Zweites Foto NACHTRÄGLICH zu einem bestehenden Beitrag hinzufügen (zeitversetzt).
  // Gibt die öffentliche URL zurück, damit der Feed sofort aktualisiert werden kann.
  async addSecond(submissionId, questId, file) {
    const user = await Auth.getUser();
    if (!user) throw new Error(t("err.notLoggedIn"));
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const url = await Upload._put(file, `${user.id}/${questId}-2.${ext}`);
    const { data, error } = await sb
      .from("submissions")
      .update({ image_url_2: url })
      .eq("id", submissionId).eq("user_id", user.id)
      .select("id");
    if (error) throw error;
    if (!data || !data.length) throw new Error(t("err.notLoggedIn"));
    return url;
  },
};
