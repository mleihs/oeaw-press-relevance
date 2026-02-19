'use client';

import { useEffect, useState, useCallback } from 'react';
import { Publication } from '@/lib/types';
import { PublicationTable } from '@/components/publication-table';
import { AnalysisModal } from '@/components/analysis-modal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getApiHeaders } from '@/lib/settings-store';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, ChevronLeft, ChevronRight, Brain, ArrowUp, ArrowDown, ChevronDown } from 'lucide-react';
import { SCORE_LABELS, SCORE_COLORS } from '@/lib/constants';

const SORT_OPTIONS = [
  { value: 'published_at', label: 'Veröffentlichungsdatum' },
  { value: 'press_score', label: 'StoryScore' },
  { value: 'storytelling_potential', label: 'Erzählpotenzial' },
  { value: 'societal_relevance', label: 'Gesellschaftl. Relevanz' },
  { value: 'novelty_factor', label: 'Neuheit' },
  { value: 'public_accessibility', label: 'Verständlichkeit' },
  { value: 'media_timeliness', label: 'Aktualität' },
];

export default function AnalysisPage() {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('published_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [minScore, setMinScore] = useState(0);
  const [excludeIta, setExcludeIta] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [dimensionAverages, setDimensionAverages] = useState<Record<string, number>>({});
  const pageSize = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort: sortBy,
        order: sortOrder,
        analysis_status: 'analyzed',
      });
      if (minScore > 0) {
        params.set('min_score', (minScore / 100).toFixed(2));
      }
      if (excludeIta) {
        params.set('exclude_ita', 'true');
      }

      const res = await fetch(`/api/publications?${params}`, {
        headers: getApiHeaders(),
      });
      const data = await res.json();
      setPublications(data.publications || []);
      setTotal(data.total || 0);

      const pubs = data.publications || [];
      if (pubs.length > 0) {
        const dims = ['public_accessibility', 'societal_relevance', 'novelty_factor', 'storytelling_potential', 'media_timeliness'];
        const avgs: Record<string, number> = {};
        for (const dim of dims) {
          const vals = pubs.filter((p: Publication) => p[dim as keyof Publication] !== null).map((p: Publication) => p[dim as keyof Publication] as number);
          avgs[dim] = vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0;
        }
        setDimensionAverages(avgs);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortOrder, minScore, excludeIta]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(total / pageSize);
  const rangeStart = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(page * pageSize, total);

  const handleExport = (format: 'csv' | 'json') => {
    const headers = getApiHeaders();
    const url = `/api/export/${format}`;
    fetch(url, { headers })
      .then(res => res.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `storyscout-export.${format}`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">StoryScout Analyse</h1>
          <p className="text-neutral-500">{total} Publikationen analysiert</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              {total} Publikationen exportieren
              <ChevronDown className="ml-2 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('csv')}>
              Als CSV exportieren
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('json')}>
              Als JSON exportieren
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Dimension averages */}
      {Object.keys(dimensionAverages).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Durchschnittswerte (aktuelle Seite)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-5">
              {Object.entries(dimensionAverages).map(([dim, avg]) => (
                <div key={dim} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">{SCORE_LABELS[dim]}</span>
                    <span className="font-medium">{Math.round(avg * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-200 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.round(avg * 100)}%`,
                        backgroundColor: SCORE_COLORS[dim],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Run analysis */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-[#0047bb]" />
            Analyse starten
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-neutral-500">
            Ausstehende Publikationen per LLM über OpenRouter analysieren.
          </p>
          <Button onClick={() => setAnalysisModalOpen(true)} size="sm">
            Analyse starten
          </Button>
        </CardContent>
      </Card>

      <AnalysisModal
        open={analysisModalOpen}
        onOpenChange={setAnalysisModalOpen}
        onComplete={fetchData}
      />

      {/* Sort & filter controls */}
      <div className="space-y-4">
        {/* Row 1: Sort buttons — full width */}
        <div className="space-y-2">
          <p className="text-sm text-neutral-500 font-medium">Sortieren nach:</p>
          <div className="flex flex-wrap gap-1.5">
            {SORT_OPTIONS.map((opt) => {
              const isActive = sortBy === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    if (isActive) {
                      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy(opt.value);
                      setSortOrder('desc');
                      setPage(1);
                    }
                  }}
                  className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#0047bb] text-white shadow-sm'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {opt.label}
                  {isActive && (
                    sortOrder === 'desc'
                      ? <ArrowDown className="h-3.5 w-3.5" />
                      : <ArrowUp className="h-3.5 w-3.5" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Filters — right-aligned */}
        <div className="space-y-2">
          <p className="text-sm text-neutral-500 font-medium">Filtern nach:</p>
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          {/* Min score slider */}
          <div className="space-y-2 w-full sm:w-64 shrink-0">
            <p className="text-sm text-neutral-500 font-medium">
              Mindest-Score: <span className="text-neutral-900">{minScore}%</span>
            </p>
            <Slider
              value={[minScore]}
              onValueChange={([v]) => { setMinScore(v); setPage(1); }}
              min={0}
              max={100}
              step={5}
              className="[&_[role=slider]]:bg-[#0047bb] [&_[role=slider]]:border-[#0047bb] [&_span:first-child>span]:bg-[#0047bb]"
            />
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>

          {/* ITA filter */}
          <div className="space-y-2 shrink-0">
            <p className="text-sm text-neutral-500 font-medium">ITA ausblenden</p>
            <Switch
              checked={excludeIta}
              onCheckedChange={(v) => { setExcludeIta(v); setPage(1); }}
            />
          </div>
          </div>
        </div>
      </div>

      {/* Results table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-neutral-200 border-t-[#0047bb] rounded-full" />
        </div>
      ) : (
        <PublicationTable publications={publications} showScores />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            Zeige {rangeStart}–{rangeEnd} von {total.toLocaleString()} Publikationen
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
