// =====================================================================
//  auth.js – Registrieren, Login, Logout, Anzeigename (profiles)
// =====================================================================
//
// Stellt globale Funktionen bereit, die app.js benutzt:
//   Auth.register(username, email, password)
//   Auth.login(email, password)
//   Auth.logout()
//   Auth.getUser()        -> aktuell eingeloggter User (oder null)
//   Auth.ensureProfile(username)  -> legt bei Bedarf den Profil-Eintrag an

const Auth = {

  // Registrieren: Konto anlegen, danach Profil mit Anzeigename speichern.
  async register(username, email, password) {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;

    // Wenn "Confirm email" in Supabase AUS ist, ist man direkt eingeloggt (session vorhanden).
    if (data.session) {
      await Auth.ensureProfile(username);
    }
    return data;
  },

  // Login mit E-Mail + Passwort.
  async login(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async logout() {
    await sb.auth.signOut();
  },

  // Aktuell eingeloggten User holen (oder null).
  async getUser() {
    const { data } = await sb.auth.getUser();
    return data.user || null;
  },

  // Profil-Eintrag sicherstellen. Speichert Anzeigename in der Tabelle "profiles".
  // upsert = anlegen oder (falls schon da) aktualisieren – verhindert Doppel-Fehler.
  async ensureProfile(username) {
    const user = await Auth.getUser();
    if (!user) return;

    // Fallback-Name, falls beim Login (ohne Eingabefeld) noch kein Profil existiert.
    const name = (username && username.trim()) || user.email.split("@")[0];

    const { error } = await sb
      .from("profiles")
      .upsert({ id: user.id, username: name }, { onConflict: "id", ignoreDuplicates: true });

    // Doppelten Eintrag ignorieren, alles andere melden.
    if (error && error.code !== "23505") {
      console.warn("[SideQuest] Profil konnte nicht gespeichert werden:", error.message);
    }
  },
};
