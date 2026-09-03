'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Loader2, RefreshCw } from '@/lib/icons';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getApiHeaders } from '@/lib/client/stores/settings-store';
import { consumeSSE } from '@/lib/client/sse';

interface SyncResponse {
  imported: number;
  updated: number;
  pruned: number;
  skipped: number;
  llm_locations_filled: number;
  total_from_mysql: number;
  ms: number;
}

/** Triggers POST /api/events/sync (SSE-Stream, s. Route). Der Stream liefert
 *  started/locations/synced als Zwischenstände; das UI bleibt bewusst schlicht
 *  (Spinner via isPending) und wertet nur das `done`-Frame (Ergebnis-Toast)
 *  bzw. `error` aus. Refreshes the RSC tree so the freshly-imported rows +
 *  the new `last_synced` timestamp render without a hard reload. Pre-Stream-
 *  Fehler (401/403, 503 bei fehlendem WEBDB_MYSQL_HOST) kommen weiterhin als
 *  Plain-JSON und landen im destructive Toast. */
export function RefreshButton({ lastSync }: { lastSync: string | null }) {
  const router = useRouter();
  const sync = useMutation({
    mutationFn: async (): Promise<SyncResponse> => {
      const r = await fetch('/api/events/sync', {
        method: 'POST',
        headers: getApiHeaders(),
      });
      const contentType = r.headers.get('content-type') ?? '';
      if (!r.ok || !contentType.includes('text/event-stream')) {
        // Auth/CSRF/Config-Fehler antworten vor dem Stream als JSON.
        const body = (await r.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }

      let result: SyncResponse | null = null;
      let errorMessage: string | null = null;
      await consumeSSE(r, (event, data) => {
        if (event === 'done') {
          result = data as SyncResponse;
        } else if (event === 'error') {
          const d = data as { error?: string };
          errorMessage = d.error ?? 'Unbekannter Fehler';
        }
      });
      if (errorMessage) throw new Error(errorMessage);
      if (!result) {
        throw new Error('Verbindung abgebrochen, bevor der Sync fertig war');
      }
      return result;
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
