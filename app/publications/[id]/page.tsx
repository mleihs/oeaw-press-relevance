'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { Publication } from '@/lib/types';
import { getApiHeaders } from '@/lib/settings-store';
import { decodeHtmlTitle } from '@/lib/html-utils';
import { doiToUrl } from '@/lib/enrichment/doi-utils';
import { ScoreBar, PressScoreBadge } from '@/components/score-bar';
import { CapybaraLogo } from '@/components/capybara-logo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink, FileText, BookOpen, Brain, ChevronDown, ChevronUp } from 'lucide-react';

const SOURCE_LABELS: Record<string, string> = {
  crossref: 'CrossRef',
  openalex: 'OpenAlex',
  unpaywall: 'Unpaywall',
  semantic_scholar: 'Semantic Scholar',
  pdf: 'PDF',
};

const SOURCE_COLORS: Record<string, string> = {
  crossref: 'bg-violet-100 text-violet-700',
  openalex: 'bg-sky-100 text-sky-700',
  unpaywall: 'bg-emerald-100 text-emerald-700',
  semantic_scholar: 'bg-orange-100 text-orange-700',
  pdf: 'bg-rose-100 text-rose-700',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ausstehend',
  enriched: 'Angereichert',
  partial: 'Teilweise',
  analyzed: 'Analysiert',
  failed: 'Fehlgeschlagen',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-neutral-100 text-neutral-600',
  enriched: 'bg-[#0047bb]/10 text-[#0047bb]',
  partial: 'bg-amber-100 text-amber-700',
  analyzed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export default function PublicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [pub, setPub] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reasoningOpen, setReasoningOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/publications/${id}`, {
          headers: getApiHeaders(),
        });
        if (!res.ok) {
          throw new Error('Publikation nicht gefunden');
        }
        const data = await res.json();
        setPub(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Laden');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <CapybaraLogo size="md" />
        <p className="text-sm text-neutral-500">Lade Publikation...</p>
      </div>
    );
  }

  if (error || !pub) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/publications">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück zu Publikationen
          </Link>
        </Button>
        <Card className="border-red-200">
          <CardContent className="p-6 text-center">
            <p className="text-red-600 font-medium">{error || 'Publikation nicht gefunden'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const doiUrl = doiToUrl(pub.doi);
  const hasAnalysis = pub.analysis_status === 'analyzed' && pub.press_score !== null;
  const pressScorePct = pub.press_score !== null ? Math.round(pub.press_score * 100) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/publications">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück zu Publikationen
        </Link>
      </Button>

      {/* Header */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold leading-tight">{decodeHtmlTitle(pub.title)}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
          {pub.authors && <span>{pub.authors}</span>}
          {pub.institute && (
            <>
              <span className="text-neutral-300">|</span>
              <span className="text-neutral-500">{pub.institute}</span>
            </>
          )}
          {pub.published_at && (
            <>
              <span className="text-neutral-300">|</span>
              <span>{pub.published_at.slice(0, 4)}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pub.publication_type && (
            <Badge variant="outline">{pub.publication_type}</Badge>
          )}
          {pub.open_access && (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200">Open Access</Badge>
          )}
          <Badge className={STATUS_COLORS[pub.enrichment_status] || STATUS_COLORS.pending}>
            {STATUS_LABELS[pub.enrichment_status] || pub.enrichment_status}
          </Badge>
          {hasAnalysis && (
            <Badge className={STATUS_COLORS.analyzed}>
              {STATUS_LABELS.analyzed}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {doiUrl && (
            <a
              href={doiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0047bb] hover:underline inline-flex items-center gap-1"
            >
              DOI: {pub.doi} <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {pub.url && (
            <a
              href={pub.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0047bb] hover:underline inline-flex items-center gap-1"
            >
              URL <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Analysis card — prominently displayed if available */}
      {hasAnalysis && (
        <Card className="border-[#0047bb]/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-[#0047bb]" />
              Presserelevanz-Analyse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Overall score */}
            <div className="flex items-center gap-4">
              <div className={`flex items-center justify-center h-16 w-16 rounded-full text-xl font-bold ${
                pressScorePct! >= 70
                  ? 'bg-[#0047bb] text-white'
                  : pressScorePct! >= 50
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-neutral-100 text-neutral-600'
              }`}>
                {pressScorePct}%
              </div>
              <div>
                <p className="font-medium text-lg">Presserelevanz-Score</p>
                <p className="text-sm text-neutral-500">
                  {pressScorePct! >= 70 ? 'Hohe Presserelevanz' : pressScorePct! >= 50 ? 'Mittlere Presserelevanz' : 'Niedrige Presserelevanz'}
                </p>
              </div>
            </div>

            {/* Dimension bars */}
            <div className="space-y-2">
              <ScoreBar dimension="public_accessibility" value={pub.public_accessibility} />
              <ScoreBar dimension="societal_relevance" value={pub.societal_relevance} />
              <ScoreBar dimension="novelty_factor" value={pub.novelty_factor} />
              <ScoreBar dimension="storytelling_potential" value={pub.storytelling_potential} />
              <ScoreBar dimension="media_timeliness" value={pub.media_timeliness} />
            </div>

            {/* Pitch */}
            {pub.pitch_suggestion && (
              <div className="rounded-lg bg-[#0047bb]/5 border border-[#0047bb]/10 p-4">
                <h4 className="text-xs font-medium text-[#0047bb] uppercase mb-2">Pitch</h4>
                <p className="text-sm leading-relaxed">{pub.pitch_suggestion}</p>
              </div>
            )}

            {/* Angle & audience */}
            <div className="grid gap-4 md:grid-cols-2">
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
            </div>

            {/* Reasoning (collapsible) */}
            {pub.reasoning && (
              <div>
                <button
                  onClick={() => setReasoningOpen(!reasoningOpen)}
                  className="flex items-center gap-1 text-xs font-medium text-neutral-500 uppercase hover:text-neutral-700"
                >
                  Begründung
                  {reasoningOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {reasoningOpen && (
                  <p className="text-sm text-neutral-600 mt-2">{pub.reasoning}</p>
                )}
              </div>
            )}

            {/* Model & cost */}
            {pub.llm_model && (
              <div className="text-xs text-neutral-400 border-t pt-3">
                Modell: {pub.llm_model} | Kosten: ${pub.analysis_cost?.toFixed(4) || '0'}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Enrichment card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#0047bb]" />
            Enrichment-Daten
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sources */}
          {pub.enriched_source && (
            <div>
              <h4 className="text-xs font-medium text-neutral-500 uppercase mb-2">Quellen</h4>
              <div className="flex flex-wrap gap-1.5">
                {pub.enriched_source.split('+').map((src) => (
                  <span
                    key={src}
                    className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${SOURCE_COLORS[src] || 'bg-neutral-100 text-neutral-600'}`}
                  >
                    {SOURCE_LABELS[src] || src}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Abstract */}
          <div>
            <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Zusammenfassung</h4>
            <p className="text-sm leading-relaxed">
              {pub.enriched_abstract || pub.abstract || 'Keine Zusammenfassung verfügbar.'}
            </p>
          </div>

          {/* Journal */}
          {pub.enriched_journal && (
            <div>
              <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Journal</h4>
              <p className="text-sm">{pub.enriched_journal}</p>
            </div>
          )}

          {/* Keywords */}
          {pub.enriched_keywords && pub.enriched_keywords.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-neutral-500 uppercase mb-2">Schlagwörter</h4>
              <div className="flex flex-wrap gap-1.5">
                {pub.enriched_keywords.map((kw, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Full-text snippet */}
          {pub.full_text_snippet && (
            <CollapsibleSnippet text={pub.full_text_snippet} />
          )}

          {/* Word count */}
          {pub.word_count > 0 && (
            <div className="text-xs text-neutral-400 border-t pt-3">
              {pub.word_count.toLocaleString()} Wörter angereicherter Inhalt
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CollapsibleSnippet({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 500;
  const display = isLong && !expanded ? text.slice(0, 500) + '...' : text;

  return (
    <div>
      <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Textauszug</h4>
      <p className="text-sm text-neutral-600 whitespace-pre-wrap leading-relaxed">{display}</p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[#0047bb] hover:underline mt-1"
        >
          {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
        </button>
      )}
    </div>
  );
}
