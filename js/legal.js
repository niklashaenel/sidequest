// =====================================================================
//  legal.js – Impressum & Datenschutzerklärung (DE/EN)
// =====================================================================
//
//  ⚠️ VOR KOMMERZIELLEM / ÖFFENTLICHEM LAUNCH AUSFÜLLEN:
//     - LEGAL.contact.name      (Name des Verantwortlichen)
//     - LEGAL.contact.address   (ladungsfähige Anschrift – Pflicht ab geschäftsm. Nutzung)
//     - LEGAL.contact.email     (Kontakt-E-Mail für Impressum + Datenschutz)
//  Solange Platzhalter drinstehen, ist die App nur für den privaten
//  Freundes-/Testbetrieb gedacht, nicht für den breiten/kommerziellen Launch.

const LEGAL = {
  contact: {
    name: "Niklas Hänel",
    address: "[Straße & Nr. — vor öffentlichem Launch ergänzen], [PLZ Ort]",
    email: "[deine-kontakt@email.de]",
  },

  // ---- IMPRESSUM ----
  imprint(lang) {
    const c = LEGAL.contact;
    if (lang === "en") {
      return `
        <h4>Imprint</h4>
        <p>Information pursuant to § 5 DDG (German Digital Services Act):</p>
        <p><b>${esc(c.name)}</b><br>${esc(c.address)}</p>
        <p><b>Contact</b><br>Email: ${esc(c.email)}</p>
        <p>SideQuest is a privately operated, non-commercial hobby project (currently in a test
        phase among friends). Responsible for the content: ${esc(c.name)}.</p>
        <p><b>Liability for links:</b> Our offer contains links to external websites of third
        parties, over whose content we have no influence. We therefore cannot accept any liability
        for this third-party content.</p>`;
    }
    return `
      <h4>Impressum</h4>
      <p>Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz):</p>
      <p><b>${esc(c.name)}</b><br>${esc(c.address)}</p>
      <p><b>Kontakt</b><br>E-Mail: ${esc(c.email)}</p>
      <p>SideQuest ist ein privat betriebenes, nicht-kommerzielles Hobby-/Lernprojekt (derzeit in
      einer Testphase im Freundeskreis). Verantwortlich für den Inhalt: ${esc(c.name)}.</p>
      <p><b>Haftung für Links:</b> Unser Angebot enthält ggf. Links zu externen Websites Dritter,
      auf deren Inhalte wir keinen Einfluss haben. Für diese fremden Inhalte können wir keine
      Gewähr übernehmen.</p>`;
  },

  // ---- DATENSCHUTZERKLÄRUNG ----
  privacy(lang) {
    const c = LEGAL.contact;
    if (lang === "en") {
      return `
        <h4>Privacy Policy</h4>
        <p><b>1. Controller</b><br>${esc(c.name)} · Email: ${esc(c.email)}</p>
        <p><b>2. What data we process</b><br>
        • Account: email address, display name, (encrypted) password.<br>
        • Content you create: photos, likes, comments, reactions, challenge suggestions, feedback.<br>
        • Technical: IP address and device data while using the service (for delivery & security).<br>
        • Push token, only if you enable notifications.</p>
        <p><b>3. Purposes & legal bases</b><br>
        • Providing the service / your account – Art. 6(1)(b) GDPR (contract).<br>
        • Push notifications – Art. 6(1)(a) GDPR (your consent; revocable anytime).<br>
        • Security, abuse prevention, moderation – Art. 6(1)(f) GDPR (legitimate interest).</p>
        <p><b>4. Processors & services we use</b><br>
        • <b>Supabase</b> (authentication, database, photo storage) – hosted in the EU (Frankfurt).<br>
        • <b>OneSignal</b> (push notifications) – USA; only used if you opt in.<br>
        • <b>GitHub Pages / Fastly</b> (website hosting/delivery) – USA.<br>
        • <b>jsDelivr</b> (CDN for program libraries and icons) – delivers technical resources.</p>
        <p><b>5. Transfer to third countries</b><br>For OneSignal and the hosting/CDN (USA), data may be
        processed outside the EU. This is based on EU Standard Contractual Clauses. Your account and
        content data are stored in the EU.</p>
        <p><b>6. Storage period</b><br>Account data is stored until you delete your account. Technical
        logs are kept only briefly.</p>
        <p><b>7. Your rights</b><br>You have the right to access, rectification, erasure, restriction,
        data portability, and to object. You can also lodge a complaint with a supervisory authority.
        Contact: ${esc(c.email)}.</p>
        <p><b>8. Deleting your account</b><br>You can delete your account and all associated data at any
        time in the app: Settings → “Delete account”.</p>
        <p><b>9. Minors</b><br>You must be at least 16 years old to use SideQuest.</p>
        <p><b>10. Local storage</b><br>For login we use the browser’s local storage to keep you signed in.
        This is technically necessary and not used for tracking or advertising.</p>`;
    }
    return `
      <h4>Datenschutzerklärung</h4>
      <p><b>1. Verantwortlicher</b><br>${esc(c.name)} · E-Mail: ${esc(c.email)}</p>
      <p><b>2. Welche Daten wir verarbeiten</b><br>
      • Konto: E-Mail-Adresse, Anzeigename, (verschlüsseltes) Passwort.<br>
      • Von dir erstellte Inhalte: Fotos, Likes, Kommentare, Reaktionen, Challenge-Vorschläge, Feedback.<br>
      • Technisch: IP-Adresse und Gerätedaten während der Nutzung (zur Auslieferung & Sicherheit).<br>
      • Push-Token, nur wenn du Benachrichtigungen aktivierst.</p>
      <p><b>3. Zwecke & Rechtsgrundlagen</b><br>
      • Bereitstellung des Dienstes / deines Kontos – Art. 6 Abs. 1 lit. b DSGVO (Vertrag).<br>
      • Push-Benachrichtigungen – Art. 6 Abs. 1 lit. a DSGVO (Einwilligung, jederzeit widerrufbar).<br>
      • Sicherheit, Missbrauchsabwehr, Moderation – Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse).</p>
      <p><b>4. Eingesetzte Auftragsverarbeiter & Dienste</b><br>
      • <b>Supabase</b> (Anmeldung, Datenbank, Foto-Speicher) – gehostet in der EU (Frankfurt).<br>
      • <b>OneSignal</b> (Push-Benachrichtigungen) – USA; nur bei deiner Einwilligung.<br>
      • <b>GitHub Pages / Fastly</b> (Hosting/Auslieferung der Website) – USA.<br>
      • <b>jsDelivr</b> (CDN für Programmbibliotheken und Icons) – liefert technische Ressourcen aus.</p>
      <p><b>5. Übermittlung in Drittländer</b><br>Bei OneSignal und dem Hosting/CDN (USA) können Daten
      außerhalb der EU verarbeitet werden. Grundlage sind die EU-Standardvertragsklauseln. Deine
      Konto- und Inhaltsdaten liegen in der EU.</p>
      <p><b>6. Speicherdauer</b><br>Kontodaten werden gespeichert, bis du dein Konto löschst. Technische
      Protokolle werden nur kurzzeitig vorgehalten.</p>
      <p><b>7. Deine Rechte</b><br>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung,
      Datenübertragbarkeit und Widerspruch. Außerdem kannst du dich bei einer Aufsichtsbehörde
      beschweren. Kontakt: ${esc(c.email)}.</p>
      <p><b>8. Konto löschen</b><br>Du kannst dein Konto und alle zugehörigen Daten jederzeit in der App
      löschen: Einstellungen → „Konto löschen“.</p>
      <p><b>9. Minderjährige</b><br>Für die Nutzung von SideQuest musst du mindestens 16 Jahre alt sein.</p>
      <p><b>10. Lokaler Speicher</b><br>Für den Login nutzen wir den lokalen Speicher des Browsers, damit
      du angemeldet bleibst. Das ist technisch notwendig und dient nicht dem Tracking oder der Werbung.</p>`;
  },
};

// kleine HTML-Escape-Hilfe (legal.js lädt vor feed.js, daher eigene Funktion)
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
