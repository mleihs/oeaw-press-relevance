'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AppSettings, DEFAULT_SETTINGS } from '@/lib/shared/types';
import { loadSettings, saveSettings } from '@/lib/client/stores/settings-store';
import { useInfoBubblesEnabled } from '@/lib/client/hooks/use-info-bubbles';
import { InfoBubble } from '@/components/info-bubble';
import { Save, CheckCircle2, Eye, EyeOff, Loader2, XCircle, ShieldCheck, Info, User } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [bubblesOn, setBubblesOn] = useInfoBubblesEnabled();

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const handleSave = () => {
    saveSettings(settings);
    toast.success('Einstellungen gespeichert');
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
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
            onChange={(e) => setSettings(s => ({ ...s, reviewerName: e.target.value }))}
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
                onChange={(e) => setSettings(s => ({ ...s, openrouterApiKey: e.target.value }))}
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
              onChange={(e) => setSettings(s => ({ ...s, minWordCount: parseInt(e.target.value) || 0 }))}
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
              onChange={(e) => setSettings(s => ({ ...s, batchSize: Math.min(5, Math.max(1, parseInt(e.target.value) || 3)) }))}
            />
            <p className="text-xs text-muted-foreground">
              Anzahl der Publikationen pro LLM-API-Aufruf (1-5). Niedrigere Werte liefern bessere Ergebnisse, kosten aber mehr.
            </p>
          </div>
        </CardContent>
      </Card>

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
