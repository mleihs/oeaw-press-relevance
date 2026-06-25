# Resume: MinIO aufsetzen + Social-Images dauerhaft machen

**Trigger nach `/clear`:** „**weiter mit dem MinIO-Setup für die dauerhaften
Social-Images**" → diese Datei lesen und durcharbeiten. Der Code ist fertig; es
fehlt nur noch die Infrastruktur (MinIO) + die Env-Vars + der Backfill.

> Schwester-Memory: `social-images-durable-resume` (im Auto-Memory).
> Warum überhaupt: Instagram-`displayUrl`s laufen ab bzw. liegen auf nicht
> auflösbaren `*.fna.fbcdn.net`-Hosts → Bilder verschwinden (z. B. „Kind im Auto
> vergessen"-Post). Fix = Bytes einmal in S3-Storage speichern, von dort ausliefern.

## Was schon fertig + committet ist (lokal, NICHT gepusht)

`main` ist **ahead 3, unpushed** (kein Push ohne ausdrückliches OK des Users):
- `be2a133` events-scoring (unrelated, aus selber Session)
- `0028549` durable images (erste Fassung)
- `f55b9a5` **refactor auf S3-generisch** ← der relevante Stand

Implementiert + getestet (typecheck + lint sauber, 20 Tests grün, **end-to-end gegen
ein Wegwerf-MinIO validiert**: put/get-Roundtrip, missing→null, list, delete, Reconcile
löscht geplanten Orphan):
- `lib/server/storage/s3.ts` — generischer S3-Client (MinIO/R2/S3), Helpers
  put/get/list/delete/ensureBucket, **path-style default** (MinIO braucht das).
- `lib/server/social/images.ts` — Store-unstored + Reconcile-GC; Key
  `social/posts/<id>.jpg`; Invariante „Objekt existiert ⇔ Row hat image_path".
- `app/api/social/image/[id]/route.ts` — serviert gespeichertes Objekt, sonst
  Live-IG-Proxy-Fallback.
- `lib/server/social/refresh.ts` — non-fataler persist+reconcile-Schritt je Refresh.
- `scripts/backfill-social-images.ts`, `lib/server/env.ts` (S3_* optional), `.env.example`.
- Migration `supabase/migrations/20260625000001_social_post_image_path.sql` — Spalte
  `social_posts.image_path`. **Bereits auf local + prod DB angewandt.**

**Warum nicht Supabase Storage:** prod-Supabase ist **egress-gesperrt (HTTP 402,
`exceed_egress_quota`)** und Ausliefern von dort würde den Egress weiter belasten. DB-
Pooler läuft weiter. Backend-Entscheidung des Users: **self-hosted MinIO auf der VPS**
(projektübergreifend wiederverwendbar: velgarien, radwege → je eigenes Bucket + Key).

## Auftrag: „komplett alles für mich machen" — per Browser-Automation

Der User will, dass Claude die Einrichtung **per Browser-Automation auf seinen Konten**
erledigt (Coolify, ggf. Vercel, ggf. DNS). Vorgehen:
1. claude-in-chrome-Tools laden (ToolSearch), **zuerst `tabs_context_mcp`**.
2. Prüfen, was offen/eingeloggt ist (Coolify? Vercel? DNS-Provider?).
3. Schritt für Schritt durchführen, jeden Schritt zeigen. **Pausieren** bei echten
   Sperren: Logins/2FA, DNS falls Provider nicht erreichbar. Vor irreversiblen/
   outward-facing Aktionen (Redeploy) kurz ansagen (User hat generell autorisiert).

### Runbook MinIO via Coolify
1. **DNS:** A-Record `s3.<domain>` → VPS-IP (optional `minio.<domain>` für Console).
   Muss auflösen, bevor Coolify TLS zieht.
2. **Coolify → Project → + New → Service → „MinIO"** (Ein-Klick-Template) → deploy.
3. **Konfig:** MinIO öffnet **9000 (S3-API)** + **9001 (Console)**.
   - Domain für **9000** → `https://s3.<domain>` (= `S3_ENDPOINT`), TLS via Coolify.
   - Domain für 9001 → Console.
   - `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` notieren; `MINIO_SERVER_URL=https://s3.<domain>`.
   - **Persistentes Volume** für `/data` sicherstellen.
4. **Console → Root-Login →** Bucket `oeaw-press-relevance` (privat) anlegen; **Access
   Key** erstellen (→ Key + Secret notieren; optional Policy nur auf das Bucket).

### Env-Contract (diese 4; Region/Path-Style Defaults passen)
```
S3_ENDPOINT=https://s3.<domain>        # API-Domain (9000), NICHT Console!
S3_ACCESS_KEY_ID=<access key>
S3_SECRET_ACCESS_KEY=<secret>
S3_BUCKET=oeaw-press-relevance
```
Setzen auf: **Vercel** (prod-App → Env → Redeploy), **Coolify** (OeAW-App dort, falls
sie /social bedient → Redeploy), **`.env.local`** (für Backfill + lokale Dev).

## Danach: Backfill + Verifikation (macht Claude)
```bash
npm run backfill-social-images -- --target=prod
```
Erwartung: **~37 stored, 5 failed** (FNA-Hosts bleiben Fallback/Platzhalter), **0 removed**.

Verifizieren (prod):
```bash
PSQL=$(ls /opt/homebrew/Cellar/libpq/*/bin/psql | head -1)
URL=$(grep '^PROD_DB_URL_POOLER=' ~/.config/oeaw-press-release/prod-credentials | cut -d= -f2-)
"$PSQL" "$URL" -tAc "select count(*) filter (where image_path is not null) as stored, count(*) filter (where image_url is not null and image_path is null) as fallback from social_posts;"
# „Kind im Auto" Post sollte image_path gesetzt haben:
"$PSQL" "$URL" -tAc "select left(title,0)||image_path from social_posts where caption ilike '%Auto verg%';"
```
Dann: **User pusht `main`** (ahead 3) → Vercel/Coolify deployen → Bilder dauerhaft live.

## Nicht vergessen
- `S3_ENDPOINT` = Port-9000-Domain, nicht Console (9001).
- Bucket bleibt **privat**; Ausliefern über die gegatete App-Route (kein Public-Bucket).
- 5 FNA-Posts bleiben ohne `image_path` (DNS nicht auflösbar) → designter Platzhalter, kein Bug.
- Reconcile-GC ist DB-Wahrheit: löscht verwaiste Objekte je Refresh (retention-prune,
  Channel-Cascade, Drift).
