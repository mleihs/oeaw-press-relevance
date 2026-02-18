'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Publication } from '@/lib/types';
import { doiToUrl } from '@/lib/enrichment/doi-utils';
import { decodeHtmlTitle } from '@/lib/html-utils';
import { PressScoreBadge, ScoreBar } from './score-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LLM_MODELS } from '@/lib/constants';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

interface PublicationTableProps {
  publications: Publication[];
  showScores?: boolean;
  showEnrichment?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (column: string) => void;
}

function SortIcon({ column, sortBy, sortOrder }: { column: string; sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  if (sortBy !== column) {
    return <ArrowUpDown className="h-3 w-3 text-neutral-300" />;
  }
  return sortOrder === 'asc'
    ? <ArrowUp className="h-3 w-3 text-neutral-700" />
    : <ArrowDown className="h-3 w-3 text-neutral-700" />;
}

export function PublicationTable({ publications, showScores, showEnrichment, sortBy, sortOrder, onSort }: PublicationTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (publications.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500">
        Keine Publikationen gefunden.
      </div>
    );
  }

  const sortable = !!onSort;

  const headerClass = sortable
    ? 'p-3 text-left font-medium cursor-pointer select-none hover:bg-neutral-100 transition-colors'
    : 'p-3 text-left font-medium';

  return (
    <>
      {/* Desktop table — hidden below md */}
      <div className="hidden md:block overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="p-3 text-left font-medium w-8"></th>
              <th className={headerClass} onClick={() => onSort?.('title')}>
                <span className="inline-flex items-center gap-1">
                  Titel {sortable && <SortIcon column="title" sortBy={sortBy} sortOrder={sortOrder} />}
                </span>
              </th>
              <th className={headerClass} onClick={() => onSort?.('authors')}>
                <span className="inline-flex items-center gap-1">
                  Autoren {sortable && <SortIcon column="authors" sortBy={sortBy} sortOrder={sortOrder} />}
                </span>
              </th>
              <th className={headerClass} onClick={() => onSort?.('publication_type')}>
                <span className="inline-flex items-center gap-1">
                  Typ {sortable && <SortIcon column="publication_type" sortBy={sortBy} sortOrder={sortOrder} />}
                </span>
              </th>
              <th className={headerClass} onClick={() => onSort?.('published_at')}>
                <span className="inline-flex items-center gap-1">
                  Jahr {sortable && <SortIcon column="published_at" sortBy={sortBy} sortOrder={sortOrder} />}
                </span>
              </th>
              {showEnrichment && (
                <th className={headerClass} onClick={() => onSort?.('enrichment_status')}>
                  <span className="inline-flex items-center gap-1">
                    Enrichment {sortable && <SortIcon column="enrichment_status" sortBy={sortBy} sortOrder={sortOrder} />}
                  </span>
                </th>
              )}
              {showScores && (
                <th className={headerClass} onClick={() => onSort?.('press_score')}>
                  <span className="inline-flex items-center gap-1">
                    Score {sortable && <SortIcon column="press_score" sortBy={sortBy} sortOrder={sortOrder} />}
                  </span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {publications.map((pub) => (
              <PublicationRow
                key={pub.id}
                pub={pub}
                showScores={showScores}
                showEnrichment={showEnrichment}
                isExpanded={expandedId === pub.id}
                onToggle={() => setExpandedId(expandedId === pub.id ? null : pub.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card view — visible below md */}
      <div className="md:hidden space-y-3">
        {publications.map((pub) => (
          <MobilePublicationCard
            key={pub.id}
            pub={pub}
            showScores={showScores}
            showEnrichment={showEnrichment}
          />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function MobilePublicationCard({
  pub,
  showScores,
  showEnrichment,
}: {
  pub: Publication;
  showScores?: boolean;
  showEnrichment?: boolean;
}) {
  return (
    <Link
      href={`/publications/${pub.id}`}
      className="block rounded-lg border bg-white p-4 hover:border-[#0047bb]/30 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm leading-snug line-clamp-2">
            {decodeHtmlTitle(pub.title)}
          </p>
          <p className="text-xs text-neutral-500 mt-1 truncate">
            {pub.authors || 'Unbekannt'}
          </p>
        </div>
        {showScores && (
          <div className="shrink-0">
            <PressScoreBadge score={pub.press_score} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {pub.publication_type && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {pub.publication_type}
          </Badge>
        )}
        {pub.published_at && (
          <span className="text-[10px] text-neutral-400">{pub.published_at.slice(0, 4)}</span>
        )}
        {showEnrichment && (
          <>
            <StatusBadge status={pub.enrichment_status} />
            {pub.enriched_source && <SourceBadges sources={pub.enriched_source} />}
          </>
        )}
        {showScores && pub.analysis_status === 'analyzed' && pub.llm_model && (
          <ModelBadge model={pub.llm_model} />
        )}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Desktop row
// ---------------------------------------------------------------------------

function PublicationRow({
  pub,
  showScores,
  showEnrichment,
  isExpanded,
  onToggle,
}: {
  pub: Publication;
  showScores?: boolean;
  showEnrichment?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const colCount = 5 + (showEnrichment ? 1 : 0) + (showScores ? 1 : 0);

  return (
    <>
      <tr
        className="border-t hover:bg-neutral-50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="p-3">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </td>
        <td className="p-3 max-w-sm">
          <div className="font-medium truncate">
            <Link
              href={`/publications/${pub.id}`}
              className="hover:text-[#0047bb] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {decodeHtmlTitle(pub.title)}
            </Link>
          </div>
          {pub.institute && (
            <div className="text-xs text-neutral-500 truncate">{pub.institute}</div>
          )}
        </td>
        <td className="p-3 max-w-[140px] truncate">{pub.authors || '-'}</td>
        <td className="p-3 whitespace-nowrap">
          <Badge variant="outline" className="text-xs">
            {pub.publication_type || 'Unbekannt'}
          </Badge>
        </td>
        <td className="p-3 whitespace-nowrap">{pub.published_at?.slice(0, 4) || '-'}</td>
        {showEnrichment && (
          <td className="p-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <StatusBadge status={pub.enrichment_status} />
              {pub.enriched_source && (
                <SourceBadges sources={pub.enriched_source} />
              )}
            </div>
          </td>
        )}
        {showScores && (
          <td className="p-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <PressScoreBadge score={pub.press_score} />
              {pub.analysis_status === 'analyzed' && pub.llm_model && (
                <ModelBadge model={pub.llm_model} />
              )}
            </div>
          </td>
        )}
      </tr>
      {isExpanded && (
        <tr className="border-t bg-neutral-50/50">
          <td colSpan={colCount} className="p-4">
            <ExpandedDetail pub={pub} showScores={showScores} />
          </td>
        </tr>
      )}
    </>
  );
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ausstehend',
  enriched: 'Angereichert',
  partial: 'Teilweise',
  analyzed: 'Analysiert',
  failed: 'Fehlgeschlagen',
};

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-neutral-100 text-neutral-600',
    enriched: 'bg-blue-100 text-blue-700',
    partial: 'bg-amber-100 text-amber-700',
    analyzed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || colors.pending}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

const SOURCE_SHORT: Record<string, string> = {
  crossref: 'CR',
  openalex: 'OA',
  unpaywall: 'UW',
  semantic_scholar: 'S2',
  pdf: 'PDF',
};

const SOURCE_COLOR: Record<string, string> = {
  crossref: 'bg-violet-100 text-violet-700',
  openalex: 'bg-sky-100 text-sky-700',
  unpaywall: 'bg-emerald-100 text-emerald-700',
  semantic_scholar: 'bg-orange-100 text-orange-700',
  pdf: 'bg-rose-100 text-rose-700',
};

const MODEL_SHORT: Record<string, string> = Object.fromEntries(
  LLM_MODELS.map(m => {
    const short = m.label
      .replace('Claude ', '')
      .replace(' (Free)', '')
      .replace('GPT-', 'GPT-');
    return [m.value, short];
  })
);

function ModelBadge({ model }: { model: string | null }) {
  if (!model) return null;
  const short = MODEL_SHORT[model] || model.split('/').pop() || model;
  return (
    <span
      title={model}
      className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium leading-none bg-indigo-50 text-indigo-600"
    >
      {short}
    </span>
  );
}

function SourceBadges({ sources }: { sources: string }) {
  return (
    <>
      {sources.split('+').map((src) => (
        <span
          key={src}
          title={src}
          className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium leading-none ${SOURCE_COLOR[src] || 'bg-neutral-100 text-neutral-600'}`}
        >
          {SOURCE_SHORT[src] || src}
        </span>
      ))}
    </>
  );
}

function ExpandedDetail({ pub, showScores }: { pub: Publication; showScores?: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <div>
          <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Zusammenfassung</h4>
          <p className="text-sm">{pub.enriched_abstract || pub.abstract || 'Keine Zusammenfassung verfügbar'}</p>
        </div>
        {pub.doi && (
          <div>
            <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">DOI</h4>
            <a
              href={doiToUrl(pub.doi) || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#0047bb] hover:underline inline-flex items-center gap-1"
            >
              {pub.doi} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
        {pub.enriched_source && (
          <div>
            <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Enrichment-Quellen</h4>
            <div className="flex flex-wrap gap-1">
              {pub.enriched_source.split('+').map((src) => (
                <Badge key={src} variant="outline" className="text-xs">
                  {src}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {pub.enriched_journal && (
          <div>
            <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Journal</h4>
            <p className="text-sm">{pub.enriched_journal}</p>
          </div>
        )}
        {pub.enriched_keywords && pub.enriched_keywords.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Schlagwörter</h4>
            <div className="flex flex-wrap gap-1">
              {pub.enriched_keywords.map((kw, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
              ))}
            </div>
          </div>
        )}
        {pub.full_text_snippet && (
          <SnippetDisplay text={pub.full_text_snippet} />
        )}
      </div>

      {showScores && pub.analysis_status === 'analyzed' && (
        <div className="space-y-3">
          <div>
            <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Score-Aufschlüsselung</h4>
            <div className="space-y-2">
              <ScoreBar dimension="public_accessibility" value={pub.public_accessibility} />
              <ScoreBar dimension="societal_relevance" value={pub.societal_relevance} />
              <ScoreBar dimension="novelty_factor" value={pub.novelty_factor} />
              <ScoreBar dimension="storytelling_potential" value={pub.storytelling_potential} />
              <ScoreBar dimension="media_timeliness" value={pub.media_timeliness} />
            </div>
          </div>
          {pub.pitch_suggestion && (
            <div>
              <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Pitch</h4>
              <div className="rounded bg-blue-50 p-3 text-sm">{pub.pitch_suggestion}</div>
            </div>
          )}
          {pub.suggested_angle && (
            <div>
              <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Empfohlener Blickwinkel</h4>
              <p className="text-sm">{pub.suggested_angle}</p>
            </div>
          )}
          {pub.target_audience && (
            <div>
              <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Zielgruppe</h4>
              <p className="text-sm">{pub.target_audience}</p>
            </div>
          )}
          {pub.reasoning && (
            <div>
              <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Begründung</h4>
              <p className="text-sm text-neutral-600">{pub.reasoning}</p>
            </div>
          )}
          {pub.llm_model && (
            <div className="text-xs text-neutral-400">
              Modell: {pub.llm_model} | Kosten: ${pub.analysis_cost?.toFixed(4) || '0'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SnippetDisplay({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 300;
  const display = isLong && !expanded ? text.slice(0, 300) + '...' : text;

  return (
    <div>
      <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Textauszug</h4>
      <p className="text-sm text-neutral-600 whitespace-pre-wrap">{display}</p>
      {isLong && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="text-xs text-[#0047bb] hover:underline mt-1"
        >
          {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
        </button>
      )}
    </div>
  );
}
