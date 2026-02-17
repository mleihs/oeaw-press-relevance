import Papa from 'papaparse';
import { PublicationInsert } from './types';
import { PUBLICATION_TYPE_MAP, OA_TRUE_VALUES } from './constants';

interface CsvRow {
  original_title?: string;
  summary_en?: string;
  summary_de?: string;
  doi_link?: string;
  website_link?: string;
  download_link?: string;
  lead_author?: string;
  open_access?: string;
  pub_date?: string;
  type?: string;
  organizational_units?: string;
  citation_de?: string;
  citation_en?: string;
  uid?: string;
  [key: string]: string | undefined;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function parseOpenAccess(value: string | undefined): { isOa: boolean; oaType: string | null } {
  if (!value || value.length > 30) return { isOa: false, oaType: null };
  const trimmed = value.trim();
  if (OA_TRUE_VALUES.has(trimmed)) {
    return { isOa: true, oaType: trimmed };
  }
  return { isOa: false, oaType: null };
}

function parsePublishedDate(pubDate: string | undefined): string | null {
  if (!pubDate) return null;
  const trimmed = pubDate.trim();
  if (!trimmed || trimmed === '0') return null;

  // Unix timestamp (seconds)
  const ts = parseInt(trimmed, 10);
  if (!isNaN(ts) && ts > 0) {
    const date = new Date(ts * 1000);
    if (date.getFullYear() >= 1900 && date.getFullYear() <= 2100) {
      return date.toISOString().split('T')[0];
    }
  }
  return null;
}

function cleanText(text: string | undefined): string | null {
  if (!text) return null;
  const cleaned = text.replace(/\x00/g, '').trim();
  return cleaned || null;
}

export interface ParseResult {
  publications: PublicationInsert[];
  errors: string[];
  totalRows: number;
  skippedRows: number;
}

export function parseCsvFile(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    const publications: PublicationInsert[] = [];
    const errors: string[] = [];
    let totalRows = 0;
    let skippedRows = 0;

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'utf-8',
      transformHeader: (header: string) => header.trim().replace(/^\uFEFF/, ''),
      complete: (results) => {
        totalRows = results.data.length;

        for (const row of results.data) {
          try {
            const title = cleanText(row.original_title);
            if (!title) {
              skippedRows++;
              continue;
            }

            const truncatedTitle = title.substring(0, 500);
            const typeCode = row.type?.trim() || '0';
            const pubType = PUBLICATION_TYPE_MAP[typeCode] || 'Other';
            const { isOa, oaType } = parseOpenAccess(row.open_access);

            const summaryEn = cleanText(row.summary_en);
            const summaryDe = cleanText(row.summary_de);
            const abstract = summaryEn || summaryDe || null;

            const citationDe = cleanText(row.citation_de);
            const citationEn = cleanText(row.citation_en);
            const citation = citationEn || citationDe || null;
            const cleanedCitation = citation ? stripHtml(citation) : null;

            const doi = cleanText(row.doi_link) || null;
            const websiteLink = cleanText(row.website_link);
            const downloadLink = cleanText(row.download_link);
            const url = websiteLink || downloadLink || null;

            const pub: PublicationInsert = {
              title: truncatedTitle,
              authors: cleanText(row.lead_author),
              abstract,
              doi,
              published_at: parsePublishedDate(row.pub_date),
              publication_type: pubType,
              institute: cleanText(row.organizational_units),
              open_access: isOa,
              oa_type: oaType,
              url,
              citation: cleanedCitation,
              csv_uid: cleanText(row.uid),
            };

            publications.push(pub);
          } catch (err) {
            skippedRows++;
            errors.push(`Row error: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        if (results.errors.length > 0) {
          for (const err of results.errors.slice(0, 10)) {
            errors.push(`CSV parse error at row ${err.row}: ${err.message}`);
          }
        }

        resolve({ publications, errors, totalRows, skippedRows });
      },
      error: (err: Error) => {
        errors.push(`CSV parse failed: ${err.message}`);
        resolve({ publications, errors, totalRows: 0, skippedRows: 0 });
      },
    });
  });
}

export function deduplicatePublications(
  newPubs: PublicationInsert[],
  existingTitles: Set<string>,
  existingDois: Set<string>,
  existingUids: Set<string>
): { unique: PublicationInsert[]; duplicateCount: number } {
  const seenTitles = new Set<string>();
  const seenDois = new Set<string>();
  const unique: PublicationInsert[] = [];
  let duplicateCount = 0;

  for (const pub of newPubs) {
    const titleKey = pub.title.toLowerCase();
    const doiKey = pub.doi?.toLowerCase() || '';
    const uidKey = pub.csv_uid || '';

    // Check against existing DB records
    if (existingTitles.has(titleKey)) { duplicateCount++; continue; }
    if (doiKey && existingDois.has(doiKey)) { duplicateCount++; continue; }
    if (uidKey && existingUids.has(uidKey)) { duplicateCount++; continue; }

    // Check within current batch
    if (seenTitles.has(titleKey)) { duplicateCount++; continue; }
    if (doiKey && seenDois.has(doiKey)) { duplicateCount++; continue; }

    seenTitles.add(titleKey);
    if (doiKey) seenDois.add(doiKey);
    unique.push(pub);
  }

  return { unique, duplicateCount };
}
