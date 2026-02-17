'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AppSettings, DEFAULT_SETTINGS } from '@/lib/types';
import { LLM_MODELS } from '@/lib/constants';
import { loadSettings, saveSettings } from '@/lib/settings-store';
import { Save, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSupabaseKey, setShowSupabaseKey] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const handleSave = () => {
    saveSettings(settings);
    toast.success('Settings saved');
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    toast.info('Settings reset to defaults');
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-neutral-500">
          Configure your API keys and analysis parameters. All settings are stored in your browser.
        </p>
      </div>

      {/* Supabase */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supabase Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="supabase-url">Supabase URL</Label>
            <Input
              id="supabase-url"
              placeholder="https://your-project.supabase.co"
              value={settings.supabaseUrl}
              onChange={(e) => setSettings(s => ({ ...s, supabaseUrl: e.target.value }))}
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
                onChange={(e) => setSettings(s => ({ ...s, supabaseAnonKey: e.target.value }))}
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
          {settings.supabaseUrl && settings.supabaseAnonKey && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Connection configured
            </div>
          )}
        </CardContent>
      </Card>

      {/* OpenRouter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">LLM Configuration (OpenRouter)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">OpenRouter API Key</Label>
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
            <Label htmlFor="model">LLM Model</Label>
            <select
              id="model"
              value={settings.llmModel}
              onChange={(e) => setSettings(s => ({ ...s, llmModel: e.target.value }))}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              {LLM_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Analysis params */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analysis Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="min-word-count">Minimum Word Count</Label>
            <Input
              id="min-word-count"
              type="number"
              min={0}
              max={1000}
              value={settings.minWordCount}
              onChange={(e) => setSettings(s => ({ ...s, minWordCount: parseInt(e.target.value) || 0 }))}
            />
            <p className="text-xs text-neutral-500">
              Only analyze publications with at least this many words of enriched content. Set to 0 to analyze all.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="batch-size">Batch Size</Label>
            <Input
              id="batch-size"
              type="number"
              min={1}
              max={5}
              value={settings.batchSize}
              onChange={(e) => setSettings(s => ({ ...s, batchSize: Math.min(5, Math.max(1, parseInt(e.target.value) || 3)) }))}
            />
            <p className="text-xs text-neutral-500">
              Number of publications to send per LLM API call (1-5). Lower values give better results but cost more.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex gap-3">
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          Save Settings
        </Button>
        <Button variant="outline" onClick={handleReset}>
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}
