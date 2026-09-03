# Das Haiku-Gate

**Zweck:** Es ist die letzte Instanz vor der Datenbank. Das Haiku ist das einzige
Feld, dessen Fehler kein Konsument bemerkt: einen falschen `press_score` verrät
das Kalibrierungsband, einen durchgerutschten Variablennamen im `reasoning` fängt
eine Regex, aber eine vierte Silbe sieht aus wie eine fünfte. Geschrieben hat die
Zeile ein Sprachmodell, und Modelle halten sich messbar nicht an die Form.

## Der Befund, der das ausgelöst hat

Audit über alle 3.065 gespeicherten Haikus auf Prod (2026-09-03,
`npm run haiku-audit -- --target=prod`):

| Kohorte | n | sauber | Struktur kaputt | Silben falsch |
|---|---|---|---|---|
| `opus-4.7-session` | 2.592 | 48,9 % | 632 | 1.109 |
| `opus-4.8-session` | 411 | 71,0 % | 36 | 118 |
| `opus-5-session` | 61 | **100 %** | 0 | 0 |

Die Aufforderung im Prompt (`lib/server/analysis/prompts.ts`, Punkt 10) ist also
keine Zusicherung. Sie war nie eine.

## Aufbau

Zwei Hälften, absichtlich getrennt:

- **`lib/shared/haiku.ts` — Struktur.** Ohne Abhängigkeiten, deshalb auch in der
  App benutzbar. Prüft: genau drei Zeilen, Trenner exakt `" / "`, keine
  Ziffern, Anführungszeichen, Gedankenstriche oder Klammern, kein `ae/oe/ue`
  anstelle eines Umlauts, keine überzähligen Leerzeichen. Ziffern fliegen raus,
  weil kein Silbenzähler sie aussprechen kann: ist `1975` viersilbig oder
  achtsilbig?
- **`scripts/lib/haiku-syllables.mjs` — 5-7-5.** Braucht die Zählbibliotheken und
  bleibt deshalb aus dem App-Bundle heraus.

## Warum drei Zähler

Für Deutsch gibt es nichts Fertiges. Die englischen Haiku-Validatoren zählen über
das CMU-Aussprachewörterbuch; die deutschen Silbenzähler-Webtools sind
unbelegte Vokalgruppen-Heuristiken. Der verbreitetste Denkfehler ist,
**Silbentrennung für Silbenzählung** zu halten: TeX-Muster (`hypher`, `pyphen`)
trennen mit `lefthyphenmin=2` und lassen kurze Wortanfänge grundsätzlich
ungetrennt, weshalb `über`, `Atem`, `oder`, `Ecke` dort einsilbig sind.

Gemessen an 147 handgezählten Zeilen (dem 49er-Batch vom 2026-09-03):

| Zähler | Treffer | blind bei |
|---|---|---|
| Regelzähler (eigen, Vokalkerne) | 146/147 (99,3 %) | Lehnwörtern (`Code`, `Team`) |
| espeak-ng WASM (IPA-Kerne) | 143/147 (97,3 %) | `-tion`, Lücken der IPA-Tabelle |
| hypher (TeX-Muster) | 138/147 (93,9 %) | kurzen Wörtern |

Die Fehler liegen an verschiedenen Stellen, deshalb entscheidet die **Mehrheit**.
Gegenprobe des Regelzählers auf 5.351 unabhängigen Korpuswörtern: 99,12 %.

Zwei Fallen, die dabei aufgefallen sind und im Code stehen:

- espeak schreibt `?`, wo seine IPA-Tabelle eine Lücke hat (deutsches /ʊɐ̯/:
  `Lurch`, `Wurf`, `Kurve`). Das als 0 zu zählen wäre die schlimmste Antwort;
  `nucleiFromIpa()` liefert dann `null`, und der Zähler enthält sich.
- Das Argument `-b=1` ist **kein** gültiges espeak-Flag. Mit ihm liest espeak
  UTF-8 als Latin-1 und buchstabiert jeden Umlaut aus (`Mütter` wird zu
  „em, A-Tilde, ein Viertel, TT, ER"). Ohne das Flag stimmt die Kodierung.

## Fail closed

Kommt keine Mehrheit zustande, gibt es **kein Ergebnis**, sondern einen Abbruch,
der das Wort benennt. Das ist der Sinn der Sache: lieber ein Lexikoneintrag zu
viel als ein ungeprüftes Haiku in der Datenbank. Im Bestand betrifft das 24 von
3.065 Haikus, in den 49 frischen kein einziges.

## Das Lexikon

`scripts/lib/haiku-lexicon.json` schlägt alle drei Zähler. Eintragen, wenn die
Mehrheit nachweislich irrt oder gar keine zustande kommt. Konvention:
**Silbenzahl nach Duden-Worttrennung** (`Me|di|en` = 3, `Li|nie` = 2,
`Mo|sa|ik` = 3), Schlüssel kleingeschrieben, Anlass in `_herkunft` vermerken.

Der bisher einzige Grund für Einträge ist eine Klasse, die keine Regel greifen
kann: `ai` ist einheimisch ein Diphthong (`Mai`, `Kaiser`), im Lehnwort aber ein
Hiat (`Mo-sa-ik`, `Ko-ka-in`). `ui` dagegen ist außer in `pfui` immer ein Hiat,
das steht als Regel im Zähler.

## Wo es greift

| Ort | Verhalten |
|---|---|
| `session-pipeline.ts apply` (In-Chat) | **Exit 1** vor dem UPDATE, listet Zeile, Silbenzahl und Wortzerlegung |
| `lib/server/analysis/batch.ts` (Nachtlauf) | strukturell kaputtes Haiku wird verworfen (`haiku = NULL`) statt gespeichert; Zahl im `complete`-Frame als `haiku_rejected` |
| `npm run haiku-audit -- --target=prod` | Bericht über den Bestand, `--strict` macht daraus ein Gate |
| `npm test` | `lib/shared/haiku.test.ts`, `scripts/lib/haiku-syllables.test.mjs` |

Der Nachtlauf bricht bewusst **nicht** ab: die Bewertung ist teuer erkauft, das
Haiku ist Beigabe. Ein falsches Haiku ist aber schlechter als keines, weil es von
einem richtigen nicht zu unterscheiden ist.

## Offen

Der Altbestand `opus-4.7-session` hat 1.324 beanstandete Haikus. Sie zu heilen
hieße, sie neu zu schreiben; das war nicht Teil des Auftrags und braucht eine
Freigabe.
