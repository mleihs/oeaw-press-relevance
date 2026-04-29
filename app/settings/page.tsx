'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AppSettings, DEFAULT_SETTINGS } from '@/lib/types';
import { loadSettings, saveSettings } from '@/lib/settings-store';
import { Save, CheckCircle2, Eye, EyeOff, Loader2, XCircle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSupabaseKey, setShowSupabaseKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);

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
        <p className="text-neutral-500">
          Konfigurieren Sie Ihre API-Schlüssel und Analyse-Parameter. Alle Einstellungen werden im Browser gespeichert.
        </p>
      </div>

      {/* Supabase — server-configured, read-only here */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supabase-Verbindung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
            <ShieldCheck className="h-4 w-4 shrink-0 text-amber-800 mt-0.5" />
            <div>
              <p className="font-medium mb-0.5">Server-konfiguriert</p>
              <p>
                Supabase-Verbindung ist über Server-Env-Variablen (<code className="font-mono">SUPABASE_URL</code> + <code className="font-mono">SUPABASE_ANON_KEY</code>) gesetzt — der Browser kann die Verbindung nicht überschreiben. So ist sichergestellt, dass kein anonymer Besucher mit eigenem Key durch die App fragmentieren kann.
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
            <span className="ml-3 inline-flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Verbindung erfolgreich
            </span>
          )}
          {connectionStatus === 'error' && (
            <span className="ml-3 inline-flex items-center gap-1.5 text-sm text-red-600">
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
            <Label htmlFor="api-key">OpenRouter API-Schlüssel</Label>
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-neutral-500">
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
            <Label htmlFor="min-word-count">Minimale Wortanzahl</Label>
            <Input
              id="min-word-count"
              type="number"
              min={0}
              max={1000}
              value={settings.minWordCount}
              onChange={(e) => setSettings(s => ({ ...s, minWordCount: parseInt(e.target.value) || 0 }))}
            />
            <p className="text-xs text-neutral-500">
              Nur Publikationen mit mindestens so vielen Wörtern angereichertem Inhalt analysieren. 0 = alle analysieren.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="batch-size">Batch-Größe</Label>
            <Input
              id="batch-size"
              type="number"
              min={1}
              max={5}
              value={settings.batchSize}
              onChange={(e) => setSettings(s => ({ ...s, batchSize: Math.min(5, Math.max(1, parseInt(e.target.value) || 3)) }))}
            />
            <p className="text-xs text-neutral-500">
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
