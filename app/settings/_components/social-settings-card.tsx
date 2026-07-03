'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { InfoBubble } from '@/components/info-bubble';
import { Clock, Loader2, Save } from '@/lib/icons';
import { toast } from 'sonner';
import type { SocialSettings } from '@/lib/shared/types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function fetchSettings(): Promise<SocialSettings> {
  const res = await fetch('/api/social/settings');
  if (!res.ok) throw new Error('Einstellungen konnten nicht geladen werden');
  return res.json();
}

export function SocialSettingsCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['social-settings'], queryFn: fetchSettings });

  const [fresh, setFresh] = useState('');
  const [theme, setTheme] = useState('');
  const [retentionOn, setRetentionOn] = useState(false);
  const [retention, setRetention] = useState('');

  // Seed local fields from server data when it (re)arrives — React's
  // "adjust state during render" pattern (no effect, fires once per data change).
  const [seeded, setSeeded] = useState<SocialSettings | null>(null);
  if (data && data !== seeded) {
    setSeeded(data);
    setFresh(String(data.fresh_window_days));
    setTheme(String(data.theme_window_days));
    setRetentionOn(data.retention_days != null);
    setRetention(data.retention_days != null ? String(data.retention_days) : '90');
  }

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        fresh_window_days: Math.max(1, Math.min(365, parseInt(fresh, 10) || 7)),
        theme_window_days: Math.max(1, Math.min(365, parseInt(theme, 10) || 14)),
        retention_days: retentionOn ? Math.max(1, Math.min(3650, parseInt(retention, 10) || 90)) : null,
      };
      const res = await fetch('/api/social/settings', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-settings'] });
      toast.success('Zeitfenster gespeichert');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-muted-foreground/70" />
          Social-Media-Zeitfenster
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lade …
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fresh-window" className="flex items-center gap-1">
                  Frisch-Fenster (Tage)
                  <InfoBubble content={{ title: 'Frisch-Fenster', body: <p>Posts, die neuer sind als dieser Wert, werden in der Übersicht sofort gezeigt. Ältere (aber noch im Beobachtungszeitraum) lassen sich über „Ältere anzeigen" bzw. den Zeitraumfilter einblenden.</p> }} />
                </Label>
                <Input id="fresh-window" type="number" min={1} max={365} value={fresh} onChange={(e) => setFresh(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="theme-window" className="flex items-center gap-1">
                  Themen-Fenster (Tage)
                  <InfoBubble content={{ title: 'Themen-Fenster', body: <p>Über welchen Zeitraum das Lagebild bei jeder Aktualisierung erzeugt wird. Unabhängig vom Anzeige-Fenster, z.B. „letzte 7 Tage" auch wenn 30 Tage vorgehalten werden.</p> }} />
                </Label>
                <Input id="theme-window" type="number" min={1} max={365} value={theme} onChange={(e) => setTheme(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="retention-toggle" className="flex items-center gap-1">
                    Alte Posts löschen (Retention)
                    <InfoBubble content={{ title: 'Retention', body: <p>Wenn aktiv, werden beim Aktualisieren Posts gelöscht, die älter als der eingestellte Wert sind. Begrenzt das Datenbank-Wachstum dauerhaft. Standard: aus (nichts wird gelöscht).</p> }} />
                  </Label>
                  <p className="text-xs text-muted-foreground">Begrenzt das DB-Wachstum. Standard: aus.</p>
                </div>
                <Switch id="retention-toggle" checked={retentionOn} onCheckedChange={setRetentionOn} />
              </div>
              {retentionOn && (
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={3650} value={retention} onChange={(e) => setRetention(e.target.value)} className="w-28" />
                  <span className="text-sm text-muted-foreground">Tage aufbewahren</span>
                </div>
              )}
            </div>

            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Speichern
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
