# Design-Vorschläge — Board (Session 2026-07-05)

Eigenständige, self-contained Design-Mockups (HTML, theme-aware hell/dunkel) in den
echten ÖAW-Tokens. Zum Ansehen: Datei im Browser öffnen. Als Claude-Artifacts
veröffentlicht (Links unten).

| Datei | Inhalt | Artifact |
|-------|--------|----------|
| `archive-redesign.html` | Archiv-Modal & „Ausgeblendet"-Leiste: Aktuell vs. Vorschlag (Kanal-Akzentkante, Zähler+Suche, Gruppierung, Hover, Leerzustand). **In Code umgesetzt** (`app/board/_components/archive-modal.tsx`, main `e3b4eff`). | https://claude.ai/code/artifact/f10d6cc6-a7b2-44ea-b758-8256f7b29a85 |
| `board-depth.html` | „Mehr Tiefe fürs Board" — 3 Richtungen (A Wertekontrast · B gesättigte Köpfe · C Hintergrund-Feld), MeisterTask-analysiert. Empfehlung: A+B, C optional. | https://claude.ai/code/artifact/dcec456e-f4ee-4d7b-ae9c-8567959223f7 |
| `board-c-detail.html` | Variante C aus der Nähe: volles Board + geöffnete Task-Karte (Kanalband, Fortschritts-Ring, Anhang-Vorschau, warme Kommentare). | https://claude.ai/code/artifact/ef4f8c5f-ae10-40cb-81e8-9142dab8ce3c |

## Kern-Erkenntnis (MeisterTask-Tiefe)

Tiefe kommt aus **drei gestapelten Ebenen** + einem strengen **~80/20 Neutral-zu-Farbe**-Verhältnis:
1. **Wertekontrast** — weiße Karte > neutrale, leicht eingesenkte Spaltenmulde > getönter Board-Grund.
2. **Farbe rationiert** — kräftige Farbe nur in Kopf, Tags, Avataren (~20 %); Körper neutral.
3. **Weicher Schatten** — ein diffuser, neutraler Schatten + ~12-px-Radius.

Gegenintuitiver Haupthebel: dem **Spaltenkörper die Kanaltönung wegnehmen** (heute getönt → neutral),
damit weiße Karten Kontrast gewinnen und schweben. MeisterTask nutzt **keine** Karten-Cover.
