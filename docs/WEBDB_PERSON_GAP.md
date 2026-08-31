# Die Personenlücke in der WebDB

**Stand 2026-08-26.** Warum bei Publikationen regelmäßig Autorinnen und Autoren
fehlen, warum sich das bei uns nicht reparieren lässt, und was die nächtliche
„Drift"-Warnung in Wahrheit misst.

Kurzfassung: **43,5 Prozent aller Autorenverknüpfungen in der WebDB zeigen auf
Personensätze, die es in der WebDB selbst nicht gibt.** Unsere Kopie ist davon
nicht die Ursache, sondern nur der Spiegel. Ein Vollabgleich kann daran nichts
ändern.

---

## 1. Wie es aufgefallen ist

Auslöser war die Frage, warum der nächtliche Import „fehlschlägt". Er tat es
nicht (siehe `NIGHTLY_OPS.md`), aber die Untersuchung förderte eine zweite Sache
zutage: die Warnzeile

```
DEGRADED :: angewandt mit 1 Warnung(en): publications_incremental_change_2:
11 orphan link(s), 0 unresolved lookup(s): likely drift vs. the full corpus;
schedule/verify a full reconciliation.
```

erscheint fast jede Nacht, mit schwankenden Zahlen zwischen 0 und 80. Der
empfohlene Vollabgleich wurde mehrfach durchgeführt und hat nichts geändert. Das
war der Hinweis darauf, dass die Metrik etwas anderes misst als angenommen.

## 2. Datengrundlage

| Quelle | Umfang |
|---|---|
| Rohexport-Archiv `/data/coolify/backups/oeaw-exports/` auf metaspots | 28 Tage, 2026-07-30 bis 2026-08-26, beide Feeds, gzip |
| `ingest_runs`-Journal auf prod | 40 Läufe ab 2026-07-16 |
| Vollständiger TYPO3-Dump der `oeaw`-DB | gezogen 2026-08-26, 961 MB gzip, ~260 Tabellen |
| Prod-Postgres | 39.292 Publikationen, 3.520 Personen |

Das Archiv beginnt erst am 30.07., davor gibt es nur die Zählungen im Journal.
Der Dump ist die entscheidende Gegenprobe: er zeigt, was die Quelle wirklich
enthält, statt nur, was sie ausliefert.

## 3. Was der Export liefert

Der Feed `publications_incremental_change_2.json` ist **publikationszentriert und
inkrementell**. Er trägt vier Tabellen:

| Tabelle | Felder je Satz | 28-Tage-Summe |
|---|---|---|
| `…_publication` | 31 Felder inkl. `ris`, `bibtex`, `endnote`, sieben Zitierformate | 2.823 |
| `…_person` | **ausschließlich `{uid, lastname}`**, 3192 von 3192 Sätzen | 3.192 |
| `…_personpublication` | `{uid, person, publication}` | 3.777 |
| `…_orgunitpublication` | `{uid, organizational_unit, publication}` | 5.868 |

`records_to_delete` enthält über alle 28 Tage ausschließlich Publikationen
(41 Stück), nie Personen oder Verknüpfungen.

Zwei Fallen stecken schon hier:

- Das Feld `persons` im Publikationssatz ist ein TYPO3-**Beziehungszähler**
  (`"0"`), keine Personendaten. Wer dort Namen sucht, findet nichts.
- Die Personensektion ist eine **Liste von Listen**, nicht flach. Naives Parsen
  liefert scheinbar leere Sätze.

Personensätze kommen nur mit, wenn sich an ihnen selbst etwas geändert hat. Die
Verknüpfungen der betroffenen Publikationen kommen dagegen **vollständig** mit.
Das ist der Mechanismus, aus dem die Lücke entsteht.

## 4. Der Befund im Export

Über 28 Tage werden **613** verschiedene Personen von Verknüpfungen referenziert.
Geliefert werden **348**. **265 werden nie geliefert**, an keinem einzigen Tag.

Tagesweise, jeweils Publikationen im Delta, referenzierte und nicht gelieferte
Personen:

| Tag | Pubs | Pers.-Junctions | referenziert | nicht geliefert | Quote |
|---|---:|---:|---:|---:|---:|
| 30.07. | 6 | 13 | 6 | 1 | 17 % |
| 31.07. | 28 | 71 | 48 | 20 | 42 % |
| 04.08. | 69 | 164 | 46 | 23 | 50 % |
| 08.08. | 52 | 162 | 49 | 31 | **63 %** |
| 12.08. | 10 | 19 | 17 | 4 | 24 % |
| 16.08. | 12 | 20 | 15 | 5 | 33 % |
| 20.08. | 12 | 35 | 33 | 17 | 52 % |
| 22.08. | 2474 | 3054 | 427 | 170 | 40 % |
| 23.08. | 94 | 108 | 21 | 6 | 29 % |
| 26.08. | 22 | 46 | 36 | 12 | 33 % |

Sauber sind ausschließlich die Tage mit ein bis drei Publikationen. Die Quote
schwankt nicht, weil sich etwas ändert, sondern weil sie ein **Anteil an dem ist,
was zufällig gerade dran war.**

## 5. Der Befund in der Quelle

Der Dump beendet das Rätselraten. Alle 265 nie gelieferten uids existieren in
`tx_hebowebdb_domain_model_person` **überhaupt nicht**. Nicht als gelöscht
markiert, sondern spurlos.

```
gesucht  in_webdb  nicht_in_webdb  geloescht  aktiv
    265         0             265       NULL   NULL
```

Und das ist kein Randfall, sondern die Regel:

| Kennzahl | Wert |
|---|---:|
| Personensätze in der WebDB | 3.223 |
| davon `deleted = 1` | **0** |
| davon `external = 1` | 514 |
| davon überhaupt in Autorenverknüpfungen | 1.093 |
| Autorenverknüpfungen gesamt | 85.768 |
| davon `deleted = 1` | 0 |
| **davon ohne existierenden Personensatz** | **37.332 (43,5 %)** |
| betroffene Personen-uids | **2.428** |
| Autoren je Publikation im Schnitt | 2,4 |
| davon ohne Personensatz | 1,0 (37,2 %) |

Bemerkenswert sind die beiden Nullen. TYPO3 löscht per Konvention weich; hier
gibt es **keine einzige** weich gelöschte Person und **keine einzige** weich
gelöschte Verknüpfung. Die Personensätze wurden also hart entfernt, während die
Verknüpfungen unangetastet blieben. Von den 2.428 Phantom-uids sitzen rund 1.253
in dichten uid-Bereichen, in denen die direkten Nachbarn existieren, was für
herausgelöste Sätze spricht.

## 6. Wer fehlt

Die Namen lassen sich aus der RIS-Autorenliste rekonstruieren: für jede
Publikation die Autorennamen, davon die bereits erklärten Personen abgezogen, der
Rest gehört den fehlenden uids. Wo genau ein Autor fehlte, ist die Zuordnung
sicher; wo mehrere fehlten, ist die Menge sicher und die Paarung untereinander
möglicherweise vertauscht. So ließen sich **142 der 265** benennen.

Sortiert danach, wie viele Publikationen in der WebDB an der uid hängen:

| person-uid | Name | Pubs in WebDB | Zuordnung |
|---:|---|---:|---|
| 13315 | Fastl, Christian K. | **1064** | Institut für kunst- und musikhistorische Forschungen |
| 42623 | Prochaska, Walter | 229 | Archäometrie / ÖAI |
| 13062 | Biernat, H. K. | 164 | Institut für Weltraumforschung |
| 288109 | Ursin, R. | 120 | IQOQI Wien |
| 1156554 | Hülden, Oliver | 98 | ÖAI |
| 2091526 | Matić, Uroš | 93 | ÖAI |
| 13356 | Fischer, G. | 89 | Institut für Weltraumforschung |
| 11593 | Kapeller, Vera | 79 | ITA |
| 12715 | Simon, Ulrich | 74 | |
| 636187 | Rodrigues, Sergio S. | 74 | RICAM |
| 12065 | Lechleitner, Gerda | 71 | Phonogrammarchiv |
| 11812 | Jennewein, T. | 70 | IQOQI Wien |
| 11780 | Hye, Hans Peter | 69 | Institut für Neuzeit- und Zeitgeschichtsforschung |
| 11974 | Kowar, Helmut | 68 | Phonogrammarchiv |
| 99108 | Kofler, J. | 55 | IQOQI Wien |

Die 142 rekonstruierten Personen hängen zusammen an **4.597** Verknüpfungen,
im Median 16 je Person. Der größte Fall ist in
[`WEBDB_FALL_FASTL.md`](./WEBDB_FALL_FASTL.md) vollständig aufgeschlüsselt,
inklusive dem, was er im Produkt kostet.

**Das sind keine externen Ko-Autoren.** Es sind zentrale ÖAW-Forschende. Die
Gegenprobe im Dump ist eindeutig: von den Nachnamen Fastl, Ursin, Biernat,
Prochaska, Kowar, Jennewein, Kofler, Hülden und Matić existiert in der gesamten
Personentabelle **kein einziger** Satz, auch nicht unter anderer uid. Von den 143
rekonstruierten Nachnamen kommen 114 in der WebDB gar nicht vor; die 29
scheinbaren Treffer sind Kollisionen mit anderem Vornamen (`Schmidt, Markus`
gegen `Schmidt, Alfred`, `Thür, Hilke` gegen `Thür, Gerhard`).

Dass ÖAW Externe grundsätzlich pflegt, zeigen die 514 Sätze mit `external = 1`.
Die Lücke ist also keine Design-Entscheidung „Externe bekommen keinen Satz".

## 7. Warum sich das bei uns nicht mappen lässt

Drei voneinander unabhängige Gründe:

1. **Kein Fremdschlüsselziel.** Eine Verknüpfung braucht eine Personenzeile, auf
   die sie zeigen kann. Ohne die fällt sie weg. `apply_publications_delta` zählt
   das als `person_link_orphans` und verwirft sie. Die Publikation kommt an, ihr
   fehlt nur dieser Autor.
2. **Der Name steht woanders und ohne belastbare Zuordnung.** `lead_author`,
   `ris`, `bibtex`, `endnote` und die sieben Zitierformate tragen alle
   Autorennamen. Die Reihenfolge der Verknüpfungen stimmt aber nur zu **82
   Prozent** mit der Autorenreihenfolge überein, der Rest sind Permutationen
   derselben Namen. Eindeutig wird es nur, wenn genau ein Autor fehlt.
3. **Die gelieferten Personensätze sind zu dünn.** Seit Ende Juli kommen sie
   ausschließlich als `{uid, lastname}`, ohne Vornamen. Selbst ein Abgleich über
   den Namen bliebe mehrdeutig.

## 8. Was das für die Drift-Metrik bedeutet

`DRIFT_ALARM_THRESHOLD = 25` in `lib/server/ingest/classify-run.ts` summiert
`person_link_orphans`, `orgunit_link_orphans` und die beiden `unresolved_*`.
Der Kommentar dort sagt „Real liegt die Nacht-Drift bei 0–1". Das stimmt nicht
mehr, und der Grund ist strukturell:

- Die Zahl **skaliert mit der Größe der Nacht.** Eine ruhige Nacht mit einer
  Publikation kann 25 nie erreichen, auch wenn 100 Prozent ihrer Verknüpfungen
  ins Leere zeigen. Eine belebte Nacht reißt die Schwelle, ohne dass etwas
  passiert wäre. Am 20.08. lag die Orphan-Quote bei 30 Prozent und der Lauf blieb
  still (16 Fälle); am 08.08. lag sie bei 28 Prozent und alarmierte (80 Fälle).
  Gemeldet wurde also die bessere der beiden Nächte.
- Der empfohlene Vollabgleich **kann nichts bewirken**, weil bei uns nichts
  fehlt. Die Verweise sind schon in der Quelle kaputt.

Empfehlung: Personen-Verknüpfungen aus der Alarm-Metrik herausnehmen und getrennt
als das führen, was sie sind, nämlich ein dauerhafter Anteil nicht auflösbarer
Autorenschaften. Für den Alarm bleibt dann übrig, was wirklich anomal ist:
Orgunit-Waisen und unbekannte Typangaben. Die Belege je Lauf stehen seit der
Migration `20260826000001` als `drift_details` im Report und erscheinen im
Dashboard in der Blase neben „WebDB-Stand".

## 9. Gegenprobe: die Publikationsseite ist sauber

Damit klar ist, dass die Pipeline nicht generell driftet:

```
Publikationen in WebDB (deleted = 0):  36.771
aktiv bei uns:                         37.295   (+ 1.997 archiviert)

nur in WebDB:      0
nur bei uns:     524
in beiden:    36.771
```

**Die Delta-Schnittstelle hat keine einzige Publikation verpasst.** Die Drift
läuft in die andere Richtung: wir halten 524 Publikationen, die die WebDB nicht
mehr führt, angelegt zwischen 27.04. und 09.07. und seither dort entfernt, ohne
dass eine Löschanweisung kam. **521 davon sind bewertet**, ein Aufräumen würde
also Bewertungsarbeit vernichten und ist eine bewusste Entscheidung, kein
Automatismus.

Auf der Personenseite fehlen uns 60 Sätze, die die WebDB hat. Die haben
allerdings **null** Publikationsverknüpfungen; es sind Personen ohne
Publikationen, etwa neu gewählte Mitglieder. Ein publikationszentriertes Delta
liefert die nie. Erwartbar, ohne Folgen.

## 10. Was an die ÖAW gehört

Für Florian, mit Zahlen belegbar:

1. `tx_hebowebdb_domain_model_personpublication` enthält **37.332 Zeilen (43,5
   Prozent)**, deren `person` auf keine Zeile in
   `tx_hebowebdb_domain_model_person` zeigt. Betroffen sind 2.428 uids.
2. Weder Tabelle enthält weich gelöschte Zeilen. Die Personensätze sind hart
   entfernt worden, die Verknüpfungen blieben stehen.
3. Betroffen sind produktive ÖAW-Forschende, an der Spitze Christian Fastl mit
   1.064 Publikationen.
4. Zusätzlich: der Export liefert Personensätze nur noch als `{uid, lastname}`,
   ohne Vorname, ORCID, Porträt oder Biografie (bekannt seit 2026-07-29).
5. Zusätzlich: der als „incremental" deklarierte Feed liefert etwa monatlich
   einen Volldump (29.07.: 1.926 Publikationen, 22.08.: 2.474). Am 22.07. kamen
   1.424 Pseudo-Löschungen.

## 11. Reproduktion

```bash
# Rohexporte auswerten (auf metaspots, wo das Archiv liegt)
ls /data/coolify/backups/oeaw-exports/

# Vollen Dump ziehen: siehe docs/WEBDB_IMPORT.md, T3Adminer mit &dump=
# Nur die nötigen Tabellen extrahieren, LC_ALL=C gegen Multibyte-Abbrüche:
gunzip -c oeaw.sql.gz | LC_ALL=C awk '
  /^DROP TABLE IF EXISTS `/ { t=$0; sub(/^DROP TABLE IF EXISTS `/,"",t); sub(/`;$/,"",t) }
  t == "tx_hebowebdb_domain_model_person" { print }
' > person.sql

# In einen MySQL-Container laden (Port 54499, db webdb, root/root)
docker run -d --name webdb-check -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=webdb -p 54499:3306 mysql:8

# Die Kernzahl
SELECT count(*) FROM tx_hebowebdb_domain_model_personpublication pp
LEFT JOIN tx_hebowebdb_domain_model_person p ON p.uid = pp.person
WHERE p.uid IS NULL;
```

**Fallen dabei:** `awk` bricht ohne `LC_ALL=C` an ungültigen Multibyte-Sequenzen
in den Solr-Feldern ab. Ein Dateiname `struct.py` verschattet das Stdlib-Modul,
das `gzip` importiert. Und `LOAD DATA INFILE` scheitert im MySQL-Container an
`--secure-file-priv`; stattdessen `INSERT`-Batches erzeugen.

## Verwandte Dokumente

- `docs/NIGHTLY_OPS.md`: Ablauf und Alarm-Semantik des Nacht-Imports
- `docs/WEBDB_IMPORT.md`: Vollimport aus dem TYPO3-Dump
- `docs/PUBLICATIONS_DELTA_IMPORT.md`: der inkrementelle Pfad
- `docs/WEBDB_FALL_FASTL.md`: derselbe Befund an einem Einzelfall durchgerechnet
