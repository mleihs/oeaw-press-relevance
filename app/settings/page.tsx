'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AppSettings, DEFAULT_SETTINGS } from '@/lib/shared/types';
import {
  loadSettingsSnapshot,
  saveSettings,
  subscribeSettings,
} from '@/lib/client/stores/settings-store';
import { useInfoBubblesEnabled } from '@/lib/client/hooks/use-info-bubbles';
import { useKeyboardShortcutsEnabled } from '@/lib/client/hooks/use-keyboard-shortcuts-enabled';
import { useBoardAppearance } from '@/lib/client/hooks/use-board-appearance';
import { cn } from '@/lib/shared/utils';
import { openCheatSheet } from '@/lib/client/commands/controller';
import { InfoBubble } from '@/components/info-bubble';
import { SocialChannelsCard } from './_components/social-channels-card';
import { UserManagementCard } from './_components/user-management-card';
import { BoardManagementCard } from './_components/board-management-card';
import { SocialSettingsCard } from './_components/social-settings-card';
import { EventWeightsCard } from './_components/event-weights-card';
import { Save, CheckCircle2, Eye, EyeOff, Loader2, XCircle, ShieldCheck, Info, User, Keyboard, Sparkles } from '@/lib/icons';
import { toast } from 'sonner';

export default function SettingsPage() {
  // Persisted settings come from a localStorage-backed external store
  // (hydration-safe via getServerSnapshot = DEFAULT_SETTINGS). `draft` is the
  // in-memory working copy while the user edits; null means "showing the
  // persisted value". Save/Reset write through and clear the draft. This
  // avoids the setState-in-effect hydration shim entirely.
  const persisted = useSyncExternalStore(
    subscribeSettings,
    loadSettingsSnapshot,
    () => DEFAULT_SETTINGS,
  );
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const settings = draft ?? persisted;

  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [bubblesOn, setBubblesOn] = useInfoBubblesEnabled();
  const [shortcutsOn, setShortcutsOn] = useKeyboardShortcutsEnabled();
  const [boardAppearance, setBoardAppearance] = useBoardAppearance();

  const updateSettings = (patch: Partial<AppSettings>) =>
    setDraft((d) => ({ ...(d ?? persisted), ...patch }));

  const handleSave = () => {
    saveSettings(settings);
    setDraft(null);
    toast.success('Einstellungen gespeichert');
  };

  const handleReset = () => {
    saveSettings(DEFAULT_SETTINGS);
    setDraft(null);
    toast.info('Einstellungen auf Standard zurückgesetzt');
  };

  const testConnection = useCallback(async () => {
    setConnectionStatus('testing');
    setConnectionError(null);
    try {
      // Hits the server-side route, which uses env-bound credentials.
      const res = await fetch('/api/publications?page=1&pageSize=1');
      if (res.ok) {
        setConnectionStatus('success');
      } else {
        const body = await res.json().catch(() => ({}));
        setConnectionStatus('error');
        setConnectionError(body.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      setConnectionStatus('error');
      setConnectionError(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen');
    }
  }, []);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Einstellungen</h1>
        <p className="text-muted-foreground">
          Konfigurieren Sie Ihre API-Schlüssel und Analyse-Parameter. Alle Einstellungen werden im Browser gespeichert.
        </p>
      </div>

      {/* Nutzerverwaltung — admin-only (self-gated; Server erzwingt es) */}
      <UserManagementCard />

      {/* Board-Verwaltung — Spalten für alle, Boards anlegen/archivieren admin */}
      <BoardManagementCard />

      {/* Identity — used for flag notes + decision attribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identität</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="reviewer-name" className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground/70" />
            Dein Name
            <InfoBubble id="settings_reviewer_name" size="sm" />
          </Label>
          <Input
            id="reviewer-name"
            type="text"
            placeholder="z.B. Marie"
            value={settings.reviewerName}
            onChange={(e) => updateSettings({ reviewerName: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Erscheint bei Flag-Notizen und Triage-Entscheidungen als Urheber. Leer lassen → Eintrag als „team".
          </p>
        </CardContent>
      </Card>

      {/* Display preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Darstellung</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="bubbles-toggle" className="flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground/70" />
                Erklärungs-Bubbles
              </Label>
              <p className="text-xs text-muted-foreground">
                Kleine Info-Symbole neben Fachbegriffen wie „Press-Score" oder „Eigen-Highlight". Bei AUS verschwinden sie aus der gesamten App.
              </p>
            </div>
            <Switch
              id="bubbles-toggle"
              checked={bubblesOn}
              onCheckedChange={setBubblesOn}
              aria-label="Erklärungs-Bubbles umschalten"
            />
          </div>

          {/* Board-Erscheinungsbild — per-User (localStorage), nur eine
              CSS-Token-Umschaltung am Board. Segmentiert statt Switch, weil es
              zwei benannte Zustände sind, nicht an/aus. */}
          <div className="mt-4 flex items-start justify-between gap-4 border-t border-border/60 pt-4">
            <div className="space-y-1">
              <Label className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground/70" />
                Board-Erscheinungsbild
              </Label>
              <p className="text-xs text-muted-foreground">
                „Standard" = ruhige, schwebende Karten auf neutraler Mulde (empfohlen).
                „Atmosphäre" = warmes, farbiges Board-Feld mit Papierkarten. Gilt nur für dich, auf diesem Gerät.
              </p>
            </div>
            <div className="flex shrink-0 rounded-lg border border-border p-0.5" role="group" aria-label="Board-Erscheinungsbild">
              {([['standard', 'Standard'], ['atmosphere', 'Atmosphäre']] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setBoardAppearance(val)}
                  aria-pressed={boardAppearance === val}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    boardAppearance === val
                      ? 'bg-brand text-white'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Keyboard — WCAG 2.1.4: single-key shortcuts must be switchable off */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tastatur</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="shortcuts-toggle" className="flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-muted-foreground/70" />
                Tastenkürzel
              </Label>
              <p className="text-xs text-muted-foreground">
                Einzeltasten und Sequenzen wie „?" (Übersicht) oder „G P"
                (Publikationen). Bei AUS bleiben sie inaktiv, das Befehlsmenü
                (⌘K) funktioniert unabhängig davon weiter.
              </p>
            </div>
            <Switch
              id="shortcuts-toggle"
              checked={shortcutsOn}
              onCheckedChange={setShortcutsOn}
              aria-label="Tastenkürzel umschalten"
            />
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-3">
            <p className="text-xs text-muted-foreground">
              Alle Kürzel auf einen Blick.
            </p>
            <Button variant="outline" size="sm" onClick={() => openCheatSheet()}>
              <Keyboard className="mr-2 h-4 w-4" />
              Tastenkürzel anzeigen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Supabase — server-configured, read-only here */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supabase-Verbindung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/[0.08] border border-amber-200 dark:border-amber-500/30 p-3 text-xs text-amber-900 dark:text-amber-200">
            <ShieldCheck className="h-4 w-4 shrink-0 text-amber-800 dark:text-amber-300 mt-0.5" />
            <div>
              <p className="font-medium mb-0.5">Server-konfiguriert</p>
              <p>
                Supabase-Verbindung ist über Server-Env-Variablen (<code className="font-mono">SUPABASE_URL</code> + <code className="font-mono">SUPABASE_ANON_KEY</code>) gesetzt. Der Browser kann die Verbindung nicht überschreiben. So ist sichergestellt, dass kein anonymer Besucher mit eigenem Key durch die App fragmentieren kann.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={testConnection}
            disabled={connectionStatus === 'testing'}
          >
            {connectionStatus === 'testing' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Server-Verbindung testen
          </Button>
          {connectionStatus === 'success' && (
            <span className="ml-3 inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Verbindung erfolgreich
            </span>
          )}
          {connectionStatus === 'error' && (
            <span className="ml-3 inline-flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
              <XCircle className="h-4 w-4" />
              {connectionError || 'Verbindung fehlgeschlagen'}
            </span>
          )}
        </CardContent>
      </Card>

      {/* OpenRouter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">LLM-Konfiguration (OpenRouter)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key" className="inline-flex items-center gap-1">
              OpenRouter API-Schlüssel
              <InfoBubble id="settings_openrouter" size="sm" />
            </Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showApiKey ? 'text' : 'password'}
                placeholder="sk-or-..."
                value={settings.openrouterApiKey}
                onChange={(e) => updateSettings({ openrouterApiKey: e.target.value })}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Modell-Wahl erfolgt pro Batch direkt im Analyse-Dialog (Publikationen → Analyse starten).
            Kein globales LLM-Default in den Einstellungen, weil unterschiedliche Batches
            unterschiedliche Preis-Qualitäts-Profile sinnvoll machen.
          </p>
        </CardContent>
      </Card>

      {/* Social-media channels */}
      <SocialChannelsCard />

      {/* Social-media time windows */}
      <SocialSettingsCard />

      {/* Analysis params */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analyse-Parameter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="min-word-count" className="inline-flex items-center gap-1">
              Minimale Wortanzahl
              <InfoBubble id="settings_min_words" size="sm" />
            </Label>
            <Input
              id="min-word-count"
              type="number"
              min={0}
              max={1000}
              value={settings.minWordCount}
              onChange={(e) => updateSettings({ minWordCount: parseInt(e.target.value) || 0 })}
            />
            <p className="text-xs text-muted-foreground">
              Nur Publikationen mit mindestens so vielen Wörtern angereichertem Inhalt analysieren. 0 = alle analysieren.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="batch-size" className="inline-flex items-center gap-1">
              Batch-Größe
              <InfoBubble id="settings_batch_size" size="sm" />
            </Label>
            <Input
              id="batch-size"
              type="number"
              min={1}
              max={5}
              value={settings.batchSize}
              onChange={(e) => updateSettings({ batchSize: Math.min(5, Math.max(1, parseInt(e.target.value) || 3)) })}
            />
            <p className="text-xs text-muted-foreground">
              Anzahl der Publikationen pro LLM-API-Aufruf (1-5). Niedrigere Werte liefern bessere Ergebnisse, kosten aber mehr.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Event-score weighting (server-persisted history; self-saves) */}
      <EventWeightsCard />

      {/* Save */}
      <div className="flex gap-3">
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          Einstellungen speichern
        </Button>
        <Button variant="outline" onClick={handleReset}>
          Auf Standard zurücksetzen
        </Button>
      </div>
    </div>
  );
}
