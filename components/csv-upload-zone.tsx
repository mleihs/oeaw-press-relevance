'use client';

import { useCallback, useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { parseCsvFile, deduplicatePublications, ParseResult } from '@/lib/csv-parser';
import { PublicationInsert } from '@/lib/types';
import { getApiHeaders } from '@/lib/settings-store';
import { decodeHtmlTitle } from '@/lib/html-utils';
import { getSupabaseClient } from '@/lib/supabase';
import { loadSettings } from '@/lib/settings-store';

export function CsvUploadZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ inserted: number; errors: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setImportResult(null);
    setParseResult(null);

    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }

    try {
      const result = await parseCsvFile(file);
      setParseResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = useCallback(async () => {
    if (!parseResult) return;
    setImporting(true);
    setImportProgress(0);
    setError(null);

    try {
      // Fetch existing titles/DOIs for dedup
      const settings = loadSettings();
      const supabase = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey);

      const { data: existing } = await supabase
        .from('publications')
        .select('title, doi, csv_uid');

      const existingTitles = new Set((existing || []).map(p => (p.title || '').toLowerCase()));
      const existingDois = new Set((existing || []).filter(p => p.doi).map(p => (p.doi || '').toLowerCase()));
      const existingUids = new Set((existing || []).filter(p => p.csv_uid).map(p => p.csv_uid || ''));

      const { unique, duplicateCount } = deduplicatePublications(
        parseResult.publications,
        existingTitles,
        existingDois,
        existingUids
      );

      if (unique.length === 0) {
        setImportResult({ inserted: 0, errors: 0 });
        setImporting(false);
        if (duplicateCount > 0) {
          setError(`All ${duplicateCount} publications already exist in the database.`);
        }
        return;
      }

      // Import in chunks via API
      const chunkSize = 100;
      let totalInserted = 0;
      let totalErrors = 0;

      for (let i = 0; i < unique.length; i += chunkSize) {
        const chunk = unique.slice(i, i + chunkSize);
        setImportProgress(Math.round((i / unique.length) * 100));

        const response = await fetch('/api/publications/import', {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({ publications: chunk }),
        });

        const data = await response.json();
        if (data.inserted) totalInserted += data.inserted;
        if (data.errors) totalErrors += data.errors;
      }

      setImportProgress(100);
      setImportResult({
        inserted: totalInserted,
        errors: totalErrors,
      });

      if (duplicateCount > 0) {
        setError(`${duplicateCount} duplicates were skipped.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [parseResult]);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
          isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-neutral-300 bg-neutral-50 hover:border-neutral-400'
        }`}
      >
        <Upload className="mb-4 h-10 w-10 text-neutral-400" />
        <p className="mb-2 text-sm text-neutral-600">
          Drag & drop a CSV file here, or click to browse
        </p>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileInput}
          className="hidden"
          id="csv-file-input"
        />
        <Button variant="outline" asChild>
          <label htmlFor="csv-file-input" className="cursor-pointer">
            Choose File
          </label>
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="flex items-center gap-2 p-4">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            <span className="text-sm text-orange-700">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Parse result preview */}
      {parseResult && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              <span className="font-medium">
                {parseResult.publications.length} publications parsed
              </span>
              {parseResult.skippedRows > 0 && (
                <span className="text-sm text-neutral-500">
                  ({parseResult.skippedRows} rows skipped)
                </span>
              )}
            </div>

            {/* Preview table */}
            <div className="max-h-80 overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left font-medium">Title</th>
                    <th className="p-2 text-left font-medium">Authors</th>
                    <th className="p-2 text-left font-medium">Type</th>
                    <th className="p-2 text-left font-medium">Year</th>
                    <th className="p-2 text-left font-medium">DOI</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.publications.slice(0, 20).map((pub, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 max-w-xs truncate">{decodeHtmlTitle(pub.title)}</td>
                      <td className="p-2 max-w-[120px] truncate">{pub.authors || '-'}</td>
                      <td className="p-2 whitespace-nowrap">{pub.publication_type || '-'}</td>
                      <td className="p-2 whitespace-nowrap">
                        {pub.published_at?.slice(0, 4) || '-'}
                      </td>
                      <td className="p-2 max-w-[150px] truncate">{pub.doi || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parseResult.publications.length > 20 && (
                <div className="p-2 text-center text-sm text-neutral-500 bg-neutral-50">
                  ... and {parseResult.publications.length - 20} more
                </div>
              )}
            </div>

            {/* Import button */}
            {!importResult && (
              <div className="flex items-center gap-4">
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? 'Importing...' : `Import ${parseResult.publications.length} Publications`}
                </Button>
                {importing && (
                  <div className="flex-1">
                    <Progress value={importProgress} />
                  </div>
                )}
              </div>
            )}

            {/* Import result */}
            {importResult && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="text-sm">
                  <strong>{importResult.inserted}</strong> publications imported
                  {importResult.errors > 0 && (
                    <>, <strong className="text-red-600">{importResult.errors}</strong> errors</>
                  )}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
