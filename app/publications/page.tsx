'use client';

import { useEffect, useState, useCallback } from 'react';
import { Publication } from '@/lib/types';
import { PublicationTable } from '@/components/publication-table';
import { EnrichmentModal } from '@/components/enrichment-modal';
import { AnalysisModal } from '@/components/analysis-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getApiHeaders } from '@/lib/settings-store';
import { Search, ChevronLeft, ChevronRight, Sparkles, Brain } from 'lucide-react';

export default function PublicationsPage() {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [enrichmentFilter, setEnrichmentFilter] = useState('');
  const [analysisFilter, setAnalysisFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [enrichModalOpen, setEnrichModalOpen] = useState(false);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const pageSize = 20;

  const handleSort = useCallback((column: string) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  }, [sortBy]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort: sortBy,
        order: sortOrder,
      });
      if (search) params.set('search', search);
      if (enrichmentFilter) params.set('enrichment_status', enrichmentFilter);
      if (analysisFilter) params.set('analysis_status', analysisFilter);

      const res = await fetch(`/api/publications?${params}`, {
        headers: getApiHeaders(),
      });
      const data = await res.json();
      setPublications(data.publications || []);
      setTotal(data.total || 0);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [page, search, enrichmentFilter, analysisFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Publications</h1>
        <p className="text-neutral-500">{total.toLocaleString()} publications in database</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Search by title..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <select
              value={enrichmentFilter}
              onChange={(e) => { setEnrichmentFilter(e.target.value); setPage(1); }}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="">All Enrichment</option>
              <option value="pending">Pending</option>
              <option value="enriched">Enriched</option>
              <option value="partial">Partial</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={analysisFilter}
              onChange={(e) => { setAnalysisFilter(e.target.value); setPage(1); }}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="">All Analysis</option>
              <option value="pending">Pending</option>
              <option value="analyzed">Analyzed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Enrichment & Analysis actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Enrich Publications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-neutral-500">
              Fetch metadata from CrossRef, OpenAlex, Unpaywall & Semantic Scholar.
            </p>
            <Button onClick={() => setEnrichModalOpen(true)} size="sm">
              Start Enrichment
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Analyze Press Relevance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-neutral-500">
              Run LLM analysis to score publications for press worthiness.
            </p>
            <Button onClick={() => setAnalysisModalOpen(true)} size="sm">
              Start Analysis
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Enrichment Modal */}
      <EnrichmentModal
        open={enrichModalOpen}
        onOpenChange={setEnrichModalOpen}
        onComplete={fetchData}
      />

      {/* Analysis Modal */}
      <AnalysisModal
        open={analysisModalOpen}
        onOpenChange={setAnalysisModalOpen}
        onComplete={fetchData}
      />

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-neutral-200 border-t-neutral-800 rounded-full" />
        </div>
      ) : (
        <PublicationTable
          publications={publications}
          showScores
          showEnrichment
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            Page {page} of {totalPages}
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
