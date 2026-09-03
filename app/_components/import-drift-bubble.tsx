'use client';

import { InfoBubble } from '@/components/info-bubble';
import type { ImportDrift, DriftSample } from '@/lib/server/ingest/drift';

// Die Drift-Blase neben „WebDB-Stand".
//
// Drift heisst: der naechtliche Export liefert eine Verknuepfung, deren
// Gegenstueck bei uns nicht existiert -- meistens eine Autorenschaft, deren
// Personensatz der Export selbst nie mitgeliefert hat. Solche Verknuepfungen
// lassen sich nicht schreiben und fallen weg; die Publikation kommt an, aber
// ohne diese Person. Bis 2026-08-26 stand diese Zahl ausschliesslich im
// ingest_runs-Journal und war in der Oberflaeche nirgends zu sehen.

const LABEL: Record<DriftSample['missing'], string> = {
  person: 'Person fehlt',
  orgunit: 'Organisationseinheit fehlt',
  publication: 'Publikation fehlt',
  both: 'beide Seiten fehlen',
};

function sampleKey(s: DriftSample): string {
  return `${s.publicationWebdbUid}-${s.personWebdbUid ?? s.orgunitWebdbUid ?? 'x'}`;
}

export function ImportDriftBubble({ drift }: { drift: ImportDrift }) {
  const parts = [
    drift.personLinkOrphans > 0 ? `${drift.personLinkOrphans}× Autorenschaft` : null,
    drift.orgunitLinkOrphans > 0 ? `${drift.orgunitLinkOrphans}× Zuordnung zu einer Einheit` : null,
    drift.unresolvedLookups > 0 ? `${drift.unresolvedLookups}× unbekannte Typangabe` : null,
  ].filter(Boolean);

  return (
    <InfoBubble
      size="sm"
      side="bottom"
      content={{
        title: `${drift.total} unvollständige Verknüpfung${drift.total === 1 ? '' : 'en'}`,
        body: (
          <>
            <p className="leading-relaxed">
              Der Import vom {drift.appliedAt ?? 'letzten Lauf'} hat Verknüpfungen mitgeliefert,
              deren Gegenstück in unserem Bestand fehlt: {parts.join(', ')}. Diese Verbindungen
              lassen sich nicht anlegen und entfallen. Die Publikation selbst ist da, ihr fehlt
              nur die betroffene Person oder Zuordnung.
            </p>
            <p className="mt-2 leading-relaxed">
              Häufigste Ursache ist der Export selbst: er verweist auf Personensätze, die er nie
              mitliefert.
            </p>
          </>
        ),
        example: drift.samples.length ? (
          <ul className="space-y-0.5 font-mono text-2xs">
            {drift.samples.map((s) => (
              <li key={sampleKey(s)}>
                Pub {s.publicationWebdbUid}
                {s.personWebdbUid ? ` · Person ${s.personWebdbUid}` : ''}
                {s.orgunitWebdbUid ? ` · Einheit ${s.orgunitWebdbUid}` : ''}
                {`: ${LABEL[s.missing]}`}
              </li>
            ))}
            {drift.more > 0 ? <li className="opacity-70">und {drift.more} weitere</li> : null}
          </ul>
        ) : undefined,
        note: drift.alarming
          ? `Diese Nacht lag über der Alarmschwelle von ${drift.threshold} Fällen. Ein vollständiger Abgleich mit der WebDB ist fällig.`
          : // Den Personen-Satz nur zeigen, wenn es auch Personen-Waisen gibt —
            // besteht die Drift nur aus Orgunit-/Typ-Fällen, erklärte er nichts.
            drift.personLinkOrphans > 0
            ? `Fehlende Autorenschaften sind die Personenlücke der WebDB selbst und zählen nicht als Alarm. Für den Rest gilt: Alarm ab ${drift.threshold} Fällen in einer Nacht.`
            : `Alarm ab ${drift.threshold} Fällen in einer Nacht.`,
      }}
    />
  );
}
