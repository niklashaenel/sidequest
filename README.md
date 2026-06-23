# SideQuest

> ### 🔗 Live-App: **https://niklashaenel.github.io/sidequest/**
> (Im Ordner liegt auch „SideQuest oeffnen.url" — einfach doppelklicken.)
> Quellcode öffentlich: https://github.com/niklashaenel/sidequest

Eine Quest am Tag. Erst posten, dann den Feed der anderen sehen.
Web-App (PWA) mit **Supabase** (Login + Datenbank + Foto-Speicher).

---

## 1. Supabase einrichten (einmalig, im Browser)

### a) Projekt anlegen
1. Auf https://supabase.com mit GitHub einloggen → **New Project**.
2. Name: `sidequest`, DB-Passwort vergeben (notieren), Region: **Frankfurt (EU)**.
3. Nach ~2 Min: **Project Settings → API**.
   - `Project URL` und `anon public` Key kopieren →
     in [`js/supabaseClient.js`](js/supabaseClient.js) oben eintragen.

### b) E-Mail-Bestätigung für Tests ausschalten
**Authentication → Sign In / Providers → Email → "Confirm email" = AUS.**
So können Tester sich sofort ohne Bestätigungsmail einloggen.

### c) Tabellen anlegen
**SQL Editor → New query →** folgendes einfügen und **Run**:

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz default now()
);

create table public.quests (
  id bigint generated always as identity primary key,
  quest_date date not null unique,
  title text not null,
  created_at timestamptz default now()
);

create table public.submissions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id bigint not null references public.quests(id) on delete cascade,
  image_url text not null,
  created_at timestamptz default now(),
  unique (user_id, quest_id)
);
```

### d) Sicherheitsregeln (RLS) – zweite Query, einfügen und Run:

```sql
alter table public.profiles    enable row level security;
alter table public.quests      enable row level security;
alter table public.submissions enable row level security;

create policy "profiles read"   on public.profiles for select to authenticated using (true);
create policy "profiles insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles update" on public.profiles for update to authenticated using (auth.uid() = id);

create policy "quests read" on public.quests for select to authenticated using (true);

create policy "subs read"   on public.submissions for select to authenticated using (true);
create policy "subs insert" on public.submissions for insert to authenticated with check (auth.uid() = user_id);
```

### e) Foto-Bucket
**Storage → New bucket:** Name `submissions`, **Public** ankreuzen → Create.
Dann **SQL Editor** (erlaubt eingeloggten Usern das Hochladen):

```sql
create policy "auth upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'submissions');
```

### f) Erste Quest eintragen
**Table Editor → quests → Insert row:**
`quest_date` = heutiges Datum (YYYY-MM-DD), `title` = z. B.
„Mache ein High-Five mit einem Fremden".

---

## 2. Lokal testen

Die App ist eine reine Webseite – sie braucht nur einen kleinen Webserver
(direkt per Doppelklick auf `index.html` funktioniert die Kamera/Supabase nicht zuverlässig).

- **VS Code:** Erweiterung „Live Server" → Rechtsklick auf `index.html` → „Open with Live Server".
- **oder Python:** im Projektordner `python -m http.server 5500` → http://localhost:5500

In den **Browser-DevTools (F12) → Console** auf Fehler achten.

---

## 3. Veröffentlichen (GitHub Pages) & im Discord teilen

1. Neues **öffentliches** GitHub-Repo `sidequest` anlegen, Dateien pushen.
2. **Repo → Settings → Pages →** Branch `main`, Ordner `/root` → Save.
3. Nach ~1 Min ist die App unter `https://DEINNAME.github.io/sidequest/` live.
4. Link im Discord teilen. Tester öffnen ihn am Handy → „Zum Startbildschirm hinzufügen".

> Wichtig: GitHub Pages liefert über **https** aus – nur so erlaubt das Handy
> den Kamerazugriff. Lokal geht das über `localhost` ebenfalls.

---

## Projektstruktur

| Datei | Aufgabe |
|-------|---------|
| `index.html` | App-Gerüst, alle Screens als `<section>` |
| `styles.css` | Aussehen (dunkel, mobil-first) |
| `js/supabaseClient.js` | **Hier deine Supabase-URL + anon-Key eintragen** |
| `js/auth.js` | Registrieren, Login, Logout, Profil |
| `js/quest.js` | Heutige Quest laden |
| `js/upload.js` | Kamera-Foto in Storage + DB-Eintrag |
| `js/feed.js` | Beiträge der anderen anzeigen |
| `js/app.js` | Steuerzentrale (welcher Screen, Buttons) |
| `manifest.webmanifest`, `sw.js`, `icon.svg` | PWA (Zum Startbildschirm) |

---

## Bewusst noch nicht im MVP
Zufällige Quest-Zeit + Push-Benachrichtigung, serverseitiges Feed-Gate,
Bild-Komprimierung, Freunde-System. Kommt nach dem funktionierenden Prototyp.
