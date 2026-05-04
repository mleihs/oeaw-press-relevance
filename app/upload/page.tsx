'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, FileArchive, Terminal, Info, RefreshCcw } from 'lucide-react';
import { getApiHeaders } from '@/lib/settings-store';

interface SyncCounts {
  publications: number;
  persons: number;
  orgunits: number;
  projects: number;
  lectures: number;
  extunits: number;
  oestat6: number;
  person_publications: number;
  orgunit_publications: number;
  publication_projects: number;
  last_synced: string | null;
}

export default function ImportPage() {
  const [counts, setCounts] = useState<SyncCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/webdb/status', { headers: getApiHeaders() });
      if (!res.ok) throw new Error('Status nicht abrufbar');
      setCounts(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">WebDB-Import</h1>
        <p className="text-neutral-500">
          Die Datenquelle für die Plattform ist der vollständige WebDB-Export
          (Typo3 / MySQL). Publikationen, Personen, Organisationseinheiten,
          Projekte, Vorträge und Verknüpfungen werden in Postgres gespiegelt.
        </p>
      </div>

      {/* Source format card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileArchive className="h-4 w-4 text-[#0047bb]" />
            Quellformat
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-neutral-600">
          <p>
            Adminer-/mysqldump-Export der WebDB-Datenbank, gepackt als
            <code className="mx-1 rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs">
              .sql.gz
            </code>
            (typisch ~100 MB komprimiert, ~660 MB entpackt). Erwartete Tabellen
            beginnen mit
            <code className="mx-1 rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs">
              tx_hebowebdb_domain_model_*
            </code>
            sowie die <code className="mx-1 rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs">_mm</code>{' '}
            Junction-Tabellen.
          </p>
          <p>
            Beim Import werden Typo3-Versions- und Mirror-Artefakte ignoriert
            (<code className="font-mono text-xs">t3ver_*</code>,{' '}
            <code className="font-mono text-xs">*_mirror</code>), gelöschte
            Datensätze (<code className="font-mono text-xs">deleted=1</code>)
            übersprungen, UTF-8-mb4 erhalten und Unix-Timestamps in
            Postgres-Datentypen konvertiert.
          </p>
        </CardContent>
      </Card>

      {/* How to run */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="h-4 w-4 text-[#0047bb]" />
            Import ausführen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal list-inside space-y-2 text-neutral-700">
            <li>
              Dump entpacken (z. B. nach{' '}
              <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs">/tmp/webdb/webdb_dump.sql</code>).
            </li>
            <li>
              Temporären MySQL-Container starten und Dump einlesen
              (<code className="font-mono text-xs">docker run -d -p 54499:3306 mysql:8.4</code>;{' '}
              <code className="font-mono text-xs">mysql webdb &lt; webdb_dump.sql</code>).
            </li>
            <li>
              ETL-Script ausführen:
              <pre className="mt-1 rounded bg-neutral-900 p-3 font-mono text-xs text-neutral-100">node scripts/webdb-import.mjs</pre>
            </li>
            <li>Dauer: ca. 1 Minute für ~37k Publikationen + Junctions.</li>
          </ol>
          <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Der Import wischt aktuell die <code>publications</code>-Tabelle und
              lädt vollständig neu. Eigene Analyse-Daten gehen dabei lokal
              verloren — sie können separat aus Production via DOI-Match
              wiederhergestellt werden.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Current state */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-[#0047bb]" />
            Aktueller Datenstand
          </CardTitle>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-neutral-50"
          >
            <RefreshCcw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            aktualisieren
          </button>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : counts ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label="Publikationen" value={counts.publications} />
              <Stat label="Personen" value={counts.persons} />
              <Stat label="Organisationseinheiten" value={counts.orgunits} />
              <Stat label="Externe Einheiten" value={counts.extunits} />
              <Stat label="Projekte" value={counts.projects} />
              <Stat label="Vorträge" value={counts.lectures} />
              <Stat label="Person↔Pub Links" value={counts.person_publications} />
              <Stat label="Inst↔Pub Links" value={counts.orgunit_publications} />
              <Stat label="Pub↔Projekt Links" value={counts.publication_projects} />
              <Stat label="ÖSTAT6-Codes" value={counts.oestat6} />
              {counts.last_synced && (
                <div className="col-span-2 sm:col-span-3 mt-2 pt-2 border-t text-xs text-neutral-400">
                  Letzte Synchronisation:{' '}
                  {new Date(counts.last_synced).toLocaleString('de-AT')}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-neutral-400">Lade...</p>
          )}
        </CardContent>
      </Card>

      {/* What's new from this format */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Was das neue Format bringt</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-neutral-600">
            <li className="flex gap-2">
              <Badge className="bg-blue-100 text-blue-800 shrink-0">PR</Badge>
              <span><strong>Peer-reviewed-Flag</strong> aus der Quelle (54% aller Publikationen)</span>
            </li>
            <li className="flex gap-2">
              <Badge className="bg-purple-100 text-purple-800 shrink-0">PS</Badge>
              <span><strong>Popular-Science-Flag</strong> für 3.185 Publikationen — direktes Press-Relevanz-Signal</span>
            </li>
            <li className="flex gap-2">
              <Badge className="bg-amber-100 text-amber-800 shrink-0">★</Badge>
              <span><strong>Eigen-Highlights</strong> (mahighlight): rund 220 von den Autor:innen selbst markierte Pubs — meist Nicht-Mitglieder</span>
            </li>
            <li className="flex gap-2">
              <Badge variant="outline" className="shrink-0">DE/EN</Badge>
              <span><strong>Bilinguale Zusammenfassungen</strong> aus der Quelle (wo vorhanden) — keine LLM-Übersetzung mehr nötig</span>
            </li>
            <li className="flex gap-2">
              <Badge variant="outline" className="shrink-0">👥</Badge>
              <span><strong>Echte Personen-Datensätze</strong> mit E-Mail, ORCID, Bio, Forschungsfeldern (statt Autoren-Text)</span>
            </li>
            <li className="flex gap-2">
              <Badge variant="outline" className="shrink-0">🏛</Badge>
              <span><strong>Institute als Entitäten</strong> mit Akronymen, URLs und Hierarchie (statt Text)</span>
            </li>
            <li className="flex gap-2">
              <Badge variant="outline" className="shrink-0">📚</Badge>
              <span><strong>Projekte</strong> mit DE/EN-Zusammenfassungen, Förderungstyp, Laufzeiten, 439 aktive</span>
            </li>
            <li className="flex gap-2">
              <Badge variant="outline" className="shrink-0">🎤</Badge>
              <span><strong>30.509 Vorträge</strong> als neue Entitätsklasse (Keynotes, Named Lectures, popularwissenschaftliche)</span>
            </li>
            <li className="flex gap-2">
              <Badge variant="outline" className="shrink-0">🧭</Badge>
              <span><strong>ÖSTAT6-Klassifikation</strong> (1.411 Codes) — österreichische Wissenschaftstaxonomie als Themen-Spine</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border bg-neutral-50 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value.toLocaleString('de-AT')}</p>
    </div>
  );
}
