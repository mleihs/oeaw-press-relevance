'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getApiHeaders } from '@/lib/client/stores/settings-store';

interface SyncResponse {
  imported: number;
  updated: number;
  pruned: number;
  skipped: number;
  llm_locations_filled: number;
  total_from_mysql: number;
  ms: number;
}

/** Triggers POST /api/events/sync. Shows a single-line success toast and
 *  refreshes the RSC tree so the freshly-imported rows + the new
 *  `last_synced` timestamp render without a hard reload. The 503 from
 *  EventsSyncConfigError surfaces as a destructive toast with the German
 *  message the route handed back. */
export function RefreshButton({ lastSync }: { lastSync: string | null }) {
  const router = useRouter();
  const sync = useMutation({
    mutationFn: async (): Promise<SyncResponse> => {
      const r = await fetch('/api/events/sync', {
        method: 'POST',
        headers: getApiHeaders(),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      return body as SyncResponse;
    },
    onSuccess: (data) => {
      const parts = [
        `${data.imported} neu`,
        `${data.updated} aktualisiert`,
      ];
      if (data.pruned > 0) parts.push(`${data.pruned} entfernt`);
      if (data.llm_locations_filled > 0)
        parts.push(`${data.llm_locations_filled}× Ort via LLM`);
      if (data.skipped > 0) parts.push(`${data.skipped} übersprungen`);
      toast.success(`Sync: ${parts.join(', ')} (${data.ms} ms)`);
      router.refresh();
    },
    onError: (err) => {
      toast.error(`Sync fehlgeschlagen: ${err.message}`);
    },
  });

  const lastSyncLabel = lastSync
    ? new Date(lastSync).toLocaleString('de-AT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="flex items-center gap-2">
      {lastSyncLabel && (
        <span className="text-xs text-muted-foreground">
          Zuletzt synchronisiert: {lastSyncLabel}
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => sync.mutate()}
        disabled={sync.isPending}
      >
        {sync.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        Aus WEBDB aktualisieren
      </Button>
    </div>
  );
}
