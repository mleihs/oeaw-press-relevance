# scripts/archive/

Einmal-Skripte, nur Historie. Nichts hier wird von `package.json`, der CI
oder anderen Skripten referenziert; die Dateien bleiben als Nachvollzug
vergangener Aufräum- bzw. Migrationsaktionen liegen.

- `cleanup-emdash-prod.mjs` — einmalige Em-Dash-Bereinigung der
  LLM-Textfelder auf prod (die laufende Regel sitzt in ESLint +
  `scripts/check-em-dashes.sh`).
- `analyze-capybara-source.mjs` / `preprocess-capybara-alpha.mjs` —
  Asset-Vorverarbeitung für die früheren Capybara-Grafiken.
- `sync-missing-pubs-to-prod.mjs` — **deaktiviert seit 2026-07-31** (Guard
  bricht ab): diffte über `publications.id`; seit prod-first haben local und
  prod verschiedene UUIDs, Abgleich muss über `webdb_uid` laufen (siehe
  `docs/WEBDB_IMPORT.md`).
