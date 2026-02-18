'use client';

import { CsvUploadZone } from '@/components/csv-upload-zone';

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Publikationen importieren</h1>
        <p className="text-neutral-500">
          OeAW-Publikationen aus einer CSV-Datei importieren. Unterstützt das Standard-HeboWebDB-Exportformat.
        </p>
      </div>

      <CsvUploadZone />

      <div className="rounded-lg bg-neutral-100 p-4 text-sm text-neutral-600 space-y-2">
        <p className="font-medium">Erwartetes CSV-Format</p>
        <p>
          Die CSV-Datei sollte folgende Spalten enthalten: <code className="bg-white px-1 rounded text-xs">original_title</code>,{' '}
          <code className="bg-white px-1 rounded text-xs">lead_author</code>,{' '}
          <code className="bg-white px-1 rounded text-xs">summary_en</code>,{' '}
          <code className="bg-white px-1 rounded text-xs">summary_de</code>,{' '}
          <code className="bg-white px-1 rounded text-xs">doi_link</code>,{' '}
          <code className="bg-white px-1 rounded text-xs">pub_date</code>,{' '}
          <code className="bg-white px-1 rounded text-xs">type</code>,{' '}
          <code className="bg-white px-1 rounded text-xs">open_access</code>,{' '}
          <code className="bg-white px-1 rounded text-xs">organizational_units</code>
        </p>
        <p>
          Deduplizierung erfolgt automatisch: Publikationen mit übereinstimmenden Titeln, DOIs oder UIDs werden übersprungen.
        </p>
      </div>
    </div>
  );
}
