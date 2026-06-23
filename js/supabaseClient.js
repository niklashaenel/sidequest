// =====================================================================
//  Supabase-Verbindung – die EINZIGE Stelle, an der deine Zugangsdaten stehen
// =====================================================================
//
// Diese zwei Werte stammen aus deinem Supabase-Projekt:
//   Project Settings -> API Keys -> "Publishable key"  (sb_publishable_...)
//   Project Settings -> Data API -> "Project URL"      (ohne /rest/v1/ am Ende)
//
// Keine Sorge: Der Publishable key DARF öffentlich im Frontend stehen. Die Sicherheit
// kommt aus den RLS-Regeln in der Datenbank, nicht aus Geheimhaltung dieses Keys.
// NIEMALS den "Secret key" (sb_secret_...) hier eintragen!

const SUPABASE_URL = "https://hszdpksfifstaxccfthz.supabase.co";
const SUPABASE_KEY = "sb_publishable_vPmB8kOilSeyB8DM7cK5lQ_37OIodsi";

// "sb" wird von allen anderen Dateien benutzt. Bleibt null, falls die Keys fehlen.
let sb = null;

// Sind die Werte oben noch Platzhalter? Dann gar nicht erst verbinden.
const KEYS_FEHLEN =
  SUPABASE_URL.startsWith("HIER_") || SUPABASE_KEY.startsWith("HIER_");

if (KEYS_FEHLEN) {
  console.warn(
    "[SideQuest] Bitte SUPABASE_URL und SUPABASE_KEY in js/supabaseClient.js eintragen."
  );
} else {
  // Erstellt den globalen Client.
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}
