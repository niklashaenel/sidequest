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

  // Foto hochladen + Eintrag schreiben.
  async submit(file, quest) {
    const user = await Auth.getUser();
    if (!user) throw new Error("Nicht eingeloggt.");

    // Dateiendung aus dem Dateinamen ziehen (Standard: jpg).
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    // Pfad pro User + Quest, eindeutig: z. B. "USERID/12.jpg"
    const path = `${user.id}/${quest.id}.${ext}`;

    // 1) Datei in den Storage-Bucket laden (upsert=true erlaubt erneutes Hochladen).
    const { error: upErr } = await sb.storage
      .from(Upload.BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
    if (upErr) throw upErr;

    // 2) Öffentliche URL des Fotos holen.
    const { data: pub } = sb.storage.from(Upload.BUCKET).getPublicUrl(path);
    const imageUrl = pub.publicUrl;

    // 3) Eintrag in der Datenbank. upsert verhindert Fehler, falls man neu hochlädt.
    const { error: dbErr } = await sb
      .from("submissions")
      .upsert(
        { user_id: user.id, quest_id: quest.id, image_url: imageUrl },
        { onConflict: "user_id,quest_id" }
      );
    if (dbErr) throw dbErr;
  },
};
