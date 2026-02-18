'use client';

import { useEffect, useState, useCallback } from 'react';
import { Publication } from '@/lib/types';
import { PublicationTable } from '@/components/publication-table';
import { AnalysisModal } from '@/components/analysis-modal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getApiHeaders } from '@/lib/settings-store';
import { Download, ChevronLeft, ChevronRight, Brain } from 'lucide-react';
import { SCORE_LABELS, SCORE_COLORS } from '@/lib/constants';

export default function AnalysisPage() {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('press_score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
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

      const res = await fetch(`/api/publications?${params}`, {
        headers: getApiHeaders(),
      });
      const data = await res.json();
      setPublications(data.publications || []);
      setTotal(data.total || 0);

      // Calculate dimension averages from all results
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
  }, [page, sortBy, sortOrder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(total / pageSize);

  const handleExport = (format: 'csv' | 'json') => {
    const headers = getApiHeaders();
    const params = new URLSearchParams();
    // Build URL with auth headers as query params won't work for headers
    const url = `/api/export/${format}`;
    fetch(url, { headers })
      .then(res => res.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `oeaw-press-relevance.${format}`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  const sortOptions = [
    { value: 'press_score', label: 'Press Score' },
    { value: 'published_at', label: 'Date' },
    { value: 'societal_relevance', label: 'Societal Relevance' },
    { value: 'public_accessibility', label: 'Accessibility' },
    { value: 'novelty_factor', label: 'Novelty' },
    { value: 'storytelling_potential', label: 'Storytelling' },
    { value: 'media_timeliness', label: 'Timeliness' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Press Relevance Analysis</h1>
          <p className="text-neutral-500">{total} publications analyzed</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('json')}>
            <Download className="mr-2 h-4 w-4" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Dimension averages */}
      {Object.keys(dimensionAverages).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dimension Averages (Current Page)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-5">
              {Object.entries(dimensionAverages).map(([dim, avg]) => (
                <div key={dim} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">{SCORE_LABELS[dim]}</span>
                    <span className="font-medium">{Math.round(avg * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
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
            <Brain className="h-4 w-4" />
            Run Press Relevance Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-neutral-500">
            Analyze pending publications using LLM via OpenRouter.
          </p>
          <Button onClick={() => setAnalysisModalOpen(true)} size="sm">
            Start Analysis
          </Button>
        </CardContent>
      </Card>

      <AnalysisModal
        open={analysisModalOpen}
        onOpenChange={setAnalysisModalOpen}
        onComplete={fetchData}
      />

      {/* Sort controls */}
      <div className="flex gap-3 items-center">
        <span className="text-sm text-neutral-500">Sort by:</span>
        <select
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          {sortOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
        >
          {sortOrder === 'desc' ? 'Highest first' : 'Lowest first'}
        </Button>
      </div>

      {/* Results table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-neutral-200 border-t-neutral-800 rounded-full" />
        </div>
      ) : (
        <PublicationTable publications={publications} showScores />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500">Page {page} of {totalPages}</p>
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
