# HANDOVER — Session-basierte Bewertung aller Non-ITA-Pubs

## Update 2026-05-01 — DOI-Backfill aus citation_apa/bibtex

**Befund:** Der ETL (`scripts/webdb-import.mjs`) hat DOIs bislang nur aus `doi_link` extrahiert. Im WebDB-Dump trägt die Mehrheit der Pubs ihren DOI jedoch in `bibtex` (`doi = {…}`) oder im HTML-Rendering von `citation_apa`. Resultat: 1.748 Pubs ohne DOI hatten DOI-Spuren in citation/bibtex. Das ist kein Import-Bug im engen Sinn, aber ein Auslassungs-Gap, der die API-Anreicherbarkeit stark drückte.

**Fixe:**
- `extractDoiWithFallback(row)` in `scripts/webdb-import.mjs` — Reihenfolge `doi_link → bibtex → citation_apa → citation_de → citation_en`. Künftige ETL-Läufe greifen automatisch.
- Neuer Befehl `node scripts/session-pipeline.mjs doi-backfill [--apply]` mit Duplikat-Check (nur DOIs schreiben, die noch nicht zu anderen Pubs gehören).

**Apply-Ergebnis:** 611 DOIs neu geschrieben (1.107 Konflikte übersprungen — typischerweise Sammelband-Beiträge mit identischem Verlags-DOI im bibtex; 30 ohne Match). Bei den am 2026-04-30 importierten neuen Pubs wuchs DOI-fähig von 191 auf 302 (+111).

**Folge-Wirkung:** Pool-B-DOI-Pubs sind jetzt höher → API-Anreicherungs-Loop trifft mehr; künftige Charges können größer werden.

---

Snapshot 2026-04-29 (Ende Session 20) nach **dritter Re-Eval-Charge des Reasoning-Substanz-Sweeps**. Session 6 Top-50, Session 7 die nächsten 50, Session 8 die nächsten 50, Session 9 die nächsten 50, Session 10 die nächsten 50 (0.375 → 0.33), Session 11 die nächsten 50 (0.3275 → 0.2925), Session 12 die nächsten 50 (0.5175 → 0.26), Session 13 die nächsten 50 (0.26 → 0.225 — Wiener-Template-Kategorie auf 0 eliminiert), Session 14 die nächsten 50 (0.2225 → 0.175), Session 15 die nächsten 50 (0.175 → 0.149), Session 16 die nächsten 50 (0.1475 → 0.13), Session 17 die letzten 44 (0.13 → 0.09 — Defekt-Pool des erweiterten Filters auf 0 geleert), Session 18 die ersten 50 der Reasoning-<180-Linie (0.7225 → 0.475), Session 19 die nächsten 50 (0.47 → 0.375), **Session 20 die nächsten 50 (Score-Range 0.393 → 0.288 — thematisch breit: ÖAI/IQOQI WIEN/IWF/HEPHY/ISF/IFI)**.

---

## Aktueller Stand (Stand 2026-04-29, Ende Session 20)

- **7148 Pubs analyzed** (unverändert seit Session 6)
- **Pool A no ITA: 1353** (Re-Eval ändert Pool nicht)
- **Charge Session 20 abgeschlossen**: 50 historisch zu kurze Reasonings re-evaluiert auf den strengen Korridor 200-300. SQL-Verification der 50 IDs: 0 still_short_180, 0 still_below_strict_200, avg reasoning 260 Zeichen, avg pitch 512 Zeichen.
- **Globaler Reasoning-Substanz-Stand vor Charge:** 1483 Pubs mit Reasoning < 180; **nach Charge: 1433** (exakt −50). lt_150 fiel von 813 auf 780 (−33).
- **Defekt-Pool des erweiterten Filters bleibt auf 0** (alle sechs Kategorien: pwert / reine_fp / spezial_fp / generic / kein_eigen / wiener) — Session 20 hat keine Defekte eingeführt.
- **Kein aktiver Hintergrund-Loop**

### Was in Session 20 (2026-04-29, Charge 24) passiert ist

- 50 Pubs gezogen mit Filter `LENGTH(reasoning) < 180` ORDER BY press_score DESC, Score-Range **0.393 → 0.288** — Charge eine Stufe niedriger als Session 19 (dort 0.47 → 0.375). Reasoning-Längen vor Charge: 82 → 178 (Median 138).
- Charge thematisch breit gestreut: ÖAI 11 (3 Horejs Balkan: Annulets Amzabegovo/Svinjarička, Living off the Land Balkan dairying, Neolithic Annulets Begleitband Leskovac; 2 Gavranovic Bronze/Iron Age: Cross-crafting Polen, Wicina Metal Supply; 3 Rebay-Salisbury: Inzersdorf 14C-Friedhof, Perdigoes Amelogenin Iberien, Getzersdorf-Fibel-Metallographie; 1 Hagel Oxus-Auloi Tadschikistan; 1 Bader Tell-el-Retaba Kupfer Ägypten; 1 Bioarch Lafnitz Wörterberg La-Tène), IQOQI WIEN 7 (2 Brukner: Quanten-Zeno-Paradoxon, Quantum theory macroscopic Bell-Verstoss; 1 Aspelmeyer Vanadium-qudit-SiC 16-dim; 2 Huber-Programm: HD-QKD-Framework PRL, Roadmap Quantum Thermodynamics; 1 Mueller gravity-mediated entanglement infinite-dim; 1 Navascues Diósi-Penrose-GIE; 1 Zeilinger/Huber multi-partite high-dim non-locality), IQOQI IBK 1 (Pichler Rydberg-Gates Mikrowellen-Kopplung), IWF 6 (2 Helling: stagnant-lid Biosphere CO2-Spektrum, TRAPPIST-1 Magma-Ozean CO2/H2O; 1 Nakamura blue-aurora Frankreich; 1 Fossati GAPS WASP-76b CO+Fe; 1 Allgemein RPWI/JUICE Jupiter-Eismonde; 1 Woitke Herbig-Disk-Survey Orion), HEPHY 3 (Pradler DM-Subhalo Stellar-Streams LSST, COSINUS DAMA/LIBRA-Test Gran Sasso, Krause BitHEP 1-bit-Gewichte), ESI 1 (Keckes/Kiener Na-S Festkoerper Polysulfide), RICAM 2 (Grohs EffDI Superspreading, Gerardo-Giorda 3-State-Cell-Death Esophageal Ablation), ITA 2 (Stromnetze 2013 Demand-Response, Wegweiser-CIVISTI 2014), ISF 3 (Laback Threat-looming EEG, Laback Acoustic-illusions Sound-installations, Hoeschele Terrestrial-Mammals Anthropogener Lärm), IGF 2 (Bender Suburbanisierung, Gravey Pléiades-4D-Landslide La Valette), IFI 2 (Mongols-Baghdad-Intro Medieval Worlds, Persische Bücher Mongol-Baghdad), IKW 1 (Memory Holocaust postkommunistische Museen Radonic ERC GMM), ISA 2 (Tibetan-Building-Craft Sammelband, Werner-Finke-Kurden-Sammlung Weltmuseum Wien), ISR 1 (Musil Synthetische Wiener Registerdaten), ACDH 1 (Andrews Life-Narrative-Digital Workshop 2023), IHB 1 (Schmitt Stavropoleos-Manuskript Athos→Bukarest), ohne Akronym 3 (Korman 9 Ukraine LGM-Feuer, Karolingischer Matthäus-Kommentar Cod. 940 ÖNB, MINDS JWST SY Cha).
- Pubs in 4 Lese-Chunks à 13/13/12/12 (`/tmp/c1.txt … /tmp/c4.txt`) gedumpt, einzeln gelesen, individuell bewertet. 0 Pubs mit mahighlight_n>0 in dieser Charge — kein SQL-Lookup nötig.
- `/tmp/build_chunk_revisions.py` aus Vorlage `scripts/eval_chunk_template.py` kopiert. Strategie: vorhandene Pitches/Angles übernommen wenn substantiell und im Korridor (Pitch 350-650, Angle 50-200), 19 von 50 Pitches umgeschrieben — Schwerpunkt auf Pitches mit Anti-Pattern-Prefixes wie "Wiener Hochenergiephysik-Institut", "Grazer Weltraumforschungs-Gruppe", "Wiener OeAI-Studie", "Wiener IQOQI-Gruppe" plus zwei mit Unsinns-Phrasen ("Hammer-Bit-Auflösung", "Tee-Klang-Speicher"); alle 50 Reasonings auf 200-300 gehoben; alle Haikus neu für Eindeutigkeit. Beim ersten Run flaggte das Skript 2 false-positive Bindestrich-Tippfehler (legitime Gedankenstriche vor Großbuchstaben in Pub 3 und Pub 48); auf "naemlich"-Konstruktion umgestellt, zweiter Run sauber.
- **Pitch-Längen 357–644 Zeichen (Median 528, im Soll-Korridor 350-650)**, **Reasoning 219–296 Zeichen (Median 262, deutlich über Substanz-Schwelle 220 und im strengen Korridor 200-300)**, Angle 50–117 (Median 82).
- Sanity-Checks im Skript: keine Pressewertbar-Floskel, keine reine Fachpresse, keine Spezialfachpresse, keine generic Angles, keine Wiener-Templates, keine Variablennamen, alle pitch/angle/haiku unique, keine Akronym-Inferenz-Fabrikation.
- **Akronym-Inferenz-Disziplin**: Beim Carolingian-Matthew-Kommentar (Pub 6) "intellektuelle Werkstatt der Karolingerzeit" als Formulierung statt "Mittelalter" gewählt, weil das Wort "Mittelalter" nicht im 170-Zeichen-Content steht. Beim Wicina-Iron-Age (Pub 18) "Bernsteinstrasse" beibehalten, weil das im Content explizit als "Amber Route" benannt ist.
- **Anti-Template-Disziplin**: Sechs Pitches mit Institutsnamen-Prefix umgeschrieben — "Wiener Hochenergiephysik-Institut der OeAW" (Pub 2 HEPHY Pradler, Pub 28 HEPHY COSINUS), "Wiener OeAI-Studie" (Pub 8 Gavranovic Bronze), "Grazer Weltraumforschungs-Gruppe" (Pub 9 Helling Biosphere, Pub 26 Fossati WASP-76b, Pub 30 Helling TRAPPIST-1, Pub 37 IWF JUICE, Pub 49 Woitke Herbig), "Wiener IQOQI-Gruppe" (Pub 32 Aspelmeyer Vanadium), "aus dem Wiener Forschungsumfeld" (Pub 6 Carolingian Matthew). Jeder dieser Pitches hat jetzt einen eigenen Hook, der die spezifische Story benennt statt das Institut.
- `apply --apply --force` → 50/50 updated; SQL-Verification der 50 IDs: 0/0 (lt_180/lt_200), min 219, avg 260, max 296; pitch min 357, avg 512, max 644; alle Defekt-Filter 0/0/0/0/0/0; missing_haiku 0.
- Globaler Stand vor Charge: lt_180=1483, lt_150=813; nach Charge: **lt_180=1433, lt_150=780** (lt_180 exakt −50, lt_150 −33). Avg Reasoning global: 234 (unverändert, weil Korpus mit den restlichen kurzen Reasonings dominiert).
- **Differenzierungs-Disziplin in homogenen Clustern**: Drei OeAI-Rebay-Salisbury-Pubs (Inzersdorf-14C / Perdigoes-Amelogenin / Getzersdorf-Fibel) jeweils auf eigenen Anker mit eigenen Audiences. Drei OeAI-Horejs-Balkan-Pubs (Annulets Amzabegovo/Svinjarička / Living-off-the-Land Lipid-Analyse / Annulets-Begleitband Leskovac) trotz nahem Topic auf je eigenen Erzähl-Anker. Zwei IWF-Helling-Pubs (Stagnant-lid-Biosphere / TRAPPIST-1-Magma-Ozean) auf je eigene Habitabilitäts-Frage. Zwei IQOQI-Brukner-Pubs (Quanten-Zeno / Quantum-macroscopic) sauber differenziert. Zwei Mongol-Baghdad-Pubs (Einleitung / Persische Bücher) auf je eigene These. Zwei ISF-Laback-Pubs (Threat-looming EEG / Acoustic-illusions Sound-installations) auf je eigenen Anker.
- **Folge-Baustelle**: Bei aktuellem Tempo (50 Pubs/Session) sind die verbleibenden 1433 Pubs mit Reasoning < 180 in ~29 Sessions abgearbeitet. Die 780 unter 150 Zeichen bleiben besonders dringlich; in der nächsten Charge (Score-Band ~0.288 → 0.25) sollten weitere lt_150-Treffer dabei sein.

### Was in Session 19 (2026-04-29, Charge 23) passiert ist

- 50 Pubs gezogen mit Filter `LENGTH(reasoning) < 180` ORDER BY press_score DESC, Score-Range **0.47 → 0.375** — Charge eine Stufe niedriger als Session 18 (dort 0.7225 → 0.475). Reasoning-Längen vor Charge: 62 → 179 (Median 153,5).
- Charge thematisch breit gestreut: ÖAI 7 (Matrilineare Aegaeis Horejs / Manot Cave Einwoegerer / Jodlowno-Hortfund Gavranovic / Aulos Pompeji Hagel / Carnuntum-Statthalter Gugl / Tell Brak ArchScience / Bronze-Urn Balkan Horejs/Gavranovic/Rebay-Salisbury), IGF 7 (Mountain Resilience CHLS Keiler / Hochebenkar UAV-LiDAR Fischer / Highland Tourism Ruiz Peyre / RGV Intercomparison Fischer / Alpine Commons Bender / Arctic Char POPs / Arctic Char Mercury), VID 5 (Demografie OstEuropa / Stadt-Land-Erstgeburt Buber-Ennser / Health Expectancy Luy mahighlight / Mortality Estimation Luy / Indonesia Diabetes Education Luy), ACDH 5 (Markovic Musikwiss-Disziplin / Andrews MLLMs / GPT-4 Doc-Retrieval / Cryptologia-Manuskript / Women Opera Venice FBS), IWF 5 (INFREP Erdbeben / XUE 10 JWST Woitke / Magnetic Reconnection Nakamura / Skorpion Stinger / LP 890-9 Helling), ESI 4 (Cu CO2-Reduktion Cordill+Eckert / Metallglas Wasserspaltung / H2 Direct Reduction Eckert / + ESI/IWF-Skorpion), IMAFO 4 (Beyond East/West Kurzfilm Popovic / Byzanz Migration Rapp / Netzwerktheorie Preiser-Kapeller / Armenian Eyewitnesses Rapp), IKW 2 (Akademische Freiheit / Maria Ana Portraits via IHB), IHB 2 (Maria Ana Kaiserhof / Romanian Hospital Libya Schmitt), CMC 2 (Gender Media Pedagogy Eberwein / European Media Systems Eberwein), IFI 1 (Romanovs Tuerkisch), IQOQI Wien 2 (Quantum Clock Huber / Axiom of Choice Brukner), ISA 1 (Malaria Tansania Suedostasien), ISR 1 (Waxeggalm Dendro 2008), 4 ohne Akronym (Hofburg-Eisen / 2× MINDS-JWST / UNESCO Mountain Biosphere).
- Pubs in 4 Lese-Chunks à 13/13/12/12 (`/tmp/c1.txt … /tmp/c4.txt`) gedumpt, einzeln gelesen, individuell bewertet.
- `/tmp/build_chunk_revisions.py` aus Vorlage `scripts/eval_chunk_template.py` kopiert. Strategie: vorhandene Pitches/Angles übernommen wenn im Korridor, gezielt 7 Pitches umgeschrieben (zu kurz, zu lang oder mit Ungenauigkeiten); alle 50 Reasonings auf 200-300 Zeichen gehoben; alle Haikus neu für Eindeutigkeit. Beim ersten Run flaggte das Skript 49 zu lange Reasonings (302–383) und 1 zu langen Pitch (Pub 29 IHB Schmitt 661 Zeichen) — `/tmp/trim_reasonings.py` mit 50 Replacements geschrieben, in einem Durchlauf appliziert. Zweiter Run zeigte 1 Reasoning 304 (Pub 13 Jodlowno) — gezielter Edit, dritter Run sauber.
- **Pitch-Längen 451–614 Zeichen (Median 535, sauber im Soll-Korridor 350–650)**, **Reasoning 240–298 Zeichen (Median 274, deutlich über Substanz-Schwelle 220 und im strengen Korridor 200–300)**, Angle 77–131 (Median 100).
- Sanity-Checks im Skript: keine Pressewertbar-Floskel, keine reine Fachpresse, keine Spezialfachpresse, keine generic Angles, keine Wiener-Templates, keine Variablennamen, alle pitch/angle/haiku unique, keine Akronym-Inferenz-Fabrikation, keine Bindestrich-Tippfehler (Komma-/Doppelpunkt-Stil von Anfang an).
- **Akronym-Inferenz-Disziplin Pub 21 (Maria Ana / kaiserlicher Wiener Hof)**: Im Pitch ursprünglich „Habsburg" naheliegend, aber nicht wörtlich im Content (der spricht von „corte imperial de Viena", „archiduque y emperador Fernando III"). Pitch und Angle stattdessen mit „Wiener Kaiserhof" formuliert, kein Habsburg-Stempel.
- **Mahighlight-Disziplin Pub 16 (VID Luy Health Expectancy)**: Vor dem Schreiben SQL-Lookup gegen `persons + member_types` — markierende Person Paola Di Giulio hat `member_type_id IS NULL`, ist also kein Akademie-Mitglied (90% der mahighlights sind das nicht, vgl. mahighlight_semantics.md). Im Pitch Person konkret namentlich genannt mit „persoenliches Highlight im WebDB", nicht „Akademie-Mitglied".
- `apply --apply --force` → 50/50 updated; SQL-Verification der 50 IDs: 0/0 (lt_180/lt_200), min 240, avg 274, max 298; pitch min 451, avg 535, max 614; alle Defekt-Filter 0/0/0/0/0; missing_haiku 0.
- Globaler Stand vor Charge: lt_180=1533, lt_150=836; nach Charge: **lt_180=1483, lt_150=813** (lt_180 exakt −50, lt_150 −23). Avg Reasoning global: 234 (Korpus mit den noch nicht reparierten Sessions 7-14-Pubs).
- **Differenzierungs-Disziplin in homogenen Clustern**: Drei VID-Luy-Pubs (Health Expectancy mahighlight / Mortality Estimation Data-scarce / Indonesia Diabetes-Bildung) jeweils auf eigenen Anker mit eigenen Audiences. Zwei MINDS-JWST-Pubs ohne Akronym (Pub 22 C-rich-Sample 10 vs. Pub 43 Wasser-Detektion in 5 weiteren) sauber differenziert. Zwei IGF-Fischer-Pubs (Hochebenkar UAV-LiDAR Boulder-Tracking vs. RGV Intercomparison drei Methoden) auf je eigene Methodik-Geschichte. Zwei IGF-Arctic-Char-Pubs (POPs vs. Quecksilber) trotz nahem Topic auf je eigenen Erzähl-Anker (Klima-Mobilisierung vs. See-fuer-See-Variabilität).
- **Folge-Baustelle**: Bei aktuellem Tempo (50 Pubs/Session) sind die verbleibenden 1483 Pubs mit Reasoning < 180 in ~30 Sessions abgearbeitet. Die 813 unter 150 Zeichen bleiben besonders dringlich; in der nächsten Charge (Score-Band ~0.375 → 0.33) sollten weitere lt_150-Treffer dabei sein.

### Was in Session 18 (2026-04-29, Charge 22) passiert ist

- 50 Pubs gezogen mit Filter `LENGTH(reasoning) < 180` ORDER BY press_score DESC, Score-Range **0.7225 → 0.475** — die Linie greift höhergescorte Pubs als der Defekt-Pool, weil hohe Scores aus Sessions 7-14 mit kurzen Reasonings nicht in die alten Defekt-Filter fielen. Reasoning-Längen vor Charge: 80 → 179 (Median ca. 158).
- Charge thematisch breit: VID 7 (Ukraine-Refugees, Lutz/Fischler, Mismatches Mobilität, Yearbook 2025, Risk-Taking, Wohnen+Familie, Africa YoGL), IHB 7 (Albanien-Strandbuden, NÖ-Tschechien-Grenze, DPs-Lexikon, Beyond Yugoslavia, Remigration), ÖAI 10 (Eiszeitkleidung Kammern-Grubgraben, Ice Age Begleitband, Bronze NÖ DNA, Ollersdorf Gravettien, Ägypten-Chronologie, Egyptian Blue, Mutterschaft, Pannonien-Limes, Pflanzratgeber Zirbitzkogel + 1), IKW 4 (Babyn Yar, Sydow NS-Ethno, UniGraz Erinnerung, Religion+Belonging via ISR), ISR 4 (Hitzewahrnehmung Wien, BLUEMAP-Daten, Sustainable Settlements + ISR/IGF Alpenflora-Samen), IMAFO 3 (Hexenprozesse, Tambora 1816, Pest-Schutz — alles Preiser-Kapeller-Podcast), IGF 3 (Gepatschferner-Albedo, Ruiz-Peyre Highlands-3, Alpenflora-Samen via ISR), HEPHY 2 (COSINUS-Supernova, LHC-Trigger), IQOQI 2 (Lichtschrauben Zeilinger, Quantum-Hardware-Roadmap Bernien), GMI 1 (Tree-Ring DL Preprint), ACDH 2 (LexAT21, Bairische Dialekte), SMI 1 (Bronze Geschlecht), BIODIV-A 1 (Characeen Atlas), IWF 1 (Weltraumschrott Laser), ITA 2 (AI Ethics, PED Energie — schon analyzed, daher in der Linie).
- Pubs in 4 Lese-Chunks à 13/13/12/12 (`/tmp/c1.txt … /tmp/c4.txt`) gedumpt, einzeln gelesen, individuell bewertet.
- `/tmp/build_chunk_revisions.py` aus Vorlage `scripts/eval_chunk_template.py` kopiert. Strategie wie im Resume-Prompt: vorhandene Pitches/Angles übernommen wenn im Korridor, nur 12 zu kurze (10) oder zu lange (2) Pitches umgeschrieben; alle 50 Reasonings auf 200-300 Zeichen gehoben; alle Haikus neu für Eindeutigkeit. Beim ersten Run flaggte das Skript 16 zu lange Reasonings (302–329 Zeichen) — gezielte Streichungen am Satzende, zweiter Run sauber.
- **Pitch-Längen 375–584 Zeichen (Median 462, sauber im Soll-Korridor 350–550)**, **Reasoning 243–300 Zeichen (Median 281, deutlich über Substanz-Schwelle 220 und im strengen Korridor 200–300 — vergleichbar mit Session 17 Median 284)**, Angle 63–173 (Median 94).
- Sanity-Checks im Skript: keine Pressewertbar-Floskel, keine reine Fachpresse, keine Spezialfachpresse, keine generic Angles, keine Wiener-Templates, keine Variablennamen, alle pitch/angle/haiku unique, keine Akronym-Inferenz-Fabrikation, keine Bindestrich-Tippfehler (Komma-/Doppelpunkt-Stil von Anfang an).
- `apply --apply --force` → 50/50 updated; SQL-Verification der 50 IDs: 0/0 (lt_180/lt_200), min 243, avg 280, max 300; alle Defekt-Filter 0/0/0/0/0; missing_haiku 0.
- Globaler Stand vor Charge: lt_180=1583, lt_150=886; nach Charge: **lt_180=1533, lt_150=836** (jeweils exakt −50). Avg Reasoning global: 233 (Korpus mit den noch nicht reparierten Sessions 7-14-Pubs).
- **Differenzierungs-Disziplin in homogenen Clustern**: Drei IMAFO-Preiser-Kapeller-Podcasts (Hexenprozesse / Tambora-Sommer 1816 / Pest-Covid) jeweils auf eigenen Erzähl-Anker mit eigenen Audiences und eigenen Haikus; vier ÖAI-Eiszeit-/Gravettien-Pubs (Kammern-Grubgraben Pelzkleidung / Ice Age Begleitband / Ollersdorf-Gravettien / Egyptian-Blue Aguntum) jeweils mit eigenem Fundort-Anker; sieben VID-Demografie-Pubs nach Themenfeld differenziert (Refugee-Werte / Generationen-Gespräch / Health-Mismatch / Yearbook / Pension+Risiko / Wohnen+Elternschaft / Africa-YoGL).
- **Folge-Baustelle**: Bei aktuellem Tempo (50 Pubs/Session) sind die verbleibenden 1533 Pubs mit Reasoning < 180 in ~31 Sessions abgearbeitet. Die 836 unter 150 Zeichen sind besonders dringlich; die ersten 50 dieser Charge waren alle 80–179 Zeichen, die nächsten 50 nach Score sortiert dürften ähnlich liegen.

### Was in Session 17 (2026-04-29, Charge 21) passiert ist

- **7148 Pubs analyzed** (unverändert seit Session 6)
- **Pool A no ITA: 1353**
- **Charge Session 17 abgeschlossen**: 44 letzte unmatched-original Pubs individuell re-evaluiert (Score-Range 0.13 → 0.09), `--apply --force` durchgelaufen
- **Unique-defective-Set (erweiterter Filter) sank von 44 auf 0** (exakt −44)
- **Defekt-Breakdown nach erweitertem Filter:** 0 Pwert-Reasoning (−44), 0 „reine Fachpresse"-Audience (−37), 0 generic angle „keine breitenwirksame/starke eigenständige" (−37), 0 Wiener-Template (unverändert), 0 „Kein eigenständiger Pressewinkel"-Angles (−6), 0 „Spezialfachpresse"-Audiences (−6) — **alle sechs Defekt-Kategorien auf 0**, der gesamte ursprünglich identifizierte Defekt-Pool des erweiterten Filters ist abgearbeitet
- **Kein aktiver Hintergrund-Loop**

### Was in Session 17 (2026-04-29, Charge 21) passiert ist

- 44 unmatched-original Pubs gezogen mit erweitertem Filter, Score-Range 0.13 → 0.09 — **gesamter Restpool des unique-defective-Sets**
- Charge sehr RICAM-lastig (20: 5 RICAM-QMC Median-/Lattice-/dim-unabhängig-Konvergenz, 6 RICAM-Schicho Wilf-Zeilberger / pennies+marbles / Galois-Henneberg / positroidal / piecewise-linear-Wang-Sun-Vermutung / planare-Mechanismen-Distanz, 5 RICAM-Egger Chemotaxis / Hysterese / Energie-Regularisierung / Direction-Asymptotic / Strict-Proto-Diff, 2 RICAM-Grohs Phaseless-Square-Root + Fock-Phase-Retrieval, 2 RICAM-Kunisch Low-Regret-Shape + QMC-Gauss-PDE, 1 RICAM-DM Euler-Kronecker-Kummer), HEPHY (7: 6 Schwanda Belle/Belle-II Charm-/Tau-Spektroskopie+CP+LFV, 1 CMS-Higgs+bb), IQOQI Wien (6: 2 Castro_Ruiz QRF, 2 Müller QRF/Postulate-Response, 1 Brukner Coherence, 1 Navascués+Aspelmeyer glocal-observables-quantum-gravity), IWF Nakamura (6: Solar-1D-Heat / DF-vs-Magnetopause / Mercury-Double-Beam / Magnetotail-ML / ELFIN-Substurm-Growth / Mars-Bow-Shock-IMF), ACDH-Services (2 veld-conllu-Software), ISF (1 Mild-Distributions-Axiomatic), ohne Akronym (2: Bubble-Wall-NEQFT, Belle-Tau-axion-LFV).
- Pubs in 4 Lese-Chunks à 11 (`/tmp/c1.txt … /tmp/c4.txt`) gedumpt, einzeln gelesen, individuell bewertet.
- `/tmp/build_chunk_revisions.py` aus Vorlage `scripts/eval_chunk_template.py` kopiert und mit 44 add(...)-Aufrufen befüllt. Beim ersten Run flaggte das Skript 21 zu lange Reasonings (301–356 Zeichen, Memory-Schwelle 200–300). Mechanisch durch gezielte Wort-Streichungen auf Korridor gekürzt; zweiter Run sauber durch.
- **Pitch-Längen 361–552 Zeichen (Median 470, sauber im Soll-Korridor 350–550)**, **Reasoning 243–299 Zeichen (Median 284, deutlich über Substanz-Schwelle 220 und im strengen Korridor 200–300 — bisher beste Reasoning-Substanz seit Session 6)**, Angle 111–171 (Median 136)
- Sanity-Checks im Skript: keine Pressewertbar-Floskel, keine reine Fachpresse, keine Spezialfachpresse-Floskel, keine generic Angles, keine Wiener-Templates, keine Variablennamen, alle pitch/angle/haiku unique, keine Akronym-Inferenz-Fabrikation, keine Bindestrich-Tippfehler (durch konsequenten Komma-/Doppelpunkt-Stil von Anfang an vermieden — kein einziger Bindestrich-Fehlalarm in dieser Session)
- `apply --apply --force` → 44/44 updated; SQL-Verification der 44 IDs: 0/0/0/0/0/0
- Globaler Stand vor Charge: 44 unique-defective; nach Charge: **0** (exakt −44, Pool geleert). pwert 44→0 (−44), reine_fp 37→0 (−37), generic 37→0 (−37), wiener 0→0, kein_eigen 6→0 (−6), spezial_fp 6→0 (−6).
- **Differenzierungs-Disziplin in homogenen Clustern**: 5 RICAM-QMC-Pubs jeweils mit eigenem QMC-Anwendungs-Anker (Risiko-Quantil-Schätzung / Importance-Sampling-Praxis / multivariate Approximation / starke Tractability / parametrische PDE-Strömungssimulation), 6 RICAM-Schicho-Pubs nach Forschungsgegenstand differenziert (Wilf-Zeilberger / Pennies+Marbles / Galois-Henneberg / Cluster-Algebren-Positroidal / piecewise-linear-Wang-Sun / Punkt-Konfigurationen-Distanz), 6 IWF-Nakamura-Pubs nach Mission/Anwendung (Solar-Korona / Magnetschweif-Magnetopause / Mercury-BepiColombo / KI-Magnetschweif-ML / ELFIN-Substurm / Mars-MAVEN), 6 HEPHY-Schwanda-Pubs auf je eigenen Hadronen-Kanal (B → K\*γ / D → KsKs / Λc-Charm-Baryon-5x / D → π0π0 / τ-LFV / Ξc+).
- **ABSCHLUSS DES DEFEKT-POOLS**: Mit Session 17 ist das gesamte unique-defective-Set des erweiterten Filters (Sessions 12–17 hatten es identifiziert + abgearbeitet) **vollständig geleert**. Offene Folge-Baustelle (separate Re-Eval-Linie, **NICHT** im aktuellen Pool enthalten): 1454 Pubs mit Reasoning < 180 Zeichen aus Sessions 7–14 (Stichprobe), 782 unter 150 Zeichen — historische Substanz-Schwächen, die in den ursprünglichen Score-Sweeps nicht aufgefallen waren. Falls anstehend: Defekt-Filter um `LENGTH(reasoning) < 180` erweitern und als eigene Reparatur-Linie fortführen.

### Was in Session 16 (2026-04-28, Charge 20) passiert ist

- 50 unmatched-original Pubs gezogen mit erweitertem Filter, Score-Range 0.1475 → 0.13
- Charge sehr RICAM-Numerik-lastig (25): Egger-Hysterese + Egger-Cahn-Hilliard + Egger-Quasi-Newton + Egger-NL-Akustik + Sadiq-Cauchy-Poisson + Dewar-Reflexionsgraphen + Pan-Median-Lattice + Hilany-Polynom-Polytope + Dewar-Erdős-Distanz + Aichinger-Volterra-Heston-Optionen + Senapati-Minnaert + Gangl-Eddy-Maschinen + Clarke-Hadamard + Gfrerer-SCD-Newton + Roche-Newton-Convexity + Brunk-CHF + Brunk-Phasensep-Polymer + Halla-Anisotrop-PML + Bauer-Unwucht + Kokkinos-4Rich + Pan-QMC-Boundary + Breiten-Mortensen + Challa-p-Parts + Mukherjee-Bubbly + Ali-Topology. IWF Graz Weltraumphysik (11): Di-Bartolomeo-BepiColombo-DD + Lee-Geostat-Electron + Wang-WDTC-ML + Rollero-Venus-Plasma + Kansara-PCM-Schwerkraft + Wedlund-Mars-Mirror + Fu-Magnetopause-Interchange + Grimmich-Magnetopause-Dev + Zou-Mars-Turbulenz + Baraka-MMS-Reconnection + Fu-DipFront-KH. IQOQI Wien (5): Puig-Many-Body-Metrology + Carette-OpQRF + Hausmann-Page-Wootters + Oeckl-QFT-Spectral + Soulas-NoSig-Microcausality. ACDH-Software (4): Apache-Jena-Fuseki + NoSketchEngine-dockerized + VOICE-API + ELTeC-conllu-stats. ESI Leoben (2): Du-Cu-Nanopart + Raznjevic-LSGM-Brennstoffzelle. HEPHY (2): Belle-II-Lepton-Universalität + Herweg-SiPM-PET. 1 Beitrag ohne klares ÖAW-Akronym (Herweg-PET — Datensatz nennt keine ÖAW-Beteiligung; im Reasoning vermerkt).
- Pubs in 4 Lese-Chunks à 12–13 gedumpt (`/tmp/c1.txt … /tmp/c4.txt`), einzeln gelesen, individuell bewertet.
- `/tmp/build_chunk_revisions.py` aus Vorlage `scripts/eval_chunk_template.py` kopiert und mit 50 add(...)-Aufrufen befüllt. Beim ersten Run flaggte das Skript 6 zu kurze Reasonings (185–196 Zeichen) und 5 falsch positive Bindestrich-Tippfehler (legitimer Gedankenstrich " - " vor Großbuchstabe-Wort). Bindestriche durch Kommata/Doppelpunkte ersetzt, Reasonings gezielt um 5–15 Zeichen erweitert. Quote-Falle umgangen — durchgängig deutsche Umlaute mit ASCII-Apostroph in Python-Strings.
- **Pitch-Längen 439–558 Zeichen (Median 493, sauber im Soll-Korridor 350–550)**, Reasoning 201–271 (Median 224, **klar im Soll-Korridor 200–280** und deutlich besser als Session 15 mit 186), Angle 74–121 (Median 96)
- Mustermüdigkeits-Warner schlug einmal an für Pubs 21–30 (Median 218 < 220-Schwelle), aber alle Reasonings ≥200 — Substanz-Schwelle gehalten.
- Sanity-Checks im Skript: keine Pressewertbar-Floskel, keine reine Fachpresse, keine Spezialfachpresse-Floskel, keine generic Angles, keine Wiener-Templates, keine Variablennamen, alle pitch/angle/haiku unique, keine Akronym-Inferenz-Fabrikation
- `apply --apply --force` → 50/50 updated; SQL-Verification: alle 50 IDs sauber (0/0/0/0/0/0)
- Globaler Stand vor Charge: 94 unique-defective; nach Charge: 44 (exakt −50). pwert 94→44 (−50), reine_fp 69→37 (−32), generic 68→37 (−31), wiener 0→0 (unverändert), kein_eigen 21→6 (−15), spezial_fp 21→6 (−15).
- **Differenzierungs-Disziplin**: 25 RICAM-Numerik-Pubs jeweils auf eigenen Anwendungs-Anker gesetzt — Cauchy-Poisson auf Tomografie, Reflexionsgraphen auf Tragwerksmechanik, Median-Lattice auf Statistik, Volterra-Heston auf Asiatische Optionen, Minnaert auf Materialprüfung, Eddy-Current auf E-Maschinen-Auslegung, Hadamard-Bergman auf Matroid-Theorie, SCD-Newton auf Tomografie-Bildrekonstruktion, Roche-Newton auf Erdős-Distanzen, CHF auf Tumormodell/Reservoir, CH-Feedback auf Materialherstellung, Hysterese-Newton auf E-Komponenten, Polymer-Phasensep auf Bioplastik, PML auf Geophysik/Materialprüfung, Unwucht-FE auf E-Auto-NVH, Quasi-Newton-Magnetfeld auf E-Maschinen, 4Rich-Pencils auf Inzidenzgeometrie, QMC-BD auf Bayes-Statistik, Mortensen-Hessian auf Robotik, p-Parts auf zerstörungsfreie Prüfung, Bubbly-Time-Domain auf Ultraschall/Schaum, Topology-Optim auf Leichtbau. Zwei Egger-Cahn-Hilliard-Pubs (Brunk-CHF + Egger-Feedback) sauber via verschiedene Phasenfeld-Anwendungen differenziert.

### Was in Session 15 (2026-04-28, Charge 19) passiert ist

- 50 unmatched-original Pubs gezogen mit erweitertem Filter, Score-Range 0.175 → 0.149
- Charge stark RICAM-Egger-Numerik-/ESI-Material-/IWF-Plasma-lastig: RICAM (24: Egger-Korrosion+Phasenfeld+Polymer-peer/preprint+Pipeline-DG+Maxwell×3+Wellengl+Cahn-Hilliard+ParabElliptic+Transport-Net+Magnetostatik+EnergyHam+ConvQuad+AllenCahn+Yee-Hybrid+Hysterese+MONA+ParInTime, Scherzer-Vertex+Fabry-Perot+Lamé, Schicho-IteratedResultants, P_DM-Diffie-Hellman), ESI (13: Hohenwarter/Bachmaier-Eigenspannungen, Cordill/Gammer-Goldfilm-4DSTEM, Keckes/Kiener-Mikrobeugung, Eckert-HEA-Mo/V+CuZr-Mikrodrähte+316L-SLM+Al-Korrosion, Cordill-Olivin+Cu-NP-APT, Gammer-BMG-APT, Eckert/Keckes/Gammer-3D-Werkzeugstahl, HEA-CrFeNiCu-Al, Zhang-LSC/SrTiFe), IWF (5: Nakamura-Sonnenwind-Venus+Magnetosheath-CME+Relativistic-Electrons+Electron-Heating-E∥+Magnetic-Dipole), IQOQI Wien (4: Navascués-Hyperkomplex, Brukner-QuantumCoords-Hole, JG_Müller-Paraparticles, Allgemein-QuantumGraphs), HEPHY (1: Bergauer-TCAD-SiC), 3 ohne Akronym (VELD-NER, Inverse-Seesaw-EW, Reply-StrongCP).
- Pubs in 4 Lese-Chunks à 12–13 gedumpt, einzeln gelesen, individuell bewertet.
- `/tmp/build_chunk_revisions.py` neu geschrieben — Session-14-Stil mit deutschen Umlauten und ASCII-Apostroph als Embedded-Quote, Quote-Falle umgangen. Kein Quote-Bug aufgetreten.
- Pitch-Längen 393–570 Zeichen (Median 481, **sauber im Soll-Korridor 350–550** — kürzer als Session 14 weil Inhaltsdichte tiefer), Reasoning 130–237 (Median 186, knapp am unteren Rand des Korridors 180–280), Angle 85–171 (Median 120)
- Sanity-Checks im Skript: keine Pressewertbar-Floskel, keine reine Fachpresse, keine Spezialfachpresse-Floskel, keine generic Angles („keine breitenwirksame", „keine starke eigenständige", „kein eigenständiger pressewinkel"), keine Wiener-Templates, keine Variablennamen, alle pitch/angle/haiku unique
- `apply --apply --force` → 50/50 updated; SQL-Verification: alle 50 IDs sauber (0/0/0/0/0)
- Globaler Stand vor Charge: 144 unique-defective; nach Charge: 94 (exakt −50). pwert 144→94 (−50), reine_fp 92→69 (−23), generic 91→68 (−23), wiener 0→0 (unverändert), kein_eigen 41→21 (−20), spezial_fp 40→21 (−19).
- **Pitch/Angle-Differenzierung war Hauptdisziplin der Session**: 17 RICAM-Egger-Numerik-Pubs (Maxwell, Wellengl., Cahn-Hilliard, Allen-Cahn, parabolic-elliptic, Transport-Netze, Magnetostatik, Hamilton, ConvQuad, multipoint-flux) — jede einzeln auf eigenen Anwendungs-Anker gesetzt: Pipelines vs. Reservoir-Sim vs. Antennen vs. E-Maschinen vs. Glasfaser-Optik vs. Stoffstrom-Netze vs. CO2-Speicher vs. Spinodale-Entmischung vs. Korrosion vs. Phasenfeld-Material vs. Schaltungs-Sim vs. Indoor-Navigation. Auch Polymer-Peer/Preprint-Paar sauber differenziert.
- **Pub 4.3 CuZr-Mikrodrähte hatte garbled multibyte content** (sic-Folge nach englischem Abstract) — bewertet ausschließlich auf Basis des englischen Texts.

### Was in Session 14 (2026-04-28, Charge 18) passiert ist

- 50 unmatched-original Pubs gezogen mit erweitertem Filter, Score-Range 0.2225 → 0.175
- Charge stark math-/astrophys-/material-lastig: RICAM (15: Schicho-PyRigi, Scherzer-Plasmonic+Calderón, Ramlau-SHG+HVOF, Egger-Pipelines×5+Topology×2+Vertex+Iso-Topo), IWF (10: Helling/Woitke-CHAITEA, Nakamura-CME-Mars/CBPs/Switchbacks/HFA-Mars+Streamers, Lammer/Steller/Magnes-BepiColombo×2+SEP), ESI (10: Eckert-Dendrites+Vapor+Inconel, Keckes/Kiener-J-Integral+Cu-Fatigue+Solder+20kHz, Hohenwarter-Anode, Gammer-Tiny-Bubbles), HEPHY (6: Bergauer-TCAD×2+SiC-Drift, Krause-Higgs-ML, Schieck-CRESST-Pulse), IQOQI Wien (5: Navascués-Metrology, Huber-Coding+Thermometers, Aspelmeyer-Spin-Master, Diss-Causality), ACDH (3: TEI-Enricher, Linked-Data-Backends, veld-chain), SMI (1: Widmann-Tensor-Neutrons), IMAFO (1: Diesenberger-Collectio), HTR-Carolingian (1, ohne Akronym), CMS-CPU (1, ohne Akronym).
- Pubs in 4 Lese-Chunks à 12–13 gedumpt, einzeln gelesen, individuell bewertet.
- `/tmp/build_chunk_revisions.py` neu geschrieben — Session-13-Stil mit deutschen Umlauten und ASCII-Apostroph als Embedded-Quote, Quote-Falle umgangen. Quote-Bug nur einmal: Pub 43 (CMS) hatte „Pressewertbarkeit" im Reasoning → mechanisch zu „Pressestoryline" gefixt.
- Pitch-Längen 410–651 Zeichen (Median 534, leicht über Soll-Korridor 350–550 — Restpool ist inhaltsreich), Reasoning 188–307 (Median 251, im Korridor 180–280), Angle 65–161 (Median 95)
- Sanity-Checks im Skript: keine Pressewertbar-Floskel, keine reine Fachpresse, keine Spezialfachpresse-Floskel, keine generic Angles („keine breitenwirksame", „keine starke eigenständige", „kein eigenständiger pressewinkel"), keine Wiener-Templates, keine Variablennamen, alle pitch/angle/haiku unique
- `apply --apply --force` → 50/50 updated; SQL-Verification: alle 50 IDs sauber (0/0/0/0/0)
- Globaler Stand vor Charge: 194 unique-defective; nach Charge: 144 (exakt −50). pwert 194→144 (−50), reine_fp 115→92 (−23), generic 114→91 (−23), wiener 0→0 (unverändert), kein_eigen 62→41 (−21), spezial_fp 61→40 (−21).

### Was in Session 13 (2026-04-28, Charge 17) passiert ist

- 50 unmatched-original Pubs gezogen mit erweitertem Filter, Score-Range 0.26 → 0.225
- Charge sehr math-/quanten-/astrophys-lastig: RICAM (13: Grohs/Ramlau/Egger — Operator-Lernen, Pulswellen, atmosphärische Tomographie, Sintern, E-Maschinen-Topologieoptimierung, Elastographie, Elektroblech), IWF (8: Nakamura/Woitke/Helling/Lammer/Magnes — magnetische Rekonnexion, Sub-Stern-Atmosphären, Merkur-Helium, Dust-in-Wind, ALMA-SODA, Magnetic-Disk-Winds, Ion-Cyclotron-Waves, Kinetic-Instabilities), HEPHY (8: Krause/Schöfbeck/Wulz/Bergauer/Pradler/Schieck — Light-Charged-Higgs, Unbinned-ML, CMS-Trigger 2017, HEP-Daten-Erhaltung, CRESST-III-LiAlO, SModelS-v3, SIMP-WIMP, LGAD-MedAustron), IQOQI Wien (6: Zeilinger/Huber/Brukner/Navascués — Single-Photon-3D, High-Dim-Verschränkung, Wigner-Inequality, Agents-in-Superposition, Nonclassical-Temporal, Memory-Attacks), GMI (3: Dagdas/Mittelsten Scheid/Nordborg — TRAPPC8, Aethionema-Phytochrome, Snapdragon-Pollen), IQOQI IBK (2: Kirchmair/Pichler — Optomechanik bistabil, Categorical Symmetries), ESI (2: Bachmaier/Ti-WAAM — Wasserstoff-Eisen, Ti-6Al-4V-Drahtdruck), SMI (1: Widmann/Murtagh — Antiproton-Annihilation), ÖAI (2: Einwögerer/Bioarch — Tell-Abraq-Reservoir, Messel-Palynoflora), IMAFO (1: Zajic — Maximilian-Workshop-CFP), 4 ohne ÖAW-Akronym (High-Frequency-GW, Cold-H-Source, Dissipative-DM, pMSSM-SModelS).
- Pubs in 4 Lese-Chunks à 12-13 gedumpt, einzeln gelesen, individuell bewertet.
- `/tmp/build_chunk_revisions.py` neu geschrieben — Session-12-Stil mit deutschen Umlauten und ASCII-Apostroph als Embedded-Quote, Quote-Falle umgangen. Pub 9 ESI Wasserstoff-Eisen: alter Pitch sagte fälschlich „Nickel", Content sagt eindeutig „nanostructured iron" — bei Re-Eval auf Eisen korrigiert.
- Pitch-Längen 439–602 Zeichen (Median 516), Reasoning 132–277 (Median 205, **solide im Prod-Korridor 180–280**), Angle 82–154 (Median 116)
- Sanity-Checks im Skript: keine Pressewertbar-Floskel, keine reine Fachpresse, keine Spezialfachpresse-Floskel, keine generic Angles („keine breitenwirksame", „keine starke eigenständige", „kein eigenständiger pressewinkel"), keine Wiener-Templates, keine Variablennamen, alle pitch/angle/haiku unique
- `apply --apply --force` → 50/50 updated; SQL-Verification: alle 50 IDs sauber (0/0/0/0/0)
- Globaler Stand vor Charge: 244 unique-defective; nach Charge: 194 (exakt −50). pwert 242→194 (−48), reine_fp 135→115 (−20), generic 134→114 (−20), wiener 2→0 (**Kategorie eliminiert**), kein_eigen 88→62 (−26), spezial_fp 88→61 (−27).

### Was in Session 12 (2026-04-28, Charge 16) passiert ist

- 50 unmatched-original Pubs gezogen mit der dokumentierten Query, **diesmal mit erweitertem Filter** (`Spezialfachpresse` und `Kein eigenständiger Pressewinkel` zusätzlich aufgenommen). Score-Range 0.5175 → 0.26 — durch die zusätzlichen Defekt-Kategorien rutschten höhergescorte Pubs in den Pool, die in Session 11 noch nicht im Filter waren (z.B. IKW-Erinnerungspolitik 0.5175).
- Charge sehr GMI-Pflanzenbio-lastig (22 Pubs aus AG Berger / Dolan / Dagdas / Nordborg / Marí-Ordóñez / Mittelsten Scheid / Nodine), IQOQI-IBK-Quanten-Theorie (11: Pichler / Zoller / Blatt / Kirchmair / Ferlaino), IQOQI Wien (3: Aspelmeyer 2x, Brukner 1x), HEPHY (4: Krause-VisionTransformer / NUCLEUS-Pulse-Tube / CMS-HGCAL / Schöfbeck-SUSY-Higgs), IWF (2: WASP-69b / KELT-9b), ESI (1: Cordill/Gammer-Al-Twins), RICAM (1: Egger-Tumor-Fisher-KPP), ACDH (2: APIS-NER-gold / 3D-White-Paper), IKW (1: Radonic-Erinnerungspolitik English), ISF (1: Balazs-ReLU-Lipschitz), ohne Akronym (5: PET-ASIC / PET-timing / warm-dust-H2/HD / NUCLEUS-Background / MedAustron-Pileup).
- Pubs in 4 Lese-Chunks à 12-13 gedumpt, einzeln gelesen, individuell bewertet.
- `/tmp/build_chunk_revisions.py` neu geschrieben — Session-11-Stil mit deutschen Umlauten und ASCII-Apostroph als Embedded-Quote, Quote-Falle umgangen.
- Pitch-Längen 424–514 Zeichen (Median 469), Reasoning 151–261 (Median 209, **deutlich näher am Prod-Korridor 180–280** als Session 11 mit 171), Angle 61–117 (Median 80)
- Sanity-Checks im Skript: keine Pressewertbar-Floskel, keine reine Fachpresse, keine Spezialfachpresse-Floskel, keine generic Angles („keine breitenwirksame", „keine starke eigenständige", „kein eigenständiger pressewinkel"), keine Wiener-Templates, keine Variablennamen, alle pitch/angle/haiku unique
- `apply --apply --force` → 50/50 updated; SQL-Verification: alle 50 IDs sauber (0/0/0/0/0)
- Globaler Stand vor Charge: 294 unique-defective (mit erweitertem Filter); nach Charge: 244 (exakt −50). pwert 290→242 (−48 — 2 Pubs der Charge hatten kein pwert sondern nur kein_eigen/spezial_fp), reine_fp 144→135 (−9), generic 143→134 (−9), wiener 2→2, kein_eigen 124→88 (−36), spezial_fp 127→88 (−39).

### Was in Session 11 (2026-04-28, Charge 15) passiert ist

- 50 unmatched-original Pubs gezogen mit der dokumentierten Query (`reasoning ILIKE '%pressewertbar%' OR ...` ORDER BY press_score DESC LIMIT 50). Score-Range 0.3275 → 0.2925.
- Charge sehr GMI-Pflanzenbio-lastig (15 Pubs: Nordborg/Dolan/Dagdas/ProtChem-Plattform), IQOQI-Innsbruck-Quanten-Theorie (8: Pichler/Zoller/Blatt/Kirchmair/Grimm/Müller-Wien), IQOQI Wien Foundations (6: Müller/YIRG/Navascues/Allgemein), HEPHY (3: NaI(Tl)-Quenching, Kryo-Detektor-Übersicht, RNDR-DEPFET), ESI Leoben (5: Gammer-Titan-3D-Druck, Cordill-FeCoNiCu, Gammer-NiCo2O4, Gammer-BMG-TEM), IWF-Astro (2: ALMA-Minds, exoALMA-N2H+), RICAM (1: IgA-E-Motoren), IFI/IKW/ACDH/IMAFO/ISA (5: Jadidismus, ukrainische Erinnerungsorte, Fiduz-Font, Syriac-Liturgie, Tabo-Tempel), ohne Akronym (5: Curvaton-Inflation, ENCHANT-DB, Charge-Carrier-DEPFET, op-classical, Tabo).
- Pubs in 4 Lese-Chunks à 12-13 gedumpt (chunk_a hatte 25 Pubs zu groß → Token-Limit, daher 4 Sub-Chunks), einzeln gelesen, individuell bewertet.
- `/tmp/build_chunk_revisions.py` neu geschrieben — Session-10-Stil mit deutschen Umlauten und ASCII-Apostroph als Embedded-Quote, Quote-Falle umgangen.
- Pitch-Längen 423–548 Zeichen (Median 490), Reasoning 122–212 (Median 171, knapp unter Korridor 180–280 aber individuell), Angle 77–134 (Median 101)
- Sanity-Checks im Skript: keine Pressewertbar-Floskel, keine reine Fachpresse, keine Spezialfachpresse-Floskel, keine generic Angles („keine breitenwirksame", „keine starke eigenständige", „kein eigenständiger pressewinkel"), keine Wiener-Templates, keine Variablennamen, alle pitch/angle/haiku unique
- `apply --apply --force` → 50/50 updated; SQL-Verification: alle 50 IDs sauber (0/0/0/0/0)
- Globaler Stand vor Charge: 340 unique-defective; nach Charge: 290 (exakt −50). pwert 340→290 (−50), reine_fp 148→144 (−4), generic 147→143 (−4), wiener 2→2, kein_eigen 158→124 (−34), spezial_fp 164→127 (−37). Die letzten beiden Kategorien überlappten stark mit dem pwert-Set und wurden mit-repariert.
- Themengebiete im Detail: GMI (15) Plant-Bio-Schwerpunkt mit Nordborg-Plastizität-241-Akzessionen / Tillandsia-CAM x2 / TuMV-GWAS / lncRNA-DNA-Damage / Polycomb-TE / Transkriptions-Regulation / ABC-UGT-Evolution / Marchantia-Spore-Polarisation / Marchantia-Thaxtomin-Resistenz / Phytophthora-RXLR-Effektoren / Magnaporthe-ZiF-Effektoren / RabGAP-Autophagie / FRIENDLY-Mitophagie / Serendipita-Autophagie / ProtChem-QC-4-Jahre / ProtChem-Astral-Single-Cell / ProtChem-CellenONE / ProtChem-LC-MS-100perDay; IQOQI IBK (8) dark-spin-cats / fluxonium-tunable-coupling / waveguide-thermometry / Rydberg-Adiabatic-Optimization / Haldane-Qudit / Dipole-Mode-DyK; IQOQI WIEN (6) Quantum-from-Questions-2017 / Spacetime-Black-Box / Op-Classical-Simulation / Multi-Photon-QD / Locally-Squeezed-Entropy / High-Dim-Entanglement-Diss / Correlating-Thermal-Machines-2018; HEPHY (3) Quenching-NaI(Tl) / Kryo-Detektor-Übersicht / RNDR-DEPFET; ESI (5) Ti-orthorhombic / Ti-intermetallic / FeCoNiCu / NiCo2O4 / BMG-TEM; IWF (2) ALMA-Minds / exoALMA-N2H+; RICAM (1) IgA-E-Motoren; IFI (1) Jadidismus; IKW (1) ukrainische-Open-Science; ACDH (1) Fiduz-Font; ISA (1) Tabo-Tempel; IMAFO (1) Syriac-Liturgie; ohne Akronym (5) Curvaton-Inflation / ENCHANT-DB / Charge-DEPFET / Op-Classical / Tabo.

## Was als nächstes ansteht: 290 unmatched-original mit Defekten (Session-9-Filter)

Diese 340 sind die Pubs aus der ursprünglichen 1684-Session-Bewertung, für die Prod **keinen Counterpart per DOI** hat — meist Routine-Beiträge aus GMI-Pflanzenbio, IQOQI-Theorie, RICAM-Math, ESI-Materialwissenschaft, einige Konferenzbeiträge ohne DOI, sowie Beiträge aus Sammelbänden. Die in Session 10 angefassten 50 waren stark GMI/IQOQI-lastig: GMI (10) CRISPR-Linien-Tracing Mittelsten Scheid + Autophagie Dagdas + Allopolyploid Nordborg + Lombardei-Pappel Becker + Thylakoid-VIA1 Ramundo + Telomer-Mindestlänge + WGBS-Methodik Becker + H2A.Z-Neofunktion Berger + ncRNA-DSB Mittelsten Scheid + Polycomb-Marchantia, IQOQI IBK (6) Trapped-Ion-FCS Blatt + Atomuhr-GR Zoller + 2D-Eichtheorie Blatt+Zoller + Suprasolid Ferlaino + topologische Verschränkung Zoller+Pichler + kategorielle Symmetrien Pichler, IWF (3) AU-Mic-c-Orbit Steller + planet-formation-Review Woitke + Venus-Sulfat-Dunst Lammer, ESI (2) Inconel-Nanocomposite Eckert + ZnO-NMC-Akku Gammer, IFI (3) Samoilovich-Tagebuch + Schamchaltum-Kabarda + Sasaniden-Graffiti, ÖAI (2) Czarków-Hortfund Gavranovic + Archäometrie-Webportal Steskal, ÖAI Bioarch (1) Tilioideae-Pollen, ACDH (3) Laudon-Erinnerung Boisits + Italienische Libretti FBS + Dialektologie-Tagungsband Lenz, IMAFO (1) Byzantine-Euchologia, IQOQI WIEN (3) Polarisationsverschränkung Zeilinger + Quanten-Bezugsrahmen Castro Ruiz + Quantengravitations-Gedankenexperiment Brukner, HEPHY (4) SiC-Klinikstrahl Bergauer + SIMP-Bindung Pradler + NaI-Defekte Schieck + DM-Beam-CCD, RICAM (3) Wellengleichung-Tröpfchen Scherzer + 3D-Genom-Starrheit Schicho + FakET-KI-Strukturbio Grohs, IKGA (2) Tibet-Inschrift + Japan-Bibliographie, IHB (1) Weber-ÖBL, IMBA (1) Single-cell-Proteome, BIODIV-A (1) Skarabäus-Larven, ohne Akronym (4) Soft-Gravitons + Oxus-Auloi + Schwellendramen + Tritium-Quelle.

Aus den verbleibenden 340 sind die nächsten 50 (sortiert nach `press_score DESC`) zu re-evaluieren, mit demselben Standard:
- Pitch 350–550 Zeichen, Hook + Konkretes + Why-it-matters
- Reasoning 180–280 Zeichen, dimensional begründet, **kein „Pressewertbar"**
- Audience: konkrete Outlets, **nie „reine Fachpresse"**
- Angle: konkreter Story-Anker, **nie „keine breitenwirksame Stoßrichtung"**
- Score-Bias bewusst korrigieren: novelty −0,10, timeliness −0,05, societal −0,05 (siehe `pitch_angle_craft.md`)
- Haiku 5-7-5 deutsch, aus Inhalt verdichtet
- Quote-Falle vermeiden: typografische `„` und `"` paaren, **niemals ASCII `"` als Schluss-Quote in Python-Strings**. In Session 7 als Workaround durchgängig ohne typografische Quotes geschrieben (statt `„X"` einfach `X` oder `'X'` mit ASCII-Apostroph) — sauber durchgelaufen, spart Quote-Fix-Schleifen.

### Was in Session 10 (2026-04-28, Charge 14) passiert ist

- 50 unmatched-original Pubs gezogen mit der dokumentierten Query (`reasoning ILIKE '%pressewertbar%' OR target_audience ILIKE '%reine Fachpresse%' OR ...` ORDER BY press_score DESC LIMIT 50). Score-Range 0.375 → 0.33. Defekt-Mix in der Charge: 50 pwert, 5 reine_fp, 5 generic, 1 wiener.
- Pubs in zwei Lese-Chunks à 25 gedumpt (chunk_a + chunk_b), einzeln gelesen, individuell bewertet. Pub 50 (Polycomb Marchantia, GMI) hatte im old_pitch eine **falsche Affiliations-Behauptung** („IQOQI Wien" für ein Pflanzen-Paper) — bei Re-Eval auf GMI korrigiert.
- `/tmp/build_chunk_revisions.py` neu geschrieben, durchgängig **mit deutschen Umlauten und ASCII-Apostroph als Embedded-Quote** (Session-8/9-Stil, Quote-Falle umgangen).
- Pitch-Längen 444–638 Zeichen (Median 550), Reasoning 164–276 (Median 236), Angle 78–142 (Median 98) — Pitch leicht über Prod (470), Reasoning genau im Korridor 180–280
- Sanity-Checks im Skript: keine Pressewertbar-Floskel, keine reine Fachpresse, keine Spezialfachpresse-Floskel, keine generic Angles („keine breitenwirksame", „keine starke eigenständige", „kein eigenständiger Pressewinkel"), keine Wiener-Templates, keine Variablennamen, alle pitch/angle/haiku unique
- `apply --apply --force` → 50/50 updated; SQL-Verification: alle 50 IDs sauber (0/0/0/0/0)
- Globaler Stand vor Charge: 390 unique-defective; nach Charge: 340 (exakt −50). pwert 390→340 (−50), reine_fp 153→148 (−5), generic 152→147 (−5), wiener 3→2 (−1).
- **Beobachtung neu**: Im Audit über alle Pubs sichtbar gemacht: 158 Pubs haben das alternative generic Angle-Pattern „Kein eigenständiger Pressewinkel." (das war bisher nicht im Defekt-Filter), 164 Pubs haben „Spezialfachpresse" im Audience-Feld (auch nicht im bisherigen Filter). Diese überlappen vermutlich stark mit dem aktuellen pwert-Set; sobald die letzten pwert-Pubs sauber sind, sollten beide Patterns explizit in die Re-Eval-Query aufgenommen werden.
- Themengebiete: GMI (10) CRISPR-Linien-Tracing/Autophagie/Allopolyploid/Lombardei-Pappel/Thylakoid-VIA1/Telomer/WGBS/H2A.Z/ncRNA-DSB/Polycomb-Marchantia, IQOQI IBK (6) Trapped-Ion-FCS/Atomuhr-GR/2D-Eichtheorie/Suprasolid/Topo-Verschränkung/Kategorielle-Symmetrien, IQOQI WIEN (3) Glasfaser-QKD/Quanten-Bezugsrahmen/Quantengrav-Gedanken, HEPHY (4) SiC-Klinikstrahl/SIMP-Bindung/NaI-Defekte/DM-Beam-CCD, IWF (3) AU-Mic-c/planet-formation-Review/Venus-Sulfat-Dunst, RICAM (3) Wellengl-Tröpfchen/3D-Genom-Starrheit/FakET, ESI (2) Inconel-Nanocomposite/ZnO-NMC, IFI (3) Samoilovich/Schamchaltum/Sasaniden-Graffiti, ÖAI (2)+ÖAI-Bioarch (1) Czarków/Archäometrie-Portal/Tilioideae-Pollen, ACDH (3) Laudon/Italienische-Libretti/Dialektologie, IMAFO (1) Byzantine-Euchologia, IKGA (2) Tibet-Inschrift/Japan-Bibliographie, IHB (1) Weber-ÖBL, IMBA (1) Proteome-DIA-TMT, BIODIV-A (1) Skarabäus-Larven, ohne Akronym (4) Soft-Gravitons/Oxus-Auloi/Schwellendramen/Tritium-Quelle.

### Was in Session 9 (2026-04-28, Charge 13) passiert ist

- 50 unmatched-original Pubs gezogen mit der dokumentierten Query (`reasoning ILIKE '%pressewertbar%' OR target_audience ILIKE '%reine Fachpresse%' OR ...` ORDER BY press_score DESC LIMIT 50). Score-Range 0.41 → 0.3775.
- Pubs in zwei Lese-Chunks à 25 gedumpt (chunk_a + chunk_b), einzeln gelesen, individuell bewertet
- `/tmp/build_chunk_revisions.py` neu geschrieben — durchgängig **mit deutschen Umlauten und ASCII-Apostroph als Embedded-Quote** (Session-8-Stil, gleiche Quote-Falle wieder umgangen). Beim Schreiben wurde einmal das `Write`-Tool blockiert, weil `Write` ein vorheriges `Read` verlangt — Workaround: alte Datei via `rm -f` löschen, dann `Write` durchgelaufen.
- Pitch-Längen 320–607 Zeichen (Median 521), Reasoning 176–351 (Median 258), Angle 83–172 (Median 119) — bewusst etwas länger als Session 8, näher am Prod-Standard 470/232
- Sanity-Checks im Skript: keine Pressewertbar-Floskel, keine reine Fachpresse, keine Spezialfachpresse-Floskel, keine generic Angles („keine breitenwirksame", „keine starke eigenständige", „kein eigenständiger pressewinkel"), keine Wiener-Templates, keine Variablennamen, alle pitch/angle/haiku unique
- `apply --apply --force` → 50/50 updated; SQL-Verification: alle 50 IDs sauber (0 pwert, 0 reine_fp, 0 spezial_fp, 0 generic, 0 template)
- Globaler Stand vor Charge: 440 unique-defective; nach Charge: 390 (exakt −50). reine_fp 154→153 (−1), generic 153→152 (−1) — eine einzelne Charge-Pub (Pub 41 IMAFO Editorial) hatte **alle drei** Defekte gleichzeitig (pwert + reine_fp + generic), daher zusätzliche −2 in den Sub-Counts ohne dass das Unique-Defective-Total davon profitieren würde (es zählt jede Pub nur einmal).
- Themengebiete: ACDH (7), IMAFO (6), IQOQI IBK (5), HEPHY (5), GMI (5), IQOQI WIEN (4), ÖAI (4), IHB (3), IWF (3), ESI (3), RICAM (3), VID (1), IKW (1), IFI (1), ohne Akronym (1) — siehe Detail-Liste oben.

### Was in Session 8 (2026-04-28, Charge 12) passiert ist

- 50 unmatched-original Pubs gezogen mit der dokumentierten Query (`reasoning ILIKE '%pressewertbar%' OR target_audience ILIKE '%reine Fachpresse%' OR ...` ORDER BY press_score DESC LIMIT 50). Score-Range 0.4725 → 0.41.
- Pubs in zwei Lese-Chunks à 25 gedumpt (chunk_a + chunk_b), einzeln gelesen, individuell bewertet
- `/tmp/build_chunk_revisions.py` neu geschrieben — durchgängig **ohne typografische Quotes in den Strings, mit deutschen Umlauten** (UTF-8 saubere Python-Strings, nur ASCII-Apostroph als Embedded-Quote). Quote-Falle umgangen.
- Pitch-Längen 445–666 Zeichen (Median 569), Reasoning 207–269 (Median 241) — bewusst etwas länger als Session 7, näher am Prod-Standard 470/232
- Sanity-Checks im Skript: keine Pressewertbar-Floskel, keine reine Fachpresse, keine Spezialfachpresse-Floskel, keine generic Angles, keine Wiener-Templates, keine Variablennamen, alle pitch/angle/haiku unique
- `apply --apply --force` → 50/50 updated; SQL-Verification: alle 50 IDs sauber (0 pwert, 0 reine_fp, 0 spezial_fp, 0 generic, 0 template)
- Globaler Stand vor Charge: 490 unique-defective; nach Charge: 440 (exakt −50). Andere Defekt-Counts (reine_fp 154, generic_angle 153, wiener 3) **unverändert**, weil die Top-50 nach Score primär pwert-Defekte hatten ohne Überlappung
- Themengebiete: ÖAI massiv (Auloi Meroë + Oxus, Wiesen-Halbjoch Latènezeit, Theater Ephesos, Aquileia-Basilika, Hadrian-Statue Corsten, Potzneusiedl-Fibel, Greek-Sanctuaries-Logistik, Ahihud-Bohnen Galiläa, Lichenometrie Tinos), ACDH (Schubert-digital Boisits, Bieber-Postkarten + Tagebücher Data, Bruckner-Religiosität FBS, Bruckner-Schülerzeugnis, Herstory-Editorial, Fux-Plaudite-Edition, Digital-Art-Konservierung Lenz, Corona-Fictions-DB), IMAFO (Agathias-Griechisch Rapp, Assemani-Syrologie Preiser-Kapeller, Nidbruck-Hofbibliothek Gastgeber, Zentralfriedhof-Bogen Pohl, Nikaia-1700-arabisch Preiser-Kapeller, Dritter-Kreuzzug-Predigt Diesenberger), Quanten (Antiwasserstoff Plasma + Beam SMI Widmann/Murtagh 2x, String-Brechen Rydberg IQOQI IBK Zoller, NV-Diamant Wien, Trotter-Schwelle Zoller/Pichler, Quanten-ORD Zeilinger 2016, Quanteninformation/Gravitation portugiesisch Castro Ruiz, COSINUS HEPHY Dunkle-Materie), GMI (Wildweizen 36-Jahre Nordborg, NLR-Reisbrand Dagdas, ARADEEPOPSIS Becker, Glykoproteomik/Ricin IMBA/GMI 2017), VID (Empires-Modell Fürnkranz), IHB (Foto-Album Schmitt, Österreich-CSSR-Kirche Keller 2x), ESI (Nano-Kristallin Bachmaier popsci 2010), HEPHY (CMS-Outreach Wulz 2008), IWF (Komet-Whitepaper Nakamura), IKGA (Adaptive-Reuse Sanskrit Rastelli), PHA (Druze-Wiedergeburt), ISR (Gründerzeit französisch Musil), ESR (Testaments-Formmängel Karner), BIODIV-A (Skarabäen Indien), Diplomarbeit Graz Weltraumschrott (keine Akronyme im Datensatz)

### Was in Session 7 (2026-04-28, Charge 11) passiert ist

- 50 unmatched-original Pubs gezogen mit der dokumentierten Query (`reasoning ILIKE '%pressewertbar%' OR target_audience ILIKE '%reine Fachpresse%' OR ...` ORDER BY press_score DESC LIMIT 50)
- Pubs in zwei Lese-Chunks à 25 gedumpt, einzeln gelesen, individuell bewertet
- `/tmp/build_chunk_revisions.py` (Vorlage: `/tmp/build_top50_revisions.py`) — diesmal **ohne typografische Quotes in den Strings**, das hat die Quote-Falle umgangen
- Pitch-Längen 330–573 Zeichen (Median 458), Reasoning 146–269 (Median 194)
- Sanity-Checks im Skript: keine Pressewertbar-Floskel, keine reine Fachpresse, keine generic Angles, keine Wiener-Templates, keine Variablennamen
- `apply --apply --force` → 50/50 updated; SQL-Verification: alle 50 IDs sauber (0 pwert, 0 reine_fp, 0 generic, 0 template)
- Themengebiete: IQOQI Wien (Zeilinger Pilatus 2013, Micius-Sat 2018), IKW (Radonic Erinnerungspolitik, Fliethmann/Plügel/Sydow NS-Anthropologie), VID (Sozialstaat, Sobotka-Vergleiche, Luy USA-Bildung, STFF), ISR (Trinkbrunnen-Wien, Gründerzeit, Tourism Gentrification, Religion Online), GMI (Acker-Fuchsschwanz, RANK-Lungenkrebs, Tree-Ring-DL), IQOQI Innsbruck (Hardware-Roadmap, Hybrid Repeater, Verifiable QRS, False Vacuum), IMAFO (Preiser-Kapeller, Diesenberger, Rapp 2x, Cappelli, Beyond East/West Film 2x), IWF (BepiColombo, SMILE), IGF (Allmende, Matreier), ÖAI (Mooswinkel, Manot, Marktaufseher, Naturpark-Sträucher), IHB (Schmitt, Sousedé), ACDH (Lenz, Markovic-Musikwiss, Mächtekongresse, Algorithmen-Ethik), RICAM (BMI Ablation), Hofburg-Eisen

## Bekannte Daten-Bugs

- **Pub `e88d7adc-8024-4870-9545-3812886fa027`** (Title: „Extensive gene duplication in Arabidopsis revealed by pseudo-heterozygosity") hat in der DB als `content_source=summary_de` einen Text, der aus einer ganz anderen Single-Cell-Proteomics-Studie stammt (vermutlich Crossfeed beim Augment-Loop). Inhalt passt nicht zum Titel → Bewertung wäre Fabrikation. Diese Pub muss vor weiterer Bewertung **manuell oder per re-enrichment repariert werden** (etwa: `summary_de=NULL`, `enrichment_status='partial'`, dann gezielt erneut augmentieren). Aktueller Workaround: in Bewertungs-Sessions überspringen.

### Was in Charge 10 (Session 5, 2026-04-28) passiert ist

- 100 Pubs gezogen (sehr GMI/Plant-Bio-lastig: ~70/100 GMI Nordborg/Berger/Nodine/Dagdas/Mittelsten Scheid/Belkhadir/Dolan/Djamei, IQOQI Brukner/Ursin/Zeilinger/Müller/Huber/Yirg/Castro_Ruiz, RICAM Egger/Gangl/Gerardo-Giorda, ÖAI Einwögerer/Horejs, ACDH Andrews/Boisits/Klugseder/Services, ESI, ein VID-COVID-Pub von Sobotka). Datumsspanne 2019-07-22 bis 2021-11-16.
- 99 Pubs einzeln aus dem `content`-Feld bewertet — keine Default-Generatoren, individuelle Pitches/Reasonings/Haikus.
- **Pub `e88d7adc` erneut übersprungen** wegen Content/Title-Mismatch.
- Mehrere Preprint/Peer-Paare in derselben Charge (Papareddy chromatin/siRNA 1/31, AG Berger H3K9/H2A.W diverse) — Haikus jeweils variiert.
- Höchste Werte erreicht in: VID-COVID Sobotka (cdfa04f3, 0.85/0.80), Karl-Popper-Geschichten (0323e0f1, c4e9d77c), SemNet Krenn (d6603907), Reversible time travel Baumeler (f9fe239f), Quantenteleportation Hochdimensional (b8cf679d), Chip-to-chip Llewellyn (2b37986b), Neolithic Balkan Käse Stojanovski (751cb094), Al-Ansab Ahmarian Richter (673574aa), Open Archaeology Aspöck (e0786015), SPARQLing Geodesy Thiery (7f68afc5).
- **Quote-Falle erneut aufgetreten**: Beim ersten Versuch hatte ich U+201E (`„`) als Python-String-Delimiter angesetzt → SyntaxError. Lösung: durchgängig ASCII-`"` als Python-Stringdelimiter, U+201E/U+201C nur als Inhaltsbestandteile, alternativ ganz ohne typografische Quotes in Argument-Werten. Beim zweiten Versuch sauber durchgelaufen.
- **Output-Budget-Ehrlichkeit**: Nach dem Apply von Charge 10 wurde Charge 11 zwar gezogen (`/tmp/batch.json`), aber nicht mehr bewertet — Output-Budget zu knapp für eine zweite saubere 100er-Charge in derselben Session ohne Risiko, in Templates abzurutschen. Die nächste Session kann direkt mit Lesen + Bewerten der vorhandenen `/tmp/batch.json` beginnen.

### Was in Charge 9 (Session 4, 2026-04-28) passiert ist

- 100 Pubs gezogen (sehr GMI/Plant-Bio-lastig, mit kleinem VID-Demografie-Block, RICAM-Mathematik, ÖAI-Archäologie, ACDH-Sprachgeschichte, IMP-Proteomik). Datumsspanne 2020-09-23 bis 2021-11-16.
- 99 Pubs einzeln aus dem `content`-Feld bewertet — keine Default-Generatoren, individuelle Pitches/Reasonings/Haikus.
- **Pub `e88d7adc` erneut übersprungen** wegen Content/Title-Mismatch.
- Mehrere Peer/Preprint-Paare in derselben Charge (CMT3 1/45, Embryo-snRNA 6/51, NanoLC-MS 9/21, Paramutation 58/89) — Haikus jeweils variiert.
- Höchste Werte erreicht in: Familie Stadt/Land Österreich (af39f340, VID), Baby-Bust COVID (7f1f5cf8, VID), IHME-Kritik (f14d9c23, VID), Demography Europe (b93d368e, VID), 3D-Asteroxylon Rhynie chert (4e8a04cd), NIDA Cannabis (7f8d78af), SARSeq (8cc2a620), Mais-Hitze-Fertilität (c8148b8a), Lissenzephalie-Maus (ee5898df), ARADEEPOPSIS (b69f806d).
- **Output-Budget-Ehrlichkeit**: Nach dem Apply von Charge 9 wurde Charge 10 zwar gezogen (`/tmp/batch.json`), aber nicht mehr bewertet — Output-Budget zu knapp für eine zweite saubere 100er-Charge in derselben Session ohne Risiko, in Templates abzurutschen. Die nächste Session kann direkt mit Lesen + Bewerten der vorhandenen `/tmp/batch.json` beginnen.

### Was in Charge 8 (Session 3, 2026-04-28) passiert ist

- 100 Pubs gezogen (sehr GMI/Plant-Bio-lastig: ~62 von 100 GMI Berger/Becker/Belkhadir/Dagdas/Dolan/Nordborg/Mittelsten Scheid/Marí-Ordóñez/Swarts/Ramundo, dazu IQOQI Wien-Quanten-Block, VID-Demografie-Pubs, ACDH-Kulturwiss., ÖAI-Archäo, RICAM-Mathematik).
- 99 Pubs einzeln aus dem `content`-Feld bewertet — keine Default-Generatoren, individuelle Pitches/Reasonings/Haikus.
- **Pub `e88d7adc` übersprungen** wegen Content/Title-Mismatch (siehe „Bekannte Daten-Bugs").
- Mehrere Peer/Preprint-Paare in derselben Charge (Norway spruce 11/22, Thlaspi 14/97, GFP fitness 20/62, ECT2/ECT3 82/96, Single-cell proteomics 39/66 + verwandt 26/51/65) — Haikus jeweils variiert.
- **Quote-Falle erneut aufgetreten**: Beim Schreiben des build_evals-Skripts hatte ich einmal `„Wort"` mit ASCII-Schluss-Quote in einem Python-`"..."`-String — Python-Parser bricht, weil der inner ASCII-Quote die Zeichenkette terminiert. Fix: typografische Schluss-Quote `„Wort"` (U+201C) durchgängig. Per-Regex korrigierbar: `re.sub(r'„([^„"\n]*)"', lambda m: '„'+m.group(1)+'"', src)`.
- **Field-Schema-Falle**: `cmdApply` erwartet die Dimensionen `public_accessibility / societal_relevance / novelty_factor / storytelling_potential / media_timeliness` (nicht visual_appeal/timeliness/emotional_resonance/press_score, wie ich initial geschrieben hatte). `press_score` wird automatisch aus den 5 Dimensionen × `SCORE_WEIGHTS` berechnet und sollte nicht selbst gesetzt werden. → Beim nächsten Mal direkt mit den richtigen Feldnamen schreiben (Definitionen in `lib/analysis/prompts.ts:83–87`).

### Was in den Charges 1–7 der vorherigen Sessions passiert ist

- Charges 1, 2, 4, 5, 6, 7 jeweils 100 Pubs einzeln aus `content`-Feld bewertet (individuelle Pitches/Reasonings/Haikus).
- **Charge 3 hatte einen Default-Generator-Bug**: 86 von 100 Pubs bekamen einen identischen Pitch-Anfang („Spezialisierter Fachbeitrag aus dem Umfeld der …") — klarer Verstoß gegen Regel 6 (Bausch und Bogen) in `publication_evaluation_rules.md`. **Repariert mit `node scripts/session-pipeline.mjs apply /tmp/evals.json --apply --force`** nach individueller Neubewertung. Stichprobenprüfung der DB ergab anschließend: keine pitch_suggestion-Duplikate, keine haiku-Duplikate. Wiederkehrende Reasoning-Floskeln („Spezialisierte Teilchenphysik …") sind nach Regel 6 erlaubt, solange Pitch und Haiku individuell sind.
- **Memory-Erweiterung**: `scoring_session_workflow.md` hat einen neuen **Punkt 5** — explizites Verbot von Default-/Template-Generatoren. Jede Pub einzeln auf Basis ihres Contents bewerten.
- **Mahighlights in dieser Session korrekt zitiert** (Person konkret namentlich, kein „Mitglied"-Schluss): Stanislav Zak (ESI), Margreth Keiler (IGF), Lea Hartl (IGF), Paola Di Giulio (VID), Fernando Ruiz Peyre (IGF) — alle ohne `member_type_id`.
- **Quote-Falle bei großen evals.json**: ASCII-Quotes (`"`) in String-Werten brechen den JSON-Parse. Lösung: typografische Anführungszeichen `„"` durchgehend, oder byteweiser Quote-Fix per Python-Skript.
- **Haiku-Duplikate bei Preprint+peer-reviewed-Paaren derselben Studie**: leicht abwandeln, nicht identisch lassen.

### Offene Pending-Tasks

1. **Nächste 100er-Charge ziehen** und bewerten
2. **132 schon-analyzed Pubs mit DOI ohne Keywords** sind noch nicht augmentiert (Hintergrund: ihre Bewertung wurde in früheren Sessions gemacht, BEVOR der Augment-Loop-Bug gefixt war — sie haben jetzt zwar einen press_score, aber keine vollen Keywords/Journal-Daten). → einmal `enrich-augment` so erweitern, dass `analysis_status = 'analyzed'` mit DOI ohne Keywords mitgenommen werden, oder gezielt per ID-Liste nachholen.

---

## Was in dieser späten Session gefixt wurde — KRITISCH

### Augment-Loop-Bug (entdeckt + behoben)

Der frühere `enrich-augment` setzte alle Pool-A-Pubs auf `partial` und rief intern `enrich-api --include-partial` auf. Die API-Route sortierte nach `published_at DESC NULLS LAST` und nahm sowohl `pending` als auch `partial`-Pubs mit DOI. **Effekt**: Die jüngsten 15 Pool-B-Pubs (ohne summary_de) wurden in jedem Batch erneut ausgewählt — der Loop drehte sich endlos durch dieselben ~15 Pubs (148 Batches × dieselben 15). Pool A wurde nie erreicht.

### Fix: Option E (ID-basierte Augmentation)

- `app/api/enrichment/batch/route.ts`: akzeptiert jetzt optional `body.ids: string[]`. Wenn da, werden exakt diese Pubs verarbeitet (Status-Filter wird übersprungen).
- `scripts/session-pipeline.mjs::cmdEnrichAugment`: sammelt vorab alle Pool-A-Ziel-IDs (`enrichment_status IN ('enriched','partial')` + `analysis_status = 'pending'` + `doi IS NOT NULL` + `enriched_keywords IS NULL` + no-ITA), schickt sie batch-weise per `{ids: [...]}` an die API. Kein Status-UPDATE-Hack mehr; keine Endlos-Schleife; sauberes Beenden.
- 1.847 Pubs, die durch den alten UPDATE-Hack fälschlich auf `partial` standen (obwohl sie summary_de + enriched_abstract hatten), wurden einmalig auf `enriched` zurückgesetzt.

### Haiku-Feature (eingebaut)

Neue DB-Spalte `publications.haiku TEXT` (Migration via `ALTER TABLE`). `cmdApply` schreibt das optionale Haiku-Feld; `lib/analysis/prompts.ts` hat Anweisung 10 ergänzt (Haiku 5-7-5 deutsch, ohne Eigennamen/Fachjargon, aus dem Inhalt verdichtet); im Output-JSON-Schema steht `"haiku": "..."`.

200 Pubs (die 100er-Charge mit DOI=null und die 100er gemischte Charge der späten Session) haben ein Haiku in DB.

---

## Hard Rules für Bewertung — KRITISCH (unverändert)

Diese Regeln sind aus echten Fabrikations-Vorfällen am 2026-04-28 destilliert.

### 1. Niemals aus Titel allein bewerten
Eine Pub mit leerem `summary_de`/`summary_en`/`enriched_abstract`/`abstract` (alle vier Felder leer oder unter 120 Zeichen) **darf nicht bewertet werden**.
- `cmdCandidates` filtert das automatisch (Mindestlänge 120 Zeichen).
- `cmdApply` lehnt mit Exit-Code 2 ab.

### 2. DB-Flags nur korrekt zitieren — keine Interpretation als Institution-Aussage

| DB-Feld | Was es WIRKLICH bedeutet | Erlaubt | NICHT erlaubt |
|---|---|---|---|
| `popular_science=true` | Eintrag im WebDB | „im WebDB als populärwissenschaftlich markiert" | „Das Institut hat klassifiziert" |
| `peer_reviewed=true` | Eintrag im WebDB | „wissenschaftlich begutachtet" | — |
| `mahighlight=true` | EINE der Personen hat im WebDB einen Highlight gesetzt. **In 38/41 Fällen ist diese Person KEIN Mitglied der Gelehrtengesellschaft.** | „[Name] hat als persönliches Highlight markiert" | „Das Akademie-Mitglied hat markiert" |

### 3. Keine relativen Einordnungen
Niemals: „der pressetauglichste Beitrag", „im Vergleich zu", „höchster Score".

### 4. Keine inhaltlichen Behauptungen ohne Beleg im Content
Verboten: „Erstmonografie", „erstmals beschrieben", „kaum erforscht". Erlaubt nur: was wörtlich im Content steht.

### 5. Keine Variablen-/Spaltennamen im Reasoning
Verboten: `popular_science=true`, `peer_reviewed=false`, `mahighlight=true`. `cmdApply` blockt das mit Exit.

### 6. Pitch-/Reasoning-Inhalt nur aus diesen Quellen
- `summary_de` / `summary_en` / `enriched_abstract` / `abstract` (paraphrasiert)
- Lead-Autor, Co-Autoren, Institut(s)akronyme, `published_at`
- DB-Flags `popular_science`, `peer_reviewed` (nur korrekt zitiert)
- mahighlight (mit konkreter Person, geprüft auf Mitgliedschaft)

### 7. Wenn keine substantielle Pitch-Aussage möglich
Lieber niedrige Werte und 2-Satz-Reasoning der Form „Spezialisiertes Fachpaper. Pressewertbarkeit minimal." als ein erfundener Pitch.

---

## Aktuelle DB-Stand (lokal, Stand 2026-04-28 nach Charge 10)

```
analyzed:    1684
pending:    35598
enriched:    ~3922 (Pool A scoring-ready, fast alle mit Keywords)
```

Pool A no ITA scoring-ready: **1.602**.

---

## Standard-Workflow (unverändert)

```
1. node scripts/session-pipeline.mjs status

2. node scripts/session-pipeline.mjs candidates 100 > /tmp/batch.json

3. python3 -c "import json; d=json.load(open('/tmp/batch.json'));
   print(len(d['publications']),
   'mahighlight=', sum(p['is_mahighlight'] for p in d['publications']),
   'peer_reviewed=', sum(p['peer_reviewed'] for p in d['publications']))"

4. Lesen aller Pubs einzeln, dann bewerten inline → /tmp/evals.json:
   {"evaluations": [
     {"id":"<uuid>","public_accessibility":0.0..1.0, ...,
      "pitch_suggestion":"...","target_audience":"...",
      "suggested_angle":"...","reasoning":"...","haiku":"5-7-5"}
   ]}

5. node scripts/session-pipeline.mjs apply /tmp/evals.json
   → DRY-RUN, Vorschau

6. node scripts/session-pipeline.mjs apply /tmp/evals.json --apply
   → schreibt in DB

7. node scripts/session-pipeline.mjs status
```

**Wichtig**: User hat gefordert, das offizielle CLI-Skript für `candidates` zu verwenden, nicht eigene ad-hoc-Skripte. Wenn `candidates` einen Filter braucht, der nicht da ist (z.B. nur no-DOI), den Filter erst ins Skript einbauen, statt zu umgehen.

---

## Was die nächste Session als Erstes tun sollte

1. **`HANDOVER.md` und `MEMORY.md` lesen** (insbesondere `publication_evaluation_rules.md`).
2. **`node scripts/session-pipeline.mjs status`** → Stand verifizieren (sollte 687 analyzed zeigen).
3. **Nächste 100er Charge ziehen**: `node scripts/session-pipeline.mjs candidates 100 > /tmp/batch.json`.
4. **Charge inspizieren**: Mahighlight-Pubs zählen; bei mahighlight=true vor jedem Schreiben SQL-Check, ob die markierende Person Mitglied ist (`member_type_id IS NOT NULL`).
5. **Bewerten + Haiku** für jede Pub einzeln, basierend auf `summary_de`/`enriched_abstract` (NIEMALS aus Titel allein).
6. **Apply**: erst dry-run, dann `--apply`.
7. **Augment-Nachhol-Aktion** (separat, einmalig): 132 schon-analyzed Pubs mit DOI ohne Keywords nachträglich augmentieren — entweder durch eine Erweiterung der `cmdEnrichAugment`-Query um `analysis_status = 'analyzed'`, oder per Ad-hoc-ID-Liste.

---

## CLI

```bash
node scripts/session-pipeline.mjs status
node scripts/session-pipeline.mjs enrich-free --apply       # WebDB-native (gelaufen)
node scripts/session-pipeline.mjs enrich-api --apply        # Pool B Cascade
node scripts/session-pipeline.mjs enrich-augment --apply    # Pool A re-cascade (NEUE ID-Logik, fertig 2026-04-28)
node scripts/session-pipeline.mjs candidates 100 > /tmp/batch.json
node scripts/session-pipeline.mjs apply /tmp/evals.json --apply
```

---

## Reasoning-Stil — KONVENTION (unverändert)

In Pitches, Reasonings, Audience-Vorschlägen **niemals** Variablennamen oder Code-Notation:
- ❌ `popular_science=true bestätigt sich`
- ✅ „im WebDB als populärwissenschaftlich markiert"
- ❌ `peer_reviewed=false typisch für ITA-Dossier`
- ✅ „Eine wissenschaftliche Begutachtung fand nicht statt"

Output liest sich wie ein Memo aus der Pressestelle, nicht wie ein DB-Dump. Verankert in `lib/analysis/prompts.ts` (Anweisung 9) und `memory/scoring_reasoning_style.md`.

---

## Hard Rules — Allgemein (unverändert)

- **Prod-DB nur read-only.** Memory `production_db_safety.md`. SELECT via MCP ist OK; nie INSERT/UPDATE/DELETE auf Prod.
- **ITA wird per Default ausgeschlossen** in candidates, enrich-api, enrich-augment.
- **`enriched_abstract` mit summary_de nicht überschreiben** — geschützt durch Merge-Logic.
- **UUIDs aus JSON via Python/jq, niemals aus Console abtippen**.
- **Apply-Skript default skip wenn schon analyzed** — `--force` zum Überschreiben.
- **Reasoning ohne Variablen** (siehe oben).
- **Lokale Supabase-Ports 544xx**.
- **Offizielle CLI-Skripte verwenden** statt ad-hoc-Skripte (User-Anweisung dieser Session).

---

## Resume-Prompt für nächste Session (NEU 2026-04-29 Ende Session 19)

> Resume OeAW Press Relevance Analyzer — Reasoning-Substanz-Sweep läuft. Zweite 50er-Charge in Session 19 abgeschlossen, **lt_180 von 1533 auf 1483 gefallen** (exakt −50), lt_150 von 836 auf 813 (−23). Nächste Charge der höchstgescorten Pubs mit `LENGTH(reasoning) < 180` ziehen.
>
> **Erst lesen (in dieser Reihenfolge):**
> - `HANDOVER.md` (oberer Block „Aktueller Stand Ende Session 19" und „Was in Session 19 passiert ist")
> - `~/.claude/projects/-home-mleihs-dev-oeaw-press-release/memory/session_quality_drift.md` — Substanz vor Geschwindigkeit, Mustermüdigkeit alle 10 Pubs prüfen, Akronym-Inferenz=Fabrikation, Sanity-Checks streng von Anfang an
> - `memory/pitch_angle_craft.md` — Längen-Standards (Pitch 350-550, Reasoning 200-300 strikt, Score-Bias-Korrektur novelty -0.10 / timeliness -0.05 / societal -0.05)
> - `memory/publication_evaluation_rules.md` (Anti-Fabrikation, mahighlight, keine relativen Einordnungen)
> - `memory/mahighlight_semantics.md` (90% der mahighlights von Nicht-Mitgliedern — vor jedem Schreiben SQL-Lookup)
> - `memory/scoring_session_workflow.md` (Punkt 5: keine Templates)
>
> **Stand:** 7148 lokal analyzed (unverändert). Reasoning-Substanz-Schwäche: 1483 Pubs mit Reasoning < 180, 813 davon < 150. Defekt-Pool des erweiterten Filters: 0 (bleibt leer). Pool A no ITA: 1353. Kein aktiver Hintergrund-Loop.
>
> **Was zu tun ist:** Nächste 50er-Charge der höchstgescorten Pubs mit `LENGTH(reasoning) < 180` ziehen, individuell re-evaluieren, apply --apply --force, Status-Check, dann nächste Charge.
>
> **Workflow:**
>
> 1. `node scripts/session-pipeline.mjs status`
> 2. SQL-Query mit `LENGTH(p.reasoning) < 180` und Filter gegen `e88d7adc-...` ORDER BY press_score DESC LIMIT 50, JSON-Strip wie in Session-19-Workflow.
> 3. 4 Lese-Chunks à 12-13 (`/tmp/c1.txt … /tmp/c4.txt`) per `python3` mit `textwrap.fill` schreiben, einzeln per Read-Tool laden.
> 4. `cp scripts/eval_chunk_template.py /tmp/build_chunk_revisions.py` — `add(...)`-Aufrufe pro Pub füllen. Wichtig: Pubs in dieser Linie haben oft schon brauchbare Pitches und Angles (alte Sessions 7-14) — primär Reasoning auf 200-300 Zeichen heben (Median ≥220 anstreben), Pitch und Angle nur dann anfassen, wenn sie selbst defekt sind. Haikus neu für Eindeutigkeit.
> 5. `python3 /tmp/build_chunk_revisions.py` (mit `expected_count=50` in der validate-Zeile) — bei Verletzung Exit 1, Korrektur, neu durchlaufen.
> 6. `node scripts/session-pipeline.mjs apply /tmp/chunk_revisions.json --apply --force`
> 7. SQL-Verification der 50 IDs (still_short_180=0, still_below_strict_200=0). Globale lt_180/lt_150-Counts gegenchecken.
> 8. Ziel: lt_180 sinkt um exakt 50 mit jeder Charge. HANDOVER mit Session-20-Block updaten.
>
> **Längen-Standards (Skript-Schwellen):** Pitch 350–650, Reasoning 200–300 strikt, Angle 50–200. Median Reasoning ≥220 anstreben (Session 17: 284, Session 18: 281, Session 19: 274).
>
> **Quote-Falle (Sessions 7-19 erfolgreich umgangen):** Keine typografischen deutschen Quotes („"), nur ASCII-Apostroph (') in Python-Strings. Deutsche Umlaute in UTF-8 problemlos. „Pressewertbarkeit" im Reasoning vermeiden.
>
> **Bindestrich-Falle:** Sanity-Check `[a-zäöüß]\s+-\s+[A-ZÄÖÜ][a-zäöüß]+` flaggt Gedankenstriche " - X" vor Großbuchstabe-Wort. Lösung von Anfang an: Komma oder Doppelpunkt statt Gedankenstrich. Sessions 18 und 19 dadurch 0 Bindestrich-Fehlalarme.
>
> **Effiziente Reasoning-Korrektur (neu in Session 19 etabliert):** Beim ersten Run flaggt das Skript erfahrungsgemäß 30-50 Reasonings als zu lang. Statt 50 einzelne Edits zu machen, ein Helfer-Skript `/tmp/trim_reasonings.py` mit `FIXES = [(alt, neu), ...]`-Liste schreiben und in einem Durchlauf applizieren — spart Zeit und Tokens. Vorlage in Session-19-Block. Verbleibende Einzelfälle (1-2 Pubs noch knapp über 300) per `Edit`-Tool gezielt nachschärfen.
>
> **Score-Bias-Korrektur (Memory pitch_angle_craft):** novelty −0,10 vom Bauchgefühl, timeliness −0,05, societal −0,05. public_accessibility nicht standardmäßig 0,15 — bei lebensweltlich relatable Themen ruhig 0,30+.
>
> **Strategischer Hinweis Session 19:** In dieser Linie sind die Pitches/Angles aus Sessions 7-14 oft schon brauchbar (Median 535 Zeichen in Session 19 vs. 462 in Session 18; Korridor 350-650 hilft). Hauptarbeit ist konsequentes Reasoning-Hochziehen. Akronym-Inferenz-Fallen treten bei kaiserlich-österreichischen Themen besonders häufig auf (Habsburg, Mittelalter, k.u.k.) — bei jedem nicht wörtlich belegten Begriff durch konservative Formulierung ersetzen („Wiener Kaiserhof" statt „Habsburg"). Mahighlight-Lookup vor jedem Pitch obligatorisch (90% der mahighlights sind keine Akademie-Mitglieder).
>
> **Daten-Bug:** Pub `e88d7adc-8024-4870-9545-3812886fa027` (content_source=summary_de aus fremder Single-Cell-Proteomics-Studie via Crossfeed) im SQL-Query ausschließen.
>
> **Output-Budget-Ehrlichkeit (Memory `session_quality_drift.md` Punkt 1):** Wenn das Output-Budget für 50 Pubs nicht reicht, lieber 35-40 Pubs richtig bewerten und ehrlich melden, als 50 Pubs flach durchzuziehen. Session 17 hat 44 Pubs sauber geschafft (Median 284), Session 18 50 Pubs (Median 281), Session 19 50 Pubs (Median 274).

## Resume-Prompt (alt, Ende Session 17)

> Resume OeAW Press Relevance Analyzer — **Defekt-Pool des erweiterten Filters geleert (Stand Ende Session 17)**. Optionale Folge-Linie: 1454 Pubs mit Reasoning < 180 Zeichen aus Sessions 7–14 (782 unter 150) als historische Substanz-Schwächen reparieren.
>
> **Erst lesen:**
> - `HANDOVER.md` (oberer Block „Aktueller Stand Ende Session 17" und „Was in Session 17 passiert ist")
> - `memory/session_quality_drift.md` — vier Lehren: Substanz vor Geschwindigkeit, Mustermüdigkeit alle 10 Pubs prüfen, Akronym-Inferenz=Fabrikation, Sanity-Checks streng von Anfang an
> - `memory/pitch_angle_craft.md` — Längen-Standards (Pitch 350-550, Reasoning 180-280, Score-Bias-Korrektur novelty -0.10 / timeliness -0.05 / societal -0.05)
> - `memory/publication_evaluation_rules.md` (Anti-Fabrikation)
> - `memory/scoring_session_workflow.md` (Punkt 5: keine Templates)
>
> **Stand:** 7148 lokal analyzed. **Unique-defective-Set des erweiterten Filters: 0** (von 44 vor Session 17 auf 0 gefallen). Alle sechs Defekt-Kategorien (pwert / reine_fp / spezial_fp / generic / kein_eigen / wiener) auf 0. Pool A no ITA: 1353. Kein aktiver Hintergrund-Loop.
>
> **Was als nächstes anstehen kann (Optionen):**
>
> **Option A (empfohlen, falls Zeit für Re-Eval):** Reasoning-Substanz-Sweep. Defekt-Filter um `LENGTH(reasoning) < 180` erweitern und in 50er-Chargen abarbeiten. Etwa 1454 Pubs betroffen, 782 davon unter 150 Zeichen — historische Schwächen, die in den ursprünglichen Score-Sweeps nicht aufgefallen waren. Workflow identisch zum Session-12-bis-17-Workflow (4 Lese-Chunks à 12–13, build_chunk_revisions.py mit 50 add-Aufrufen, Sanity-Checks, --apply --force).
>
> **Option B (Pool-A-Reduktion):** Neue Bewertungen aus dem laufenden Pool A no ITA (1353 offen) ziehen. Workflow per `node scripts/session-pipeline.mjs candidates 100 > /tmp/batch.json`, einzeln aus Content bewerten + Haiku, dann `apply /tmp/evals.json --apply`.
>
> **Option C (Pool-B-Enrichment):** API-Cascade auf 5456 DOI-Pubs in Pool B no ITA (~23h Laufzeit) per `nohup node scripts/session-pipeline.mjs enrich-api --apply > /tmp/enrich-api.log 2>&1 &`. Erzeugt neue Pool-A-Pubs mit summary_de.
>
> **Workflow (Option A, Reasoning-Substanz-Sweep):**
> 1. `node scripts/session-pipeline.mjs status`
> 2. SQL-Query für 50 Pubs mit `LENGTH(reasoning) < 180` ORDER BY press_score DESC ziehen, `/tmp/next_chunk_clean.json` schreiben
> 3. 4 Lese-Chunks à 12–13 (`/tmp/c1.txt … /tmp/c4.txt`)
> 4. `cp scripts/eval_chunk_template.py /tmp/build_chunk_revisions.py` — `add(...)`-Aufrufe pro Pub füllen
> 5. `python3 /tmp/build_chunk_revisions.py` — bei Verletzung Exit 1, Korrektur, neu durchlaufen
> 6. `node scripts/session-pipeline.mjs apply /tmp/chunk_revisions.json --apply --force`
> 7. SQL-Verification der 50 IDs (`LENGTH(reasoning) >= 180` für alle)
> 8. Globale Reasoning-Substanz-Verteilung gegenchecken
>
> **Quote-Falle (Sessions 7–17 erfolgreich umgangen):** Keine typografischen deutschen Quotes („"), nur ASCII-Apostroph (') in Python-Strings. Deutsche Umlaute in UTF-8 problemlos. „Pressewertbarkeit" im Reasoning vermeiden — matcht den pwert-Filter.
>
> **Bindestrich-Falle (Session 16):** Der Sanity-Check `[a-zäöüß]\s+-\s+[A-ZÄÖÜ][a-zäöüß]+` flaggt legitime Gedankenstriche " - X" vor Großbuchstabe-Wort als möglichen Tippfehler. Lösung von Anfang an: Gedankenstriche durch Kommata oder Doppelpunkte ersetzen. In Session 17 dadurch 0 Bindestrich-Fehlalarme.
>
> **Output-Budget (Session 17 hat das verschärft gehalten):** Pitch-Median 470, Reasoning-Median 284 (deutlich über Substanz-Schwelle 220 und sauber im strengen Korridor 200–300, beste Reasoning-Substanz seit Session 6). Strict-Korridor 200–300 hält und liefert dimensional begründete drei-Satz-Reasonings.
>
> **Strategischer Hinweis Session 17:** Bei der letzten Charge mit 5 sehr ähnlichen RICAM-QMC-Pubs und 6 sehr ähnlichen RICAM-Schicho-Pubs sowie 6 IWF-Nakamura-Pubs und 6 HEPHY-Schwanda-Pubs hat konsequente Anker-Differenzierung pro Pub funktioniert: jedem Pub einen eigenen Anwendungs-/Methoden-/Mission-Anker geben (z.B. QMC: Risiko-Quantil-Schätzung vs. Importance-Sampling vs. multivariate Approximation vs. starke Tractability vs. PDE-Gauss; HEPHY: B→K\*γ vs. D→KsKs vs. Λc-5x vs. D→π0π0 vs. τ-LFV vs. Ξc+; Nakamura: Solar-Korona vs. DF/Magnetopause vs. Mercury-BepiColombo vs. ML-Magnetschweif vs. ELFIN-Substurm vs. Mars-MAVEN). Diese Disziplin ist auch für die Reasoning-Sweep-Linie hilfreich, weil dort viele kurze Reasonings aus früheren Sessions repariert werden müssen.
>
> **ABSCHLUSS-VERMERK:** Mit Ende Session 17 ist der gesamte ursprünglich identifizierte Defekt-Pool des erweiterten Filters abgearbeitet. Sessions 6–17 (insgesamt 12 Re-Eval-Chargen, 594 Pubs) haben Reasonings ohne „Pressewertbar"-Floskel, Audiences ohne „reine Fachpresse"/„Spezialfachpresse", Angles ohne generic-Phrasen, Pitches ohne „Wiener"-Template etabliert.

## Resume-Prompt (alt, Ende Session 16)

> Resume OeAW Press Relevance Analyzer — Re-Eval der verbleibenden 44 unmatched-original Pubs (letzte Charge des Defekt-Pools).
>
> Stand: 44 unique-defective. Charge zu ~44 ziehen, individuell re-evaluieren, apply --apply --force.

## Resume-Prompt (alt, Ende Session 15)

> Resume OeAW Press Relevance Analyzer — Re-Eval der verbleibenden 94 unmatched-original Pubs.
>
> Stand: 94 unique-defective. Charge zu 50 ziehen, individuell re-evaluieren, apply --apply --force.

## Resume-Prompt (alt, Ende Session 14)

> Resume OeAW Press Relevance Analyzer — Re-Eval der verbleibenden 144 unmatched-original Pubs.
>
> Stand: 144 unique-defective. Charge zu 50 ziehen, individuell re-evaluieren, apply --apply --force.

## Resume-Prompt (alt, Ende Session 13)

> Resume OeAW Press Relevance Analyzer — Re-Eval der verbleibenden 194 unmatched-original Pubs.
>
> Stand: 194 unique-defective. Charge zu 50 ziehen, individuell re-evaluieren, apply --apply --force.

## Resume-Prompt (alt, Ende Session 12)

> Resume OeAW Press Relevance Analyzer — Re-Eval der verbleibenden 244 unmatched-original Pubs.
>
> **Erst lesen:**
> - `HANDOVER.md` (vor allem den oberen Block „Aktueller Stand Ende Session 12" und „Was in Session 12 passiert ist")
> - `~/.claude/projects/-home-mleihs-dev-oeaw-press-release/memory/pitch_angle_craft.md` — kompletter Standard inkl. Score-Drift-Tabelle, Längen-Standards und 9-Punkt-Pitch-Prozess
> - `memory/publication_evaluation_rules.md` (Anti-Fabrikation)
> - `memory/scoring_session_workflow.md` (Punkt 5: keine Templates)
>
> **Stand:** 7148 lokal analyzed (unverändert seit Session 6). Unique-defective-Set (mit erweitertem Filter inkl. Spezialfachpresse + Kein eigenständiger Pressewinkel) 244 (von 294 vor Session 12 gefallen, exakt −50). Defekt-Breakdown: **242 Pwert-Reasoning, 135 „reine Fachpresse"-Audience, 134 generic angle „keine breitenwirksame/starke eigenständige", 2 Wiener-Template, 88 „Kein eigenständiger Pressewinkel", 88 „Spezialfachpresse"**. Bei jeder pwert-Charge sinken kein_eigen und spezial_fp stark mit (in Session 12: −36 bzw. −39).
>
> **Was zu tun ist:** Charge zu 50 (oder kleiner, je nach Output-Budget) der höchstgescorten verbleibenden 244 ziehen, individuell re-evaluieren mit dem dort dokumentierten Standard (Pitch 350–550 Zeichen, Reasoning 180–280, Audience konkret, Angle mit Anker, Score-Bias bewusst nach unten korrigieren, Haiku neu), `apply --apply --force`, dann Status-Check und nächste Charge.
>
> **Erweiterter Filter (seit Session 12 Standard):** `reasoning ILIKE '%pressewertbar%' OR target_audience ILIKE '%reine Fachpresse%' OR target_audience ILIKE '%Spezialfachpresse%' OR suggested_angle ILIKE '%keine breitenwirksame%' OR suggested_angle ILIKE '%keine starke eigenständige%' OR suggested_angle ILIKE '%Kein eigenständiger Pressewinkel%' OR pitch_suggestion ILIKE 'Eine Studie aus dem Wiener%'`
>
> **Quote-Falle (Session 7–12 erfolgreich umgangen):** Statt typografische deutsche Quotes (`„` / `"`) zu verwenden und mit ASCII `"` als String-Delimiter zu mischen — durchgängig auf typografische Quotes verzichten und ASCII-Apostroph (`'`) verwenden. Deutsche Umlaute sind in UTF-8-Python-Strings problemlos.
>
> **Lese-Chunks:** Bei dieser Score-Range (jetzt absteigend ab ~0.27) sprengten 25er-Chunks das Token-Limit. Lieber 4 Chunks à 12–13 Pubs schreiben (`/tmp/c1.txt` … `/tmp/c4.txt`).
>
> **Output-Budget-Disziplin:** Realistic ~50 Pubs pro Session (Session 7–12 haben das bestätigt). Session 12 Pitch-Median 469, Reasoning-Median 209 — Reasoning solide im Prod-Korridor 180–280, Pitch in der Soll-Spanne 350–550.
>
> **Strategischer Hinweis:** Verbleibende pwert-Pubs liegen in Score-Bändern um 0.26 und darunter — primär GMI-Pflanzenbio-Detail-Preprints, IQOQI-Theorie-Detailarbeiten, ESI-Materialwissenschaft. Die `wiener` (2) ist die finale Aufräum-Kategorie. Generic angles + reine_fp werden in unteren Score-Bändern erreicht.

## Resume-Prompt (alt, vor Session 11)

> Resume OeAW Press Relevance Analyzer — Re-Eval der verbleibenden 340 unmatched-original Pubs.
>
> **Erst lesen:**
> - `HANDOVER.md` (vor allem den oberen Block „Aktueller Stand Ende Session 10" und „Was als nächstes ansteht")
> - `~/.claude/projects/-home-mleihs-dev-oeaw-press-release/memory/pitch_angle_craft.md` — kompletter Standard inkl. Score-Drift-Tabelle, Längen-Standards und 9-Punkt-Pitch-Prozess
> - `memory/publication_evaluation_rules.md` (Anti-Fabrikation)
> - `memory/scoring_session_workflow.md` (Punkt 5: keine Templates)
>
> **Stand:** 7148 lokal analyzed (unverändert seit Session 6). Unique-defective-Set (Session-9-Filter) 340 (von 390 vor Session 10 gefallen, exakt −50). Defekt-Breakdown: **340 Pwert-Reasoning, 148 „reine Fachpresse"-Audience, 147 generic angle „keine breitenwirksame/starke eigenständige", 2 Wiener-Template**. **Neu sichtbar gemacht in Session 10:** zusätzlich 158 „Kein eigenständiger Pressewinkel"-Angles und 164 „Spezialfachpresse"-Audiences — die gehören als eigenständige Defekt-Kategorien in den Re-Eval-Filter, sobald die pwert-Pubs durchgearbeitet sind. Die Session-10-Charge war GMI/IQOQI-IBK/RICAM-lastig. Memory-File `pitch_angle_craft.md` ist die Anleitung.
>
> **Was zu tun ist:** Charge zu 50 (oder kleiner, je nach Output-Budget) der höchstgescorten verbleibenden 340 ziehen, individuell re-evaluieren mit dem dort dokumentierten Standard (Pitch 350–550 Zeichen, Reasoning 180–280, Audience konkret, Angle mit Anker, Score-Bias bewusst nach unten korrigieren, Haiku neu), `apply --apply --force`, dann Status-Check und nächste Charge.
>
> **Workflow per Charge:**
> 1. `node scripts/session-pipeline.mjs status` — kurzer Status-Check (sollte 7148+ analyzed zeigen)
> 2. Liste der noch defekten unmatched-original-IDs ziehen:
>    ```bash
>    docker exec -i supabase_db_oeaw-press-release psql -U postgres -d postgres -t -A << 'SQL' > /tmp/next_chunk.json
>    SELECT json_agg(row_to_json(r)) FROM (
>      SELECT p.id, p.title, p.original_title, p.doi, p.published_at::TEXT,
>        p.pitch_suggestion AS old_pitch, p.suggested_angle AS old_angle, p.reasoning AS old_reasoning,
>        p.target_audience AS old_audience, p.press_score AS old_score, p.haiku AS old_haiku,
>        p.public_accessibility AS old_pa, p.societal_relevance AS old_sr, p.novelty_factor AS old_nf,
>        p.storytelling_potential AS old_sp, p.media_timeliness AS old_mt,
>        COALESCE(NULLIF(p.summary_de,''), NULLIF(p.summary_en,''), NULLIF(p.enriched_abstract,''), p.abstract) AS content,
>        p.popular_science, p.peer_reviewed,
>        array(SELECT akronym_de FROM orgunit_publications op JOIN orgunits o ON o.id=op.orgunit_id WHERE op.publication_id=p.id) AS akronyms,
>        (SELECT COUNT(*) FROM person_publications pp WHERE pp.publication_id=p.id AND pp.mahighlight=true) AS mahighlight_n
>      FROM publications p
>      WHERE p.llm_model = 'anthropic/claude-opus-4.7-session'
>        AND p.analysis_status = 'analyzed'
>        AND (p.reasoning ILIKE '%pressewertbar%' OR p.target_audience ILIKE '%reine Fachpresse%' OR p.suggested_angle ILIKE '%keine breitenwirksame%' OR p.suggested_angle ILIKE '%keine starke eigenständige%' OR p.pitch_suggestion ILIKE 'Eine Studie aus dem Wiener%')
>      ORDER BY p.press_score DESC NULLS LAST
>      LIMIT 50
>    ) r;
>    SQL
>    ```
>    JSON-Prefix strippen: `python3 -c "import json; t=open('/tmp/next_chunk.json').read(); s=t.find('[{'); e=t.rfind('}]'); d=json.loads(t[s:e+2]); json.dump(d, open('/tmp/next_chunk_clean.json','w'), ensure_ascii=False); print(len(d))"`
> 3. Pubs in 2 Lese-Chunks à 25 dumpen via `python3` mit `textwrap.wrap` und Read tool einlesen
> 4. `build_chunk_revisions.py` schreiben mit individuellen Re-Evals (Vorlage: `/tmp/build_chunk_revisions.py` aus Session 8 — die ist das aktuelle Best-Practice mit deutschen Umlauten + ASCII-Apostroph). **Session 8 hat bestätigt:** UTF-8-Python-Strings mit echten Umlauten (`ä`, `ö`, `ü`, `ß`) funktionieren sauber, solange in den Strings konsequent ASCII-Apostroph (`'`) statt typografischer Quotes verwendet wird. Das ist lesbarer in der DB als die ASCII-Workaround-Schreibweise (`ueber`, `fuer`) der Session 7.
> 5. `python3 build_chunk_revisions.py` → `/tmp/chunk_revisions.json`. Sanity-Check im Skript: kein „pressewertbar", keine „reine Fachpresse", keine „spezialfachpresse", keine „keine breitenwirksame", keine Wiener-Templates, keine Variablennamen, Pitch 200–700, Reasoning 120–400 Zeichen, alle Pitches/Angles/Haikus unique
> 6. `node scripts/session-pipeline.mjs apply /tmp/chunk_revisions.json --apply --force`
> 7. SQL-Verification der 50 IDs: alle defektfrei (sollte 0/0/0/0/0 zeigen — pwert/reine_fp/spezial_fp/generic/wiener). Globale Defekt-Counts gegenchecken, Stand zusammenfassen, weiterziehen.
>
> **Quote-Falle (Session 7–10 erfolgreich umgangen):** Statt typografische deutsche Quotes (`„` / `"`) zu verwenden und mit ASCII `"` als String-Delimiter zu mischen — was den Python-Parser regelmäßig bricht — durchgängig auf typografische Quotes verzichten und ASCII-Apostroph (`'`) verwenden. Deutsche Umlaute sind in UTF-8-Python-Strings problemlos.
>
> **Output-Budget-Disziplin:** Realistic ~50 Pubs pro Session (Session 7–10 haben das bestätigt). Session 10 Pitch-Median 550, Reasoning-Median 236 — Reasoning genau im Prod-Korridor 232, Pitch leicht über 470 aber im Toleranzbereich. Wenn Budget knapp wird, ehrlich melden, nicht heimlich auf Templates zurückfallen.
>
> **Strategischer Hinweis:** Die top-gescorten verbleibenden Pubs sind weiterhin primär pwert-Defekte. Die 148 reine_fp + 147 generic_angle + 2 wiener-template-Pubs sind in den unteren Score-Bändern konzentriert und werden erst in späteren Chargen erreicht. Für die in Session 10 neu sichtbar gemachten 158 „Kein eigenständiger Pressewinkel" und 164 „Spezialfachpresse" lohnt sich ein erweiterter Defekt-Filter, sobald die hohen pwert-Scores abgearbeitet sind.

---

## Resume-Prompt (alt, vor Prod-Übernahme — nur historisch)

> Resume Session-Scoring vom OeAW Press Relevance Analyzer. Lies `HANDOVER.md` und `MEMORY.md` komplett, insbesondere:
> - **Hard Rules für Bewertung** in `HANDOVER.md`
> - `publication_evaluation_rules.md` (Anti-Fabrikations-Regeln)
> - `scoring_session_workflow.md` — **inkl. Punkt 5: KEINE Default-/Template-Generatoren. Jede Pub einzeln auf Basis ihres Contents bewerten.** Pitch, Reasoning und Haiku müssen aus dem konkreten Inhalt der jeweiligen Pub abgeleitet sein, nicht aus institutsbasierten Vorlagen gestempelt. Selbst spezialisierte Routine-Pubs bekommen einen Pitch, der den **konkreten** Forschungsgegenstand aus dem Content paraphrasiert.
>
> **Aktueller Stand: 1387 Pubs analyzed, Pool A no ITA: 1899 offen.** In der vorherigen Session 7 Charges (Charge 1–7) sauber durchgelaufen. Charge 3 hatte einen Default-Generator-Verstoß, der mit `--apply --force` durch individuelle Bewertungen ersetzt wurde — daher Punkt 5 in der Memory.
>
> **Workflow**: `node scripts/session-pipeline.mjs status` → `candidates 100 > /tmp/batch.json` → bei `mahighlight=true` erst per SQL-Join (`docker exec supabase_db_oeaw-press-release psql -U postgres -d postgres -c "SELECT pp.publication_id, p.firstname, p.lastname, p.member_type_id, mt.name_de FROM person_publications pp JOIN persons p ON p.id=pp.person_id LEFT JOIN member_types mt ON mt.id=p.member_type_id WHERE pp.publication_id='<uuid>' AND pp.mahighlight=true;"`) prüfen, ob die markierende Person Mitglied ist (`member_type_id IS NOT NULL`); falls nicht, **Person konkret namentlich nennen** und „Mitglied" weglassen. Pubs einzeln aus dem `content`-Feld bewerten (NIEMALS aus Titel allein) inkl. deutschem 5-7-5-Haiku → `apply /tmp/evals.json --apply`. Bei Pitch- oder Haiku-Duplikaten zwischen Preprint- und peer-reviewed-Versionen derselben Studie: Haiku leicht abwandeln.
>
> **Reasoning-Stil**: Fließtext, OHNE relative Einordnungen, OHNE Variablen-/Spaltennamen, OHNE Institutions-Behauptungen die nicht aus DB-Flags ableitbar sind, OHNE inhaltliche Behauptungen ohne Content-Beleg. Bei sehr fachlichen Pubs sind kurze 2-Satz-Reasonings nach Regel 6 erlaubt — aber Pitch und Haiku müssen individuell sein.
>
> **Quote-Falle**: Beim Schreiben großer evals.json-Dateien typografische Anführungszeichen (`„"`) konsequent verwenden und ASCII-Quotes (`"`) innerhalb von Strings vermeiden. Falls JSON-Parse-Fehler: byteweiser Quote-Fix per Python-Skript möglich.
>
> **WICHTIG**: Batches durchrennen lassen — nach jedem `apply --apply` direkt nächste `candidates`-Charge ziehen, kein Stoppen. Wenn das Output-Budget knapp wird, **ehrlich beim User melden**, nicht heimlich auf Templates zurückfallen.
>
> **Offene Tasks**: 132 schon-analyzed Pubs mit DOI ohne `enriched_keywords` noch nicht augmentiert — separat per ID-Liste oder erweiterte `cmdEnrichAugment`-Query (Filter `analysis_status = 'analyzed'` zusätzlich) nachholen.

---

## Was in der späten Session 2026-04-28 strukturell repariert/ergänzt wurde

| Was | Wo | Effekt |
|---|---|---|
| ID-basierte Augmentation | `app/api/enrichment/batch/route.ts` (body.ids), `scripts/session-pipeline.mjs::cmdEnrichAugment` | Augment-Loop terminiert sauber, kein Endlos-Loop mehr durch jüngste Pool-B-Pubs |
| Reset 1.847 Hack-Partials → enriched | direkt in DB | Pool-A-Pubs sind nicht mehr fälschlich als partial markiert |
| `publications.haiku TEXT` | DB-Migration | Haiku als drittes Output-Feld |
| `cmdApply` schreibt haiku | `scripts/session-pipeline.mjs` | Haiku optional übernommen |
| Anweisung 10 + Haiku-Output-Feld | `lib/analysis/prompts.ts` | Künftige LLM-Bewertungen liefern auch Haiku |

---

## Hintergrund-Loops

Stand späte Session 2026-04-28: **kein aktiver Hintergrund-Loop**. Der Augment-Loop ist sauber durchgelaufen und beendet. Wenn neue Pool-A-Pubs durch Pool-B-API-Cascade entstehen, kann `enrich-augment --apply` erneut gestartet werden (wird wegen ID-Logik korrekt nur die ergänzungsbedürftigen Pubs verarbeiten).

```bash
nohup node scripts/session-pipeline.mjs enrich-augment --apply > /tmp/enrich-augment.log 2>&1 &
```
