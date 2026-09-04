# Rückfragen zum TYPO3-Export (Stand 2026-09-04)

Vier Punkte, die den nächtlichen Export betreffen. Sie sind alle ÖAW-seitig zu
lösen; bei uns lässt sich jeder davon nur nachträglich und unvollständig
ausgleichen. Belege stammen aus dem Dump vom 2026-09-03 und dem Archiv der
letzten 35 Export-Tage.

Zum Mitgeben an die Redaktion, deshalb bewusst ohne internes Vokabular.

## 1. Das Delta-Kriterium steht auf `crdate` statt `tstamp`

**Befund.** Der Export liefert einen Datensatz genau einmal, am Tag seiner
Anlage, und danach nie wieder. In 35 archivierten Export-Tagen erfolgten
**74 von 74 Auslieferungen am Anlagetag**, keine einzige wegen einer Änderung.

**Warum das zählt.** 81 % der künftigen Veranstaltungen (191 von 235) werden
nach dem Anlegen noch einmal bearbeitet, im Mittel 133 Tage später. Wird ein
Titel nachgetragen, ein Termin verschoben oder ein Ort ergänzt, erreicht uns
das nicht. Am 2026-09-04 hingen dadurch 46 Veranstaltungen hinterher: falsche
Uhrzeiten, ein vollständig umgeschriebener Titel und drei Platzhalter, die in
TYPO3 längst einen echten Titel tragen.

**Bitte.** Das Delta-Kriterium von `crdate` auf `tstamp` umstellen, damit auch
Änderungen ausgeliefert werden.

## 2. Die Ordner-Liste des Exports ist handgepflegt und unvollständig

**Befund.** Der Export sammelt aus einer festen Menge von News-Ordnern. IMAFO
fehlt darin ganz: drei News-Unterordner unter dem News-Folder 3406 (darunter
„News HI", pid 7523) waren an **keinem** der 35 archivierten Tage dabei.

**Warum das zählt.** Was in einem nicht eingesammelten Ordner liegt, kommt nie
bei uns an, und es fällt auch niemandem auf, weil nur etwas fehlt, das nie da
war. Aufgefallen ist es erst durch einen Abgleich gegen einen Datenbank-Dump.

**Bitte.** Die drei IMAFO-Unterordner in die Export-Liste aufnehmen. Falls die
Liste anders gepflegt werden kann als von Hand (etwa über den Seitenbaum
statt über einzelne pids), wäre das die dauerhaftere Lösung.

## 3. Drei ITA-Datensätze liegen auf der falschen Seite

**Befund.** Das ITA hat drei Veranstaltungen auf der regulären Seite 9280
abgelegt statt im dafür vorgesehenen Ordner 9130.

**Bitte.** Die Datensätze nach 9130 verschieben. Ergänzend: uid 39777 ist eine
fehlerhafte Seitenkopie („copy 1", mit einem Datum aus 2025) und sollte
gelöscht werden.

## 4. Der Export unterscheidet Übersetzungen nicht von Originalen

**Befund.** Der JSON-Export führt kein `sys_language_uid` und kein
`l10n_parent`. Für uns sieht die englische Übersetzung einer Veranstaltung
deshalb aus wie eine zweite, eigenständige Veranstaltung. Stand 2026-09-04
liegen bei uns **11 solche DE/EN-Dubletten** unter den künftigen Terminen.

**Warum das zählt.** Wir können die Dubletten nicht selbst erkennen: Ohne das
Sprachfeld fehlt jedes verlässliche Merkmal. Ein einmaliges Aufräumen bei uns
hilft nur bis zur nächsten Übersetzung.

**Bitte.** `sys_language_uid` und `l10n_parent` in den Export aufnehmen. Dann
können wir die Übersetzung dem Original zuordnen und als Sprachvariante
führen, statt sie doppelt anzuzeigen.

## Was wir bis dahin tun

Punkt 1 gleichen wir manuell gegen einen Datenbank-Dump aus
(`scripts/import-events-from-dump.ts --refresh`, `scripts/audit-events-vs-dump.ts`),
Punkt 2 ebenso. Beides ist Handarbeit und nur so aktuell wie der jeweils
letzte Dump. Punkt 4 lässt sich bei uns gar nicht sauber lösen.
