'use client';

import { useState, Fragment } from 'react';
import { useApiQuery } from '@/lib/use-api-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/loading-state';
import { Newspaper, ExternalLink, AlertCircle, ChevronDown, ChevronUp, Users } from 'lucide-react';
import Link from 'next/link';
import type { PressRelease } from '@/lib/types';

interface OrphansResponse {
  press_releases: PressRelease[];
  total: number;
}

export default function PressReleasesPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading, error } = useApiQuery<OrphansResponse>(
    ['press-releases', { orphans: true }],
    '/api/press-releases?orphans=true',
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

  const orphans = data?.press_releases ?? [];
  const enrichedCount = orphans.filter((o) => o.enrichment_status === 'enriched').length;
  const partialCount = orphans.filter((o) => o.enrichment_status === 'partial').length;

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Newspaper className="h-6 w-6 text-emerald-600" />
          Externe Pressemitteilungen
        </h1>
        <p className="text-neutral-500 text-sm mt-1">
          {orphans.length} Pressemitteilungen der ÖAW-Hauptseite mit DOI-Verweis, für die der
          zugehörige Eintrag in der Publications-Datenbank fehlt.
          {enrichedCount > 0 && (
            <span className="ml-2 text-neutral-400">
              Davon {enrichedCount} mit vollständig angereicherten Metadaten,{' '}
              {partialCount} partiell angereichert.
            </span>
          )}
        </p>
      </div>

      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Warum erscheinen diese Einträge hier statt in /publications?</p>
            <p className="mt-1 text-amber-800">
              Die ÖAW hat über die folgenden Studien Pressemeldungen veröffentlicht. Die zugehörige
              Publikation ist jedoch nicht in der Publications-Datenbank verzeichnet, da die WebDB
              nicht alle ÖAW-Veröffentlichungen vollständig abbildet. In der überwiegenden Mehrzahl
              der Fälle ist mindestens eine ÖAW-zugehörige Person an der Studie beteiligt, häufig
              als Lead-Author, oft auch als Co-Author. Die fehlende Erfassung in der WebDB lässt
              sich auf mehrere Faktoren zurückführen: das Paper ist nach dem letzten Datenbank-Sync
              erschienen, das Institut hat es noch nicht eingepflegt, oder die ÖAW-Beteiligung
              wurde im Eintrag nicht vermerkt. Die hier dargestellten Metadaten stammen aus den
              externen Quellen OpenAlex und CrossRef. Sobald ein entsprechender Eintrag in die
              Publications-Datenbank importiert wird, erfolgt die Zuordnung automatisiert über
              die Funktion <code>promote_press_release_orphans()</code> am Ende des
              Import-Prozesses <code>webdb-import.mjs</code>. Der Datensatz wird dann aus dieser
              Übersicht entfernt.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b">
              <tr>
                <th className="p-3 text-left font-medium w-8"></th>
                <th className="p-3 text-left font-medium">Datum</th>
                <th className="p-3 text-left font-medium">Lang</th>
                <th className="p-3 text-left font-medium">News-Titel / Paper</th>
                <th className="p-3 text-left font-medium">Authors / Journal</th>
                <th className="p-3 text-right font-medium">Links</th>
              </tr>
            </thead>
            <tbody>
              {orphans.map((o) => {
                const isExpanded = expandedId === o.id;
                const hasDetail = !!(o.abstract || o.paper_title || (o.authors && o.authors.length));
                return (
                  <Fragment key={o.id}>
                    <tr
                      className={`border-t hover:bg-neutral-50 ${hasDetail ? 'cursor-pointer' : ''}`}
                      onClick={() => hasDetail && setExpandedId(isExpanded ? null : o.id)}
                    >
                      <td className="p-3">
                        {hasDetail && (
                          <span className="text-neutral-400">
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap text-xs">
                        {o.released_at ?? <span className="text-neutral-400">–</span>}
                        {o.paper_year && o.released_at && o.paper_year !== Number(o.released_at.slice(0, 4)) && (
                          <div className="text-[10px] text-neutral-400">Paper: {o.paper_year}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {o.lang ?? '?'}
                        </Badge>
                      </td>
                      <td className="p-3 max-w-md">
                        <div className="font-medium">{o.news_title ?? '–'}</div>
                        {o.paper_title && o.paper_title !== o.news_title && (
                          <div className="text-xs text-neutral-500 mt-1 italic line-clamp-2">
                            {o.paper_title}
                          </div>
                        )}
                      </td>
                      <td className="p-3 max-w-xs text-xs">
                        {o.oeaw_author_matches && o.oeaw_author_matches.length > 0 && (
                          <div className="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[10px] font-medium mb-1">
                            <Users className="h-2.5 w-2.5" />
                            {o.oeaw_author_matches.length} ÖAW
                          </div>
                        )}
                        {o.authors && o.authors.length > 0 && (
                          <div className="text-neutral-700 line-clamp-1">
                            {o.authors.slice(0, 2).join(', ')}
                            {o.authors.length > 2 && (
                              <span className="text-neutral-400"> +{o.authors.length - 2}</span>
                            )}
                          </div>
                        )}
                        {o.journal && (
                          <div className="text-neutral-500 italic line-clamp-1 mt-0.5">{o.journal}</div>
                        )}
                        {!o.authors?.length && !o.journal && (
                          <span className="text-neutral-300">–</span>
                        )}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <a
                          href={`https://doi.org/${o.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-neutral-500 hover:text-brand text-xs mr-3"
                        >
                          DOI
                        </a>
                        <a
                          href={o.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 hover:underline text-xs"
                        >
                          Presse <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                    {isExpanded && hasDetail && (
                      <tr className="border-t bg-neutral-50/50">
                        <td colSpan={6} className="p-4">
                          <div className="space-y-3 max-w-4xl">
                            {o.paper_title && (
                              <div>
                                <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Paper-Titel</h4>
                                <p className="text-sm font-medium">{o.paper_title}</p>
                              </div>
                            )}
                            {o.oeaw_author_matches && o.oeaw_author_matches.length > 0 && (
                              <div>
                                <h4 className="text-xs font-medium text-brand uppercase mb-1 inline-flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  Wahrscheinliche ÖAW-Beteiligung ({o.oeaw_author_matches.length})
                                </h4>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {o.oeaw_author_matches.map((m) => (
                                    <Link
                                      key={m.person_id}
                                      href={`/persons/${m.person_id}`}
                                      className="inline-flex items-center gap-1 rounded-md bg-brand/10 text-brand hover:bg-brand/20 px-2 py-1 text-xs font-medium"
                                    >
                                      {m.name}
                                    </Link>
                                  ))}
                                </div>
                                <p className="text-[10px] text-neutral-500 mt-1">
                                  Die Zuordnung basiert auf einem Abgleich von Nachname und
                                  Vornamen-Initial gegen die <code>persons</code>-Tabelle und
                                  erfordert eine manuelle Verifikation.
                                </p>
                              </div>
                            )}
                            {o.authors && o.authors.length > 0 && (
                              <div>
                                <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">
                                  Alle Autor:innen ({o.authors.length})
                                </h4>
                                <p className="text-sm text-neutral-700">{o.authors.join(', ')}</p>
                              </div>
                            )}
                            {o.journal && (
                              <div>
                                <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Journal</h4>
                                <p className="text-sm">
                                  {o.journal}
                                  {o.paper_year && <span className="text-neutral-500"> ({o.paper_year})</span>}
                                </p>
                              </div>
                            )}
                            {o.abstract && (
                              <div>
                                <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Abstract</h4>
                                <p className="text-sm leading-relaxed text-neutral-700 whitespace-pre-wrap">{o.abstract}</p>
                              </div>
                            )}
                            {o.keywords && o.keywords.length > 0 && (
                              <div>
                                <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Keywords</h4>
                                <div className="flex flex-wrap gap-1">
                                  {o.keywords.map((k, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">{k}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="flex gap-3 pt-2 text-xs">
                              <a
                                href={`https://doi.org/${o.doi}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand hover:underline inline-flex items-center gap-1"
                              >
                                DOI <ExternalLink className="h-3 w-3" />
                              </a>
                              {o.openalex_id && (
                                <a
                                  href={`https://openalex.org/works/${o.openalex_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-brand hover:underline inline-flex items-center gap-1"
                                >
                                  OpenAlex <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                              <a
                                href={o.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-700 hover:underline inline-flex items-center gap-1"
                              >
                                ÖAW-Pressemitteilung <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {orphans.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-500">
                    Keine ungebundenen Pressemitteilungen vorhanden. Alle DOIs sind in der
                    Publications-Datenbank zugeordnet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-neutral-500">
        Quelle: TYPO3 <code>tx_news_domain_model_news.event_information</code> (Kategorien 64+1748).
        Anreicherung via OpenAlex/CrossRef/S2/Unpaywall+PDF per <code>npm run enrich-orphans</code>.
      </p>
    </div>
  );
}
