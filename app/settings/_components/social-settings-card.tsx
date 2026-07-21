'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBanner } from '@/components/status-banner';
import { AlertCircle, Clock, Loader2, Save } from '@/lib/icons';
import { toast } from 'sonner';
import {
  checkSocialWindowOrder,
  SOCIAL_WINDOW_DEFAULTS,
  SOCIAL_WINDOW_LABELS,
  SOCIAL_WINDOW_MAX_DAYS,
  SOCIAL_WINDOW_MIN_DAYS,
  SOCIAL_WINDOW_ORDER,
  type SocialWindowField,
  type SocialWindows,
} from '@/lib/shared/social-windows';
import type { SocialSettings } from '@/lib/shared/types';

// Die drei Zeitfenster der Social-Beobachtung, in Pipeline-Reihenfolge und als
// das dargestellt, was sie sind: eine Kette. Was nicht abgerufen wurde, kann
// nicht ausgewertet und nicht angezeigt werden.
//
// Vor dem Audit vom 2026-07-21 zeigte diese Karte zwei der Fenster als
// gleichrangige Regler, verschwieg das dritte (der Abrufzeitraum steckte in der
// Env-Variable SOCIAL_WINDOW_DAYS — ausgerechnet das Fenster, das Apify-Guthaben
// kostet) und bot zusätzlich einen Retention-Schalter an, der nie eingeschaltet
// war, bei 91 Posts nichts zu begrenzen hatte und unterhalb des
// Auswertungszeitraums das Lagebild hätte leerräumen können. Der ist ersatzlos
// entfallen (Migration 20260721000003).

const HINTS: Record<SocialWindowField, string> = {
  fetch_window_days:
    'Wie weit zurück Posts von Instagram geholt werden. Kostet Apify-Guthaben und begrenzt die beiden Werte darunter.',
  theme_window_days:
    'Woraus das Lagebild entsteht. Denselben Zeitraum zeigt die Social-Kachel auf dem Dashboard.',
  fresh_window_days:
    'Ab wann ein Post in der Liste unter „Ältere anzeigen" rutscht. Reine Darstellung.',
};

async function fetchSettings(): Promise<SocialSettings> {
  const res = await fetch('/api/social/settings');
  if (!res.ok) throw new Error('Einstellungen konnten nicht geladen werden');
  return res.json();
}

/** Formularwerte sind Strings (freies Tippen, auch leer). Erst hier werden sie
 *  zu Zahlen — mit demselben Clamp, den auch das Zod-Schema anlegt. */
function toWindows(draft: Record<SocialWindowField, string>): SocialWindows {
  const num = (v: string, fallback: number) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(SOCIAL_WINDOW_MIN_DAYS, Math.min(SOCIAL_WINDOW_MAX_DAYS, n));
  };
  return {
    fetch_window_days: num(draft.fetch_window_days, SOCIAL_WINDOW_DEFAULTS.fetch_window_days),
    theme_window_days: num(draft.theme_window_days, SOCIAL_WINDOW_DEFAULTS.theme_window_days),
    fresh_window_days: num(draft.fresh_window_days, SOCIAL_WINDOW_DEFAULTS.fresh_window_days),
  };
}

export function SocialSettingsCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['social-settings'], queryFn: fetchSettings });

  const [draft, setDraft] = useState<Record<SocialWindowField, string>>({
    fetch_window_days: '',
    theme_window_days: '',
    fresh_window_days: '',
  });

  // Seed local fields from server data when it (re)arrives — React's
  // "adjust state during render" pattern (no effect, fires once per data change).
  const [seeded, setSeeded] = useState<SocialSettings | null>(null);
  if (data && data !== seeded) {
    setSeeded(data);
    setDraft({
      fetch_window_days: String(data.fetch_window_days),
      theme_window_days: String(data.theme_window_days),
      fresh_window_days: String(data.fresh_window_days),
    });
  }

  const windows = toWindows(draft);
  // Dieselbe Regel wie im Server-Merge und in der CHECK-Bedingung. Hier nur,
  // damit man den Fehler VOR dem Speichern sieht.
  const violation = checkSocialWindowOrder(windows);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/social/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(windows),
      });
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
          Social-Media-Beobachtung
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lade …
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Die drei Zeiträume bauen aufeinander auf: ausgewertet werden kann nur, was
              abgerufen wurde, und angezeigt nur, was ausgewertet wurde.
            </p>

            <div className="space-y-3">
              {SOCIAL_WINDOW_ORDER.map((field, i) => {
                const outer = i > 0 ? SOCIAL_WINDOW_ORDER[i - 1] : null;
                return (
                  <div key={field} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Label htmlFor={field} className="min-w-[9.5rem]">
                        {SOCIAL_WINDOW_LABELS[field]}
                      </Label>
                      <Input
                        id={field}
                        type="number"
                        min={SOCIAL_WINDOW_MIN_DAYS}
                        max={SOCIAL_WINDOW_MAX_DAYS}
                        value={draft[field]}
                        onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">Tage</span>
                      {outer && (
                        <span className="font-mono text-2xs text-ink-soft">
                          höchstens {windows[outer]}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{HINTS[field]}</p>
                  </div>
                );
              })}
            </div>

            {violation && (
              <StatusBanner
                variant="warning"
                icon={<AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              >
                {violation}
              </StatusBanner>
            )}

            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending || violation !== null}
            >
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Speichern
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
