'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AppSettings, DEFAULT_SETTINGS } from '@/lib/types';
import { LLM_MODELS } from '@/lib/constants';
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
    if (!settings.supabaseUrl || !settings.supabaseAnonKey) {
      setConnectionStatus('error');
      setConnectionError('URL und Anon Key müssen ausgefüllt sein.');
      return;
    }

    setConnectionStatus('testing');
    setConnectionError(null);

    try {
      const url = settings.supabaseUrl.replace(/\/$/, '');
      const res = await fetch(`${url}/rest/v1/publications?select=id&limit=1`, {
        headers: {
          'apikey': settings.supabaseAnonKey,
          'Authorization': `Bearer ${settings.supabaseAnonKey}`,
        },
      });
      if (res.ok) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
        setConnectionError(`HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (err) {
      setConnectionStatus('error');
      setConnectionError(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen');
    }
  }, [settings.supabaseUrl, settings.supabaseAnonKey]);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Einstellungen</h1>
        <p className="text-neutral-500">
          Konfigurieren Sie Ihre API-Schlüssel und Analyse-Parameter. Alle Einstellungen werden im Browser gespeichert.
        </p>
      </div>

      {/* Supabase */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supabase-Verbindung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="supabase-url">Supabase URL</Label>
            <Input
              id="supabase-url"
              placeholder="https://your-project.supabase.co"
              value={settings.supabaseUrl}
              onChange={(e) => { setSettings(s => ({ ...s, supabaseUrl: e.target.value })); setConnectionStatus('idle'); }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supabase-key">Supabase Anon Key</Label>
            <div className="relative">
              <Input
                id="supabase-key"
                type={showSupabaseKey ? 'text' : 'password'}
                placeholder="eyJ..."
                value={settings.supabaseAnonKey}
                onChange={(e) => { setSettings(s => ({ ...s, supabaseAnonKey: e.target.value })); setConnectionStatus('idle'); }}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSupabaseKey(!showSupabaseKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                {showSupabaseKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Connection test */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={testConnection}
              disabled={connectionStatus === 'testing' || !settings.supabaseUrl || !settings.supabaseAnonKey}
            >
              {connectionStatus === 'testing' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verbindung testen
            </Button>
            {connectionStatus === 'success' && (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Verbindung erfolgreich
              </span>
            )}
            {connectionStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-sm text-red-600">
                <XCircle className="h-4 w-4" />
                {connectionError || 'Verbindung fehlgeschlagen'}
              </span>
            )}
          </div>

          {/* Security note */}
          <div className="flex items-start gap-2 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500">
            <ShieldCheck className="h-4 w-4 shrink-0 text-neutral-400 mt-0.5" />
            <span>API-Schlüssel werden nur lokal in Ihrem Browser gespeichert und niemals an unsere Server übertragen.</span>
          </div>
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
          <div className="space-y-2">
            <Label htmlFor="model">LLM-Modell</Label>
            <select
              id="model"
              value={settings.llmModel}
              onChange={(e) => setSettings(s => ({ ...s, llmModel: e.target.value }))}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              {LLM_MODELS.map(m => (
                <option key={m.value} value={m.value}>
                  {m.label} ({m.costPerMillionTokens === 0 ? 'gratis' : `$${m.costPerMillionTokens}/M Tokens`})
                </option>
              ))}
            </select>
          </div>
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
