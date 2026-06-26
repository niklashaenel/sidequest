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
    // Anzeigename in den User-Metadaten ablegen, damit er auch bei AKTIVER
    // E-Mail-Verifizierung erhalten bleibt (dann gibt's beim Signup noch keine Session).
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { username: (username || "").trim() } },
    });
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

  // Prüft VOR der Registrierung, ob ein Anzeigename schon vergeben ist.
  // Nutzt eine SECURITY-DEFINER-Funktion (auch für nicht eingeloggte Besucher lesbar).
  // Fail-soft: Fehlt die Funktion in der DB noch, wird NICHT blockiert (App bleibt heil).
  async usernameTaken(name) {
    const clean = (name || "").trim();
    if (!clean) return false;
    try {
      const { data, error } = await sb.rpc("username_taken", { name: clean });
      if (error) return false; // Funktion fehlt / RLS – nicht blockieren
      return !!data;
    } catch (_) {
      return false;
    }
  },

  // Aktuell eingeloggten User holen (oder null).
  async getUser() {
    const { data } = await sb.auth.getUser();
    return data.user || null;
  },

  // Lokale Session (ohne Netzwerk-Check) – zum „angemeldet bleiben" beim App-Start.
  async getSession() {
    const { data } = await sb.auth.getSession();
    return data.session || null;
  },

  // Profil-Eintrag sicherstellen. Speichert Anzeigename in der Tabelle "profiles".
  // upsert = anlegen oder (falls schon da) aktualisieren – verhindert Doppel-Fehler.
  async ensureProfile(username) {
    const user = await Auth.getUser();
    if (!user) return;

    // Fallback-Name: explizit übergeben -> Metadaten aus der Registrierung -> E-Mail-Präfix.
    const metaName = user.user_metadata && user.user_metadata.username;
    const name = (username && username.trim()) || (metaName && metaName.trim()) || user.email.split("@")[0];

    const { error } = await sb
      .from("profiles")
      .upsert({ id: user.id, username: name }, { onConflict: "id", ignoreDuplicates: true });

    // Doppelten Eintrag ignorieren, alles andere melden.
    if (error && error.code !== "23505") {
      console.warn("[SideQuest] Profil konnte nicht gespeichert werden:", error.message);
    }
  },
};
