'use client';

import { Download, ChevronDown } from '@/lib/icons';
import { toast } from 'sonner';
import { getApiHeaders } from '@/lib/client/stores/settings-store';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// The export endpoint returns ALL analyzed publications, ignoring the
// currently-active filters — the title tooltip communicates this so users
// don't get a surprise CSV with rows they filtered out.
async function downloadExport(format: 'csv' | 'json'): Promise<void> {
  const res = await fetch(`/api/export/${format}`, { headers: getApiHeaders() });
  // Der Export verlangt seit M1 eine angemeldete Identität — ohne diesen
  // Check würde die 401-JSON-Antwort stumm als .csv/.json gespeichert.
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    toast.error(
      res.status === 401
        ? 'Bitte anmelden, um exportieren zu können.'
        : `Export fehlgeschlagen: ${body.error ?? `HTTP ${res.status}`}`,
    );
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `storyscout-export.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportDropdown() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title="Exportiert alle analysierten Publikationen. Die aktuell aktiven Filter werden NICHT angewendet."
        >
          <Download className="mr-2 h-4 w-4" />
          Exportieren
          <ChevronDown className="ml-2 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => downloadExport('csv')}>
          Als CSV (alle analysierten)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => downloadExport('json')}>
          Als JSON (alle analysierten)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
