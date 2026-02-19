'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Publication } from '@/lib/types';
import { useKeyboardShortcuts } from '@/lib/use-keyboard-shortcuts';
import { PublicationTable } from '@/components/publication-table';
import { EnrichmentModal } from '@/components/enrichment-modal';
import { AnalysisModal } from '@/components/analysis-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getApiHeaders } from '@/lib/settings-store';
import { Search, ChevronLeft, ChevronRight, Sparkles, Brain, X, Bookmark, Plus, Trash2 } from 'lucide-react';

interface SavedView {
  name: string;
  enrichmentFilter: string;
  analysisFilter: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

function loadSavedViews(): SavedView[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('storyscout-saved-views') || '[]');
  } catch {
    return [];
  }
}

function saveSavedViews(views: SavedView[]) {
  localStorage.setItem('storyscout-saved-views', JSON.stringify(views));
}

export default function PublicationsPage() {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [enrichmentFilter, setEnrichmentFilter] = useState('');
  const [analysisFilter, setAnalysisFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [enrichModalOpen, setEnrichModalOpen] = useState(false);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const pageSize = 20;
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load saved views on mount
  useEffect(() => {
    setSavedViews(loadSavedViews());
  }, []);

  const saveCurrentView = () => {
    const name = prompt('Name für diese Ansicht:');
    if (!name) return;
    const view: SavedView = { name, enrichmentFilter, analysisFilter, sortBy, sortOrder };
    const updated = [...savedViews, view];
    setSavedViews(updated);
    saveSavedViews(updated);
  };

  const applyView = (view: SavedView) => {
    setEnrichmentFilter(view.enrichmentFilter);
    setAnalysisFilter(view.analysisFilter);
    setSortBy(view.sortBy);
    setSortOrder(view.sortOrder);
    setPage(1);
  };

  const deleteView = (index: number) => {
    const updated = savedViews.filter((_, i) => i !== index);
    setSavedViews(updated);
    saveSavedViews(updated);
  };

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
    onPrevPage: () => setPage(p => Math.max(1, p - 1)),
    onNextPage: () => { const tp = Math.ceil(total / pageSize); setPage(p => Math.min(tp, p + 1)); },
  });

  // Search debounce (300ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

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
      if (debouncedSearch) params.set('search', debouncedSearch);
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
  }, [page, debouncedSearch, enrichmentFilter, analysisFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(total / pageSize);
  const activeFilterCount = (enrichmentFilter ? 1 : 0) + (analysisFilter ? 1 : 0);
  const rangeStart = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(page * pageSize, total);

  const clearFilters = () => {
    setEnrichmentFilter('');
    setAnalysisFilter('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Publikationen</h1>
        <p className="text-neutral-500">{total.toLocaleString()} Publikationen in der Datenbank</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                ref={searchInputRef}
                placeholder="Titel suchen... (/ oder Cmd+K)"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={enrichmentFilter || '_all'}
              onValueChange={(v) => { setEnrichmentFilter(v === '_all' ? '' : v); setPage(1); }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Alle (Enrichment)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Alle (Enrichment)</SelectItem>
                <SelectItem value="pending">Ausstehend</SelectItem>
                <SelectItem value="enriched">Angereichert</SelectItem>
                <SelectItem value="partial">Teilweise</SelectItem>
                <SelectItem value="failed">Fehlgeschlagen</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={analysisFilter || '_all'}
              onValueChange={(v) => { setAnalysisFilter(v === '_all' ? '' : v); setPage(1); }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Alle (Analyse)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Alle (Analyse)</SelectItem>
                <SelectItem value="pending">Ausstehend</SelectItem>
                <SelectItem value="analyzed">Analysiert</SelectItem>
                <SelectItem value="failed">Fehlgeschlagen</SelectItem>
              </SelectContent>
            </Select>

            {/* Saved views */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <Bookmark className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Ansichten</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {savedViews.length > 0 ? (
                  <>
                    {savedViews.map((view, i) => (
                      <DropdownMenuItem
                        key={i}
                        className="flex items-center justify-between gap-4"
                        onClick={() => applyView(view)}
                      >
                        <span>{view.name}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteView(i); }}
                          className="text-neutral-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : (
                  <div className="px-2 py-1.5 text-xs text-neutral-400">Keine gespeicherten Ansichten</div>
                )}
                <DropdownMenuItem onClick={saveCurrentView}>
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  Aktuelle Ansicht speichern
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Active filter indicator */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
              <Badge variant="secondary" className="text-xs">
                {activeFilterCount} Filter aktiv
              </Badge>
              {enrichmentFilter && (
                <Badge variant="outline" className="text-xs">
                  Enrichment: {enrichmentFilter}
                </Badge>
              )}
              {analysisFilter && (
                <Badge variant="outline" className="text-xs">
                  Analyse: {analysisFilter}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-xs h-6 px-2 text-neutral-500 hover:text-neutral-700"
              >
                <X className="h-3 w-3 mr-1" />
                Filter zurücksetzen
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enrichment & Analysis actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#0047bb]" />
              Enrichment starten
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-neutral-500">
              Publikationen mit Metadaten aus CrossRef, OpenAlex und anderen Quellen anreichern.
            </p>
            <Button onClick={() => setEnrichModalOpen(true)} size="sm">
              Enrichment starten
            </Button>
          </CardContent>
        </Card>

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
          <div className="animate-spin h-8 w-8 border-4 border-neutral-200 border-t-[#0047bb] rounded-full" />
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
