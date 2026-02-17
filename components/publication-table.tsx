'use client';

import { useState } from 'react';
import { Publication } from '@/lib/types';
import { PressScoreBadge, ScoreBar } from './score-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

interface PublicationTableProps {
  publications: Publication[];
  showScores?: boolean;
  showEnrichment?: boolean;
}

export function PublicationTable({ publications, showScores, showEnrichment }: PublicationTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (publications.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500">
        No publications found.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50">
          <tr>
            <th className="p-3 text-left font-medium w-8"></th>
            <th className="p-3 text-left font-medium">Title</th>
            <th className="p-3 text-left font-medium">Authors</th>
            <th className="p-3 text-left font-medium">Type</th>
            <th className="p-3 text-left font-medium">Year</th>
            {showEnrichment && (
              <th className="p-3 text-left font-medium">Enrichment</th>
            )}
            {showScores && (
              <th className="p-3 text-left font-medium">Score</th>
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
  );
}

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
          <div className="font-medium truncate">{pub.title}</div>
          {pub.institute && (
            <div className="text-xs text-neutral-500 truncate">{pub.institute}</div>
          )}
        </td>
        <td className="p-3 max-w-[140px] truncate">{pub.authors || '-'}</td>
        <td className="p-3 whitespace-nowrap">
          <Badge variant="outline" className="text-xs">
            {pub.publication_type || 'Unknown'}
          </Badge>
        </td>
        <td className="p-3 whitespace-nowrap">{pub.published_at?.slice(0, 4) || '-'}</td>
        {showEnrichment && (
          <td className="p-3">
            <StatusBadge status={pub.enrichment_status} />
          </td>
        )}
        {showScores && (
          <td className="p-3">
            <PressScoreBadge score={pub.press_score} />
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-neutral-100 text-neutral-600',
    enriched: 'bg-blue-100 text-blue-700',
    analyzed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || colors.pending}`}>
      {status}
    </span>
  );
}

function ExpandedDetail({ pub, showScores }: { pub: Publication; showScores?: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <div>
          <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Abstract</h4>
          <p className="text-sm">{pub.enriched_abstract || pub.abstract || 'No abstract available'}</p>
        </div>
        {pub.doi && (
          <div>
            <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">DOI</h4>
            <a
              href={`https://doi.org/${pub.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              {pub.doi} <ExternalLink className="h-3 w-3" />
            </a>
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
            <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Keywords</h4>
            <div className="flex flex-wrap gap-1">
              {pub.enriched_keywords.map((kw, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {showScores && pub.analysis_status === 'analyzed' && (
        <div className="space-y-3">
          <div>
            <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Score Breakdown</h4>
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
              <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Suggested Angle</h4>
              <p className="text-sm">{pub.suggested_angle}</p>
            </div>
          )}
          {pub.target_audience && (
            <div>
              <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Target Audience</h4>
              <p className="text-sm">{pub.target_audience}</p>
            </div>
          )}
          {pub.reasoning && (
            <div>
              <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Reasoning</h4>
              <p className="text-sm text-neutral-600">{pub.reasoning}</p>
            </div>
          )}
          {pub.llm_model && (
            <div className="text-xs text-neutral-400">
              Model: {pub.llm_model} | Cost: ${pub.analysis_cost?.toFixed(4) || '0'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
