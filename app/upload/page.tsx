'use client';

import { CsvUploadZone } from '@/components/csv-upload-zone';

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload Publications</h1>
        <p className="text-neutral-500">
          Import OeAW publications from a CSV file. Supports the standard HeboWebDB export format.
        </p>
      </div>

      <CsvUploadZone />

      <div className="rounded-lg bg-neutral-100 p-4 text-sm text-neutral-600 space-y-2">
        <p className="font-medium">Expected CSV Format</p>
        <p>
          The CSV should contain columns: <code className="bg-white px-1 rounded text-xs">original_title</code>,{' '}
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
          Deduplication is automatic: publications with matching titles, DOIs, or UIDs will be skipped.
        </p>
      </div>
    </div>
  );
}
