'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { InfoBubble } from '@/components/info-bubble';
import { Plus, Trash2, Radar, Loader2, ExternalLink } from '@/lib/icons';
import { toast } from 'sonner';
import type { SocialChannel } from '@/lib/shared/types';

interface ChannelsResponse {
  channels: SocialChannel[];
  default_lookback_days: number;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function fetchChannels(): Promise<ChannelsResponse> {
  const res = await fetch('/api/social/channels');
  if (!res.ok) throw new Error('Kanäle konnten nicht geladen werden');
  return res.json();
}

async function postJson(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: JSON_HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

export function SocialChannelsCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['social-channels'], queryFn: fetchChannels });
  const [newHandle, setNewHandle] = useState('');
  const [newName, setNewName] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['social-channels'] });

  const create = useMutation({
    mutationFn: () =>
      postJson('/api/social/channels', 'POST', {
        handle: newHandle,
        display_name: newName || undefined,
      }),
    onSuccess: () => {
      setNewHandle('');
      setNewName('');
      invalidate();
      toast.success('Kanal hinzugefügt');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      postJson(`/api/social/channels/${id}`, 'PATCH', patch),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => postJson(`/api/social/channels/${id}`, 'DELETE'),
    onSuccess: () => {
      invalidate();
      toast.success('Kanal entfernt');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const channels = data?.channels ?? [];
  const defaultDays = data?.default_lookback_days ?? 14;

  return (
    <Card id="social-channels" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Radar className="h-4 w-4 text-muted-foreground/70" />
          Social-Media-Kanäle
          <InfoBubble
            content={{
              title: 'Beobachtete Kanäle',
              body: (
                <p>
                  Instagram-Profile, deren Posts im Bereich „Social Media" zu
                  einem Themen-Lagebild ausgewertet werden. Der Beobachtungs-
                  zeitraum gilt global; pro Kanal kann er überschrieben werden.
                </p>
              ),
            }}
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Standard-Beobachtungszeitraum: <strong>{defaultDays} Tage</strong>{' '}
          (global), pro Kanal überschreibbar. Leer lassen = Standard.
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lade Kanäle …
          </div>
        ) : channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Kanäle.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {channels.map((c) => (
              <ChannelRow
                key={c.id}
                channel={c}
                defaultDays={defaultDays}
                busy={update.isPending || remove.isPending}
                onToggle={(active) => update.mutate({ id: c.id, patch: { active } })}
                onName={(display_name) =>
                  update.mutate({ id: c.id, patch: { display_name } })
                }
                onLookback={(lookback_days) =>
                  update.mutate({ id: c.id, patch: { lookback_days } })
                }
                onDelete={() => remove.mutate(c.id)}
              />
            ))}
          </ul>
        )}

        {/* Add channel */}
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Handle oder Instagram-URL (z.B. quarks.de)"
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newHandle.trim()) create.mutate();
              }}
            />
            <Input
              placeholder="Anzeigename (optional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="sm:max-w-[180px]"
            />
            <Button
              size="sm"
              onClick={() => create.mutate()}
              disabled={!newHandle.trim() || create.isPending}
            >
              {create.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Hinzufügen
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChannelRow({
  channel,
  defaultDays,
  busy,
  onToggle,
  onName,
  onLookback,
  onDelete,
}: {
  channel: SocialChannel;
  defaultDays: number;
  busy: boolean;
  onToggle: (active: boolean) => void;
  onName: (name: string | null) => void;
  onLookback: (days: number | null) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(channel.display_name ?? '');
  const [lookback, setLookback] = useState(
    channel.lookback_days != null ? String(channel.lookback_days) : '',
  );

  const commitName = () => {
    const next = name.trim();
    if (next !== (channel.display_name ?? '')) onName(next || null);
  };
  const commitLookback = () => {
    const trimmed = lookback.trim();
    const next = trimmed === '' ? null : Math.max(1, Math.min(365, parseInt(trimmed, 10) || defaultDays));
    if (next !== (channel.lookback_days ?? null)) {
      onLookback(next);
      setLookback(next == null ? '' : String(next));
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <Switch
        checked={channel.active}
        onCheckedChange={onToggle}
        disabled={busy}
        aria-label={`${channel.handle} aktiv`}
      />
      <div className="min-w-0 flex-1">
        <a
          href={channel.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium hover:text-brand"
        >
          @{channel.handle}
          <ExternalLink className="h-3 w-3 text-muted-foreground/60" />
        </a>
      </div>
      <Input
        value={name}
        placeholder="Anzeigename"
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        className="h-8 w-40 text-sm"
      />
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={1}
          max={365}
          value={lookback}
          placeholder={String(defaultDays)}
          onChange={(e) => setLookback(e.target.value)}
          onBlur={commitLookback}
          className="h-8 w-20 text-sm"
          title="Beobachtungszeitraum in Tagen (leer = Standard)"
        />
        <span className="text-xs text-muted-foreground">Tage</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={busy}
        aria-label={`${channel.handle} entfernen`}
        className="text-muted-foreground hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}
