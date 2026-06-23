// =====================================================================
//  quest.js – Heutige Quest laden
// =====================================================================
//
//   Quest.today()  -> liefert das Quest-Objekt für heute { id, quest_date, title }
//                     oder null, wenn für heute keine Quest eingetragen ist.

const Quest = {

  // Datum als "YYYY-MM-DD" in der LOKALEN Zeitzone (nicht UTC),
  // damit "heute" mit dem übereinstimmt, was du in der Tabelle einträgst.
  todayString() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  async today() {
    const today = Quest.todayString();
    const { data, error } = await sb
      .from("quests")
      .select("id, quest_date, title")
      .eq("quest_date", today)
      .maybeSingle(); // 0 oder 1 Treffer – wirft keinen Fehler bei 0

    if (error) throw error;
    return data; // null, wenn heute keine Quest existiert
  },
};
