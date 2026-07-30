---
description: Offene Arbeit aus dem aktuellen Resume aufnehmen (Bewerten in Batches, CI-Audit-Gate)
argument-hint: "[bewerten|ci] — ohne Angabe: Stand beider Teile prüfen und berichten"
---

Nimm die offene Arbeit aus **`docs/RESUME_BEWERTEN_UND_CI.md`** auf. Lies das
Dokument zuerst vollständig, es ist die Quelle der Wahrheit für Zuschnitt, Zahlen
und Reihenfolge.

Umfang: `$1`.

- `bewerten` → nur Teil 1. Läuft über `/bewerten`, Ablauf in
  `docs/INCHAT_SCORING.md`.
- `ci` → nur Teil 2, das Audit-Gate.
- ohne Angabe → **erst den Stand beider Teile messen, dann berichten und fragen.**
  Nicht raten, was dran ist: die Kandidaten-Pools können längst leer sein, und der
  CI-Umbau ist keine Nebenbei-Aufgabe.

Was weder im Resume noch im Code steht:

- **Die Pools zuerst zählen.** Beide standen am 2026-07-30 auf 0. Sind sie es
  noch, ist Teil 1 nichts zu tun, und das ist die richtige Antwort, kein Grund,
  den Altbestand per `--all` aufzumachen.
- **Teil 2 ist ein Umbau, kein Patch.** Wenn der Weg auf einen
  Dependency-Bump zusammenschrumpft oder auf `continue-on-error`, ist er falsch
  abgebogen; die Begründung dafür steht im Resume unter „Was ausdrücklich nicht
  der Weg ist". Das Gate muss am Ende nachweisbar rot werden können.
- **`npm audit fix` nicht blind laufen lassen.** Gemessen am 2026-07-30: es
  verschiebt das Problem in die eslint-Kette und endet bei neun high-Einträgen.
- **Ein Lockfile-Bump erreicht Prod.** Vercel und metaspots bauen aus dem Repo.
  Vor einem Dependency-Schritt wissen, dass das ein Deploy ist.

Wenn ein neueres Resume-Dokument dieses ersetzt, den Pfad oben hier mit ändern.
