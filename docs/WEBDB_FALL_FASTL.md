# Fallbeispiel Christian Fastl: eine Person, 1.064 Publikationen, kein Datensatz

**Stand 2026-08-26.** Dieses Dokument schlüsselt das Problem aus
`WEBDB_PERSON_GAP.md` an einem einzigen, besonders klaren Fall auf. Es ist als
Grundlage für das Gespräch mit der ÖAW gedacht: alle Zahlen sind aus dem
TYPO3-Volldump vom 26.08. nachprüfbar, die Abfragen stehen am Ende.

---

## Der Sachverhalt in einem Satz

In der WebDB hängen **1.064 Publikationen** an der Personen-uid **13315**, und zu
dieser uid gibt es in der Personentabelle **keine Zeile**. Der Name steht nur noch
als Fließtext in den Publikationen selbst.

## 1. Warum ausgerechnet dieser Fall

Christian Fastl ist von 2.428 betroffenen Personen-uids der mit Abstand größte.
Er eignet sich deshalb als Beleg, aber er ist kein Sonderfall, sondern die Spitze
einer Verteilung: die 142 namentlich rekonstruierbaren Fälle hängen zusammen an
4.597 Verknüpfungen, im Median 16 je Person.

Sein Werk erklärt die hohe Zahl: es sind überwiegend Lexikonartikel, also viele
kurze, einzeln erfasste Einträge.

| | |
|---|---|
| Zeitraum der Publikationen | 15.06.2004 bis 01.01.2025 |
| davon seit 2020 | 41 |
| Typische Titel | „Schmögner, Thomas", „Kirchmair, Familie", „Marsano, Emanuel", „Venturini, Familie" |
| Institut | Institut für kunst- und musikhistorische Forschungen |

## 2. Was in der WebDB steht

```sql
SELECT count(*) FROM tx_hebowebdb_domain_model_personpublication
WHERE person = 13315;
-- 1064

SELECT count(*) FROM tx_hebowebdb_domain_model_person
WHERE uid = 13315;
-- 0

SELECT count(*) FROM tx_hebowebdb_domain_model_person
WHERE lastname LIKE '%Fastl%';
-- 0
```

Alle 1.064 referenzierten Publikationen **existieren** in
`tx_hebowebdb_domain_model_publication`. Die Verknüpfungen sind also
wohlgeformt, nur ihr Ziel auf der Personenseite fehlt.

Entscheidend für die Deutung: **keine dieser Zeilen ist weich gelöscht.** Weder
in der Personentabelle (0 von 3.223 Zeilen tragen `deleted = 1`) noch in der
Verknüpfungstabelle (0 von 85.768). TYPO3 löscht per Konvention weich. Ein
Personensatz, der weder existiert noch als gelöscht markiert ist, wurde hart
entfernt, und die 1.064 Verknüpfungen blieben verwaist zurück.

## 3. Dass es wirklich Christian Fastl ist

Die Zuordnung uid zu Name stammt nicht aus Raterei. Sie ist doppelt belegt:

1. **Rekonstruktion über die Autorenlisten.** In den RIS-Feldern der betroffenen
   Publikationen bleibt nach Abzug aller bekannten Personen genau ein Name übrig.
2. **Unabhängige Bestätigung über `lead_author`.** Von den 1.064 Publikationen
   tragen **936** im Feld `lead_author` den Wert `Fastl, Christian`, und **1.028**
   nennen „Fastl" im RIS-Text.

Die uid 13315 und der Name Christian Fastl gehören also zweifelsfrei zusammen.

## 4. Was bei uns ankommt

Der nächtliche Import verarbeitet den Feed korrekt. Ergebnis in unserer Datenbank:

| Kennzahl | Wert |
|---|---:|
| Publikationen aus seinen 1.064, die wir haben | **1.064** |
| davon archiviert | 0 |
| davon bewertet | 2 |
| Einträge „Fastl" in unserer `persons`-Tabelle | **0** |
| seiner Publikationen **ganz ohne** Autorenverknüpfung | **1.032** |
| Autorenverknüpfungen über alle 1.064 Publikationen zusammen | 33 (5 verschiedene Personen) |
| Publikationen mit `lead_author` = „Fastl, Christian" | 936 |

Die Publikationen sind also **vollständig da**. Was fehlt, ist ausschließlich die
Person als Entität. Für 1.032 seiner Arbeiten kennt unser System überhaupt keine
verknüpfte Autorin oder Autor.

## 5. Was das im Produkt bedeutet

- **Er taucht in keiner Personenansicht auf.** Es gibt keine Seite „Christian
  Fastl", keine Publikationsliste zu ihm, keine Filterung nach ihm. Für das
  Werkzeug existiert er nicht.
- **Die Detailseite einer seiner Publikationen zeigt keine Autor:innen-Karte
  mit verknüpften Personen.** Sie fällt auf den Zitattext zurück, in dem sein
  Name als reine Zeichenkette steht. Genau dafür wurde dieser Fallback gebaut,
  aber er ersetzt keine Entität.
- **Die Ableitung der Organisationseinheit über die Autorenschaft greift nicht.**
  Wo die Zuordnung eines Beitrags zu einem Institut über die beteiligten Personen
  läuft, fehlt sie.
- **In der Pressearbeit fehlt der Ansprechpartner.** Die Autor:innen-Karte
  markiert ÖAW-Angehörige eigens in Markenfarbe, weil sie die realistischen
  Kontaktpunkte sind. Bei ihm ist diese Zeile leer.

## 6. Warum wir das nicht reparieren können

Drei unabhängige Gründe, ausführlich in `WEBDB_PERSON_GAP.md` Abschnitt 7:

1. **Kein Ziel für den Fremdschlüssel.** Eine Verknüpfung ohne Personenzeile lässt
   sich nicht schreiben. `apply_publications_delta` zählt sie als
   `person_link_orphans` und verwirft sie.
2. **Der Name ist da, die Verbindung zur uid nicht.** Wir könnten aus
   `lead_author` einen Personensatz „Fastl, Christian" erzeugen. Er wäre aber
   unsere Erfindung: ohne die uid 13315 in der Quelle hätte er keinen stabilen
   Schlüssel, und beim nächsten Import, der die echte uid wieder mitbringt,
   entstünde ein Duplikat. Wir würden ein Datenproblem der Quelle durch ein
   selbstgemachtes ersetzen.
3. **Die gelieferten Personensätze sind zu dünn.** Seit Ende Juli kommen sie nur
   als `{uid, lastname}`, ohne Vornamen. Selbst ein Abgleich über den Namen bliebe
   mehrdeutig.

Der Vollabgleich hilft ausdrücklich nicht: unsere Kopie ist bereits vollständig.
Von den 36.771 Publikationen der WebDB fehlt uns **keine einzige**. Es fehlt
nichts bei uns, es fehlt in der Quelle.

## 7. Was die ÖAW tun müsste

Der Fall ist auf drei Wegen heilbar, absteigend nach Sauberkeit:

1. **Den Personensatz 13315 wiederherstellen.** Aus einem Backup der WebDB, das
   vor der Löschung liegt. Damit greifen alle 1.064 Verknüpfungen sofort wieder,
   ohne dass an ihnen etwas geändert werden muss. Das ist der einzige Weg, der
   auch die übrigen 2.427 Fälle in einem Zug löst.
2. **Den Satz neu anlegen und die Verknüpfungen umhängen.** Funktioniert, ist
   aber je Person Handarbeit und verliert die Historie am Datensatz.
3. **Die verwaisten Verknüpfungen löschen.** Beseitigt die Inkonsistenz, aber um
   den Preis, dass die Autorenschaft dauerhaft verloren ist. Für Fastl hieße das,
   1.064 Zuschreibungen aufzugeben.

Unabhängig davon lohnt die Frage, **wie** ein Personensatz hart gelöscht werden
konnte, obwohl TYPO3 weich löscht, und ob dabei ein Fremdschlüssel-Schutz fehlt.
Solange der fehlt, entstehen neue Fälle.

## 8. Reproduktion

Voraussetzung: TYPO3-Volldump geladen, siehe `WEBDB_PERSON_GAP.md` Abschnitt 11.

```sql
-- WebDB-Seite
SELECT count(*) FROM tx_hebowebdb_domain_model_personpublication WHERE person = 13315;
SELECT * FROM tx_hebowebdb_domain_model_person WHERE uid = 13315;
SELECT * FROM tx_hebowebdb_domain_model_person WHERE lastname LIKE '%Fastl%';

-- Liegen die Publikationen selbst vor?
SELECT count(*) FROM tx_hebowebdb_domain_model_personpublication j
JOIN tx_hebowebdb_domain_model_publication p ON p.uid = j.publication
WHERE j.person = 13315;
```

```sql
-- Unsere Seite (prod), nachdem die 1.064 uids in die Temp-Tabelle f geladen sind
SELECT count(*)                                            AS bei_uns,
       count(*) FILTER (WHERE p.lead_author ILIKE '%Fastl%') AS lead_author_fastl,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM person_publications pp WHERE pp.publication_id = p.id
       ))                                                   AS ohne_autorenverknuepfung
FROM f JOIN publications p ON p.webdb_uid = f.uid;

SELECT count(*) FROM persons WHERE lastname ILIKE '%Fastl%';
```

## Verwandte Dokumente

- `docs/WEBDB_PERSON_GAP.md`: der vollständige Befund, alle 2.428 Fälle
- `docs/NIGHTLY_OPS.md`: Ablauf und Alarm-Semantik des Nacht-Imports
