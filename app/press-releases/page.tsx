'use client';

import Link from 'next/link';
import { useApiQuery } from '@/lib/use-api-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/loading-state';
import { Newspaper, ExternalLink, AlertCircle } from 'lucide-react';
import type { PressReleaseOrphan } from '@/app/api/press-releases/orphans/route';

interface OrphansResponse {
  orphans: PressReleaseOrphan[];
  total: number;
}

export default function PressReleasesPage() {
  const { data, isLoading, error } = useApiQuery<OrphansResponse>(
    ['press-releases-orphans'],
    '/api/press-releases/orphans',
  );

  if (isLoading) return <LoadingState label="Lade Pressemitteilungen ohne Pub-Match …" />;

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="p-6">
          <p className="text-red-600">Fehler: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const orphans = data?.orphans ?? [];

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Newspaper className="h-6 w-6 text-emerald-600" />
          Pressemitteilungen ohne Pub-Match
        </h1>
        <p className="text-neutral-500 text-sm mt-1">
          {orphans.length} ÖAW-Hauptseite-News mit DOI, deren Paper aber{' '}
          <span className="font-medium">nicht in unserer Publications-DB ist</span>{' '}
          (Co-Author-only oder noch nicht aus WebDB importiert).
        </p>
      </div>

      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Warum landen Pubs hier statt in /publications?</p>
            <p className="mt-1 text-amber-800">
              Die ÖAW hat über diese Studien Pressemeldungen veröffentlicht, aber das Paper selbst hat keinen
              ÖAW-Mitarbeiter:in als Lead-Author und ist deshalb nicht in WebDB. Sobald ein passendes Paper
              importiert wird, wird automatisch zugeordnet und der Orphan verschwindet.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b">
              <tr>
                <th className="p-3 text-left font-medium">Datum</th>
                <th className="p-3 text-left font-medium">Sprache</th>
                <th className="p-3 text-left font-medium">News-Titel</th>
                <th className="p-3 text-left font-medium">DOI</th>
                <th className="p-3 text-right font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {orphans.map((o) => (
                <tr key={o.id} className="border-t hover:bg-neutral-50">
                  <td className="p-3 whitespace-nowrap">
                    {o.press_release_at ?? <span className="text-neutral-400">–</span>}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {o.press_release_lang ?? '?'}
                    </Badge>
                  </td>
                  <td className="p-3 max-w-md">
                    <span className="font-medium">{o.news_title ?? '–'}</span>
                  </td>
                  <td className="p-3 font-mono text-xs text-neutral-600 max-w-xs truncate">
                    <a
                      href={`https://doi.org/${o.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline hover:text-brand"
                    >
                      {o.doi}
                    </a>
                  </td>
                  <td className="p-3 text-right">
                    <a
                      href={o.press_release_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 hover:underline text-xs"
                    >
                      Pressemitteilung <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
              {orphans.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-neutral-500">
                    Keine Orphan-Pressemitteilungen — alle DOIs sind in der Publications-DB zugeordnet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-neutral-500">
        Quelle: TYPO3 <code>tx_news_domain_model_news.event_information</code>, Kategorien
        ÖAW-Pressemeldungen (uid 64) + OeAW press release (uid 1748). Stand:{' '}
        {orphans[0] ? new Date(orphans[0].created_at).toLocaleDateString('de-AT') : '–'}.
      </p>
    </div>
  );
}
