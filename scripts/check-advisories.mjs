#!/usr/bin/env node
// Advisory-Gate. Ersetzt `npm audit --audit-level=high`, das genau einen Hebel
// hatte: einen globalen Severity-Schwellwert für alles. Als die postcss- und
// sharp-Advisories upstream auf high hochgestuft wurden, war der Hebel
// verbraucht und die Pipeline dauerhaft rot — wochenlang, wodurch sie einen
// echten Testfehler im RLS-Smoke-Test verdeckt hat. Ein Gate, das immer rot ist,
// hat negativen Wert; das ist der Defekt, den dieses Skript behebt.
//
// Die Achse ist deshalb nicht „wie schlimm", sondern „ist das gesichtet, und ist
// ein Fix überhaupt erreichbar". Jedes Advisory ab `floor` muss in
// scripts/advisory-policy.json stehen, mit Begründung und Sichtungsdatum.
//
// Rot bei genau drei Bedingungen:
//   1. Advisory ab `floor` ohne Policy-Eintrag       -> neu und ungesichtet
//   2. Policy-Eintrag mit verstrichenem `review_by`  -> erzwingt Neu-Sichtung
//   3. Policy-Eintrag, der auf nichts mehr passt     -> gegenstandslos, löschen
// Zusammen heißt das: grün nur, solange *jedes* akzeptierte Risiko aktuell
// begründet UND aktuell real ist. Ohne 2 verrottet die Datei still, ohne 3 wird
// sie ein Friedhof — derselbe Gedanke wie bei check-schema-drift.mjs.
//
// Heuristik by design, wie check-schema-drift.mjs mit seinen Regexen:
// - Bewertet werden nur *konkrete* Advisories (`via`-Objekte mit eigener
//   GHSA-ID). npm listet zusätzlich Pakete, die bloß „depends on vulnerable
//   versions of X" sind (`via` als String); die zählen an ihrem Ursprungspaket
//   und würden sonst Policy-Einträge ohne eigene Advisory-ID verlangen.
// - Severity kommt aus dem `via`-Objekt, nicht aus dem Paketeintrag. npm stuft
//   ein Paket auf das Maximum seiner Advisories hoch; hier soll ein moderates
//   Advisory unter einem high-Paket auch moderat bleiben.
// - `scope` ist ein Pfad aus npms `nodes` und damit brüchig: beim Dedup
//   verschieben sich diese Pfade. Bewusst trotzdem so, denn eine Ausnahme
//   „postcss hat ein XSS" würde sonst auch eine später hinzukommende *direkte*
//   Abhängigkeit auf ein verwundbares postcss mitakzeptieren. Bedingung 3 greift
//   auf Eintrags-, nicht auf Pfadebene, damit ein verschobener Pfad die CI nicht
//   aus nicht-sicherheitsrelevantem Grund rot macht; unpassende Pfade werden im
//   Erfolgsfall genannt, damit sie nicht unsichtbar veralten.
//
// Bewusst keine neue Dependency: audit-ci und better-npm-audit können das, aber
// sie bringen genau das mit, was das Gate prüfen soll — mehr transitive Pakete.
//
// Lokal: npm run check-advisories. CI: Step „Advisory gate" (required, kein
// continue-on-error). Exit 1 bei jeder der drei Bedingungen, sonst 0.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const policyPath = join(root, 'scripts', 'advisory-policy.json');
const policyRel = 'scripts/advisory-policy.json';

const SEVERITY = ['info', 'low', 'moderate', 'high', 'critical'];
const REQUIRED_FIELDS = ['advisory', 'package', 'scope', 'reason', 'review_by'];

/** GHSA-ID aus der Advisory-URL; `source` (npms numerische ID) als Rückfall. */
function advisoryId(via) {
  const fromUrl = typeof via.url === 'string' ? via.url.split('/').pop() : '';
  return fromUrl || `npm-source-${via.source}`;
}

const findingKey = (f) => `${f.advisory}@${f.package}`;

// ---------------------------------------------------------------- Policy lesen

let policy;
try {
  policy = JSON.parse(readFileSync(policyPath, 'utf8'));
} catch (err) {
  console.error(`${policyRel} ist nicht lesbar oder kein gültiges JSON: ${err.message}`);
  process.exit(1);
}

const floor = SEVERITY.indexOf(policy.floor);
if (floor < 0) {
  console.error(`${policyRel}: "floor" muss eines von ${SEVERITY.join(', ')} sein, ist aber ${JSON.stringify(policy.floor)}.`);
  process.exit(1);
}
const accepted = Array.isArray(policy.accepted) ? policy.accepted : [];

// ------------------------------------------------------------- npm audit lesen

// npm audit endet mit Exit 1, sobald es überhaupt etwas findet — das ist der
// Normalfall hier, deshalb wird der Status ignoriert und stdout ausgewertet.
let raw = '';
try {
  raw = execFileSync('npm', ['audit', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  raw = err.stdout ?? '';
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error('`npm audit --json` hat kein verwertbares JSON geliefert.');
  console.error('Meist heißt das: kein Netzzugang zur Registry oder node_modules fehlt (npm ci).');
  process.exit(1);
}

if (!report.vulnerabilities || typeof report.vulnerabilities !== 'object') {
  console.error('`npm audit --json` kennt kein Feld "vulnerabilities" — unerwartetes Report-Format.');
  console.error(`auditReportVersion: ${JSON.stringify(report.auditReportVersion)}. Dieses Gate erwartet Version 2.`);
  process.exit(1);
}

// Ein Advisory kann unter mehreren Paketeinträgen auftauchen; über den Key
// zusammenführen und die Pfade sammeln.
const findings = new Map();
for (const [name, entry] of Object.entries(report.vulnerabilities)) {
  for (const via of entry.via ?? []) {
    if (typeof via === 'string') continue; // indirekt, zählt am Ursprungspaket
    if (SEVERITY.indexOf(via.severity) < floor) continue;

    const finding = {
      advisory: advisoryId(via),
      package: via.name ?? name,
      severity: via.severity,
      title: via.title ?? '(ohne Titel)',
      nodes: new Set(entry.nodes ?? []),
    };
    const key = findingKey(finding);
    const known = findings.get(key);
    if (known) for (const node of finding.nodes) known.nodes.add(node);
    else findings.set(key, finding);
  }
}

// ------------------------------------------------------------ Policy anwenden

const today = new Date().toISOString().slice(0, 10);
const errors = [];
const covered = new Set();
const staleScopes = [];

accepted.forEach((entry, i) => {
  const label = `Eintrag #${i + 1} (${entry.advisory ?? 'ohne advisory'} / ${entry.package ?? 'ohne package'})`;

  const missing = REQUIRED_FIELDS.filter((f) => !entry[f]);
  if (missing.length > 0) {
    errors.push(`${label}: Pflichtfelder fehlen: ${missing.join(', ')}.`);
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.review_by)) {
    errors.push(`${label}: "review_by" muss YYYY-MM-DD sein, ist ${JSON.stringify(entry.review_by)}.`);
    return;
  }

  // Bedingung 2 — unabhängig davon, ob der Eintrag noch greift.
  if (entry.review_by < today) {
    errors.push(
      `${label}: Sichtungsdatum ${entry.review_by} ist verstrichen (heute ${today}).\n` +
        `    Erneut prüfen, ob ein Fix inzwischen erreichbar ist. Danach entweder upgraden\n` +
        `    und den Eintrag löschen, oder "review_by" mit aktualisierter "reason" neu setzen.`,
    );
  }

  const scopes = Array.isArray(entry.scope) ? entry.scope : [entry.scope];
  const hits = [...findings.values()].filter(
    (f) =>
      f.advisory === entry.advisory &&
      f.package === entry.package &&
      scopes.some((s) => f.nodes.has(s)),
  );

  // Bedingung 3 — die Ausnahme ist gegenstandslos.
  if (hits.length === 0) {
    errors.push(
      `${label}: passt auf kein aktuelles Advisory mehr.\n` +
        `    Entweder ist es behoben oder der Pfad hat sich verschoben. Eintrag löschen\n` +
        `    (bzw. "scope" korrigieren) — die Policy soll kein Friedhof werden.`,
    );
    return;
  }

  for (const hit of hits) {
    covered.add(findingKey(hit));
    for (const s of scopes) if (!hit.nodes.has(s)) staleScopes.push(`${label}: scope ${s}`);
  }
});

// Bedingung 1 — ungesichtet.
const unreviewed = [...findings.values()].filter((f) => !covered.has(findingKey(f)));
if (unreviewed.length > 0) {
  const lines = unreviewed.map(
    (f) =>
      `  - ${f.severity} ${f.package}: ${f.title}\n` +
      `    ${f.advisory}\n` +
      `    Pfade: ${[...f.nodes].join(', ')}`,
  );
  errors.unshift(
    `${unreviewed.length} Advisory/Advisories ab "${policy.floor}" ohne Eintrag in ${policyRel}:\n` +
      lines.join('\n') +
      `\n\n    Erst versuchen, es wegzuräumen: npm update <paket>, oder ein gezieltes\n` +
      `    "overrides" in package.json, wenn upstream pinnt. Nur wenn kein Fix erreichbar\n` +
      `    ist, einen Eintrag mit "advisory", "package", "scope" (Pfad aus der Liste oben),\n` +
      `    "reason" und "review_by" anlegen.\n` +
      `    Nicht: --audit-level senken, continue-on-error, oder npm audit fix --force.`,
  );
}

if (errors.length > 0) {
  console.error('Advisory-Gate rot:\n');
  console.error(errors.join('\n\n'));
  process.exit(1);
}

const nextReview = accepted.map((e) => e.review_by).sort()[0];
console.log(
  `Advisory-Gate OK: ${findings.size} Advisory/Advisories ab "${policy.floor}", ` +
    `alle durch ${accepted.length} gesichtete Ausnahme(n) gedeckt` +
    (nextReview ? `, nächste Sichtung fällig ${nextReview}.` : '.'),
);
for (const s of staleScopes) {
  console.log(`Hinweis: ${s} passt auf keinen aktuellen Pfad — beim nächsten Durchgang aufräumen.`);
}
