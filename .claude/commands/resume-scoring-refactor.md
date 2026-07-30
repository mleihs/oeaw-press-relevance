---
description: Aufräum-Arbeit an der In-Chat-Bewertung fortsetzen (Skript härten, Doku zusammenziehen)
---

Setze die Aufräum-Arbeit an der In-Chat-Bewertung fort.

**Lies zuerst `docs/RESUME_INCHAT_SCORING_REFACTOR.md` vollständig.** Dort steht
der komplette Plan mit allen Messwerten — sie wurden am 2026-07-30 mit vollem
Kontext erhoben, damit du sie nicht neu herleiten musst. Insbesondere Zeilen-
nummern, Referenzsuchen und die Härtungs-Vergleichstabelle sind belegt, nicht
geschätzt.

Danach: Stand feststellen (`git log --oneline -5`, `git status`), das nächste
offene Arbeitspaket identifizieren und dort weitermachen. Der Plan hat drei
Pakete — A (Skript härten), B (Doku zusammenziehen), C (`/bewerten` verschlanken)
— und einen Abschnitt „Fertig ist es, wenn".

Drei Dinge, die man leicht falsch macht:

- **Nur aus `lib/shared/**` importieren, nie aus `lib/server/**`.** Ein
  `import 'server-only'` bricht den tsx-Skriptpfad.
- **`PG_DATABASE_URL` muss als Override erhalten bleiben.** Andere Skripte
  (u. a. `push-analysis-to-prod.mjs`) hängen daran.
- **Es gibt keine Tests auf `session-pipeline.mjs`.** Die Verifikation im Plan
  (8 Punkte) ist deshalb nicht optional, und Punkt 5 ist der eigentliche Beweis:
  `candidates --target=prod` muss ohne jede Vorbereitungszeile laufen.

Prod ist kanonisch. Schreibende Läufe erst nach einem Dry-run, dessen Vorschau du
gelesen hast.
