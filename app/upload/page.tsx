'use client';

import { CsvUploadZone } from '@/components/csv-upload-zone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

const CSV_COLUMNS = [
  { name: 'original_title', required: true, description: 'Titel der Publikation' },
  { name: 'lead_author', required: false, description: 'Erstautor(in)' },
  { name: 'summary_en', required: false, description: 'Zusammenfassung (Englisch)' },
  { name: 'summary_de', required: false, description: 'Zusammenfassung (Deutsch)' },
  { name: 'doi_link', required: false, description: 'DOI-Link (z.B. 10.1234/...)' },
  { name: 'pub_date', required: false, description: 'Veröffentlichungsdatum' },
  { name: 'type', required: false, description: 'Publikationstyp (z.B. Journal Article)' },
  { name: 'open_access', required: false, description: 'Open Access Status' },
  { name: 'organizational_units', required: false, description: 'Institut/Abteilung' },
];

const TEMPLATE_CSV = `original_title,lead_author,summary_en,summary_de,doi_link,pub_date,type,open_access,organizational_units
"Climate Change Impact on Alpine Ecosystems","Maria Berger","A study examining the effects of rising temperatures on alpine flora and fauna in the Austrian Alps.","Eine Studie über die Auswirkungen steigender Temperaturen auf die alpine Flora und Fauna in den österreichischen Alpen.","10.1234/alpine-2025","2025-03-15","Journal Article","oa_gold","Institut für Ökologie"
"Byzantine Manuscripts in Digital Archives","Thomas Müller","Digital preservation techniques for medieval manuscripts from the Byzantine period.","Digitale Konservierungstechniken für mittelalterliche Handschriften aus der byzantinischen Periode.","10.5678/byzantine-2024","2024-11-20","Book Chapter","nicht_oacc","Institut für Mittelalterforschung"
"Quantum Computing Applications in Cryptography","Anna Schmidt","","Neue Ansätze zur quantensicheren Verschlüsselung.","10.9012/quantum-2025","2025-01-08","Conference Paper","oa_preprint","Institut für Quantenoptik"`;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'storyscout-vorlage.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Publikationen importieren</h1>
        <p className="text-neutral-500">
          ÖAW-Publikationen aus einer CSV-Datei importieren. Unterstützt das Standard-HeboWebDB-Exportformat.
        </p>
      </div>

      <CsvUploadZone />

      {/* CSV format documentation */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Erwartetes CSV-Format</CardTitle>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Vorlage herunterladen
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="p-2 text-left font-medium">Spalte</th>
                  <th className="p-2 text-left font-medium">Pflicht</th>
                  <th className="p-2 text-left font-medium">Beschreibung</th>
                </tr>
              </thead>
              <tbody>
                {CSV_COLUMNS.map((col) => (
                  <tr key={col.name} className="border-t">
                    <td className="p-2">
                      <code className="bg-neutral-100 px-1.5 py-0.5 rounded text-xs font-mono">{col.name}</code>
                    </td>
                    <td className="p-2 text-xs">
                      {col.required ? (
                        <span className="text-red-600 font-medium">Ja</span>
                      ) : (
                        <span className="text-neutral-400">Nein</span>
                      )}
                    </td>
                    <td className="p-2 text-neutral-600">{col.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-500">
            Deduplizierung erfolgt automatisch: Publikationen mit übereinstimmenden Titeln, DOIs oder UIDs werden übersprungen.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
