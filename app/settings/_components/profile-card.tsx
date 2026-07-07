'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, Trash2, Loader2 } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import { useCurrentUser } from '@/lib/client/hooks/use-current-user';
import { QK } from '@/lib/client/query-keys';
import { colorForUser, initialsOf } from '@/app/board/_lib/people';
import type { BoardMember } from '@/lib/shared/board';

// Client-Spiegel der Server-Regeln (lib/server/users/avatar.ts) — nur für
// sofortiges Feedback; der Server validiert autoritativ nach.
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/**
 * Profilbild-Karte in den Einstellungen: zeigt das aktuelle Bild (oder
 * Initialen) und lädt ein neues per Datei-Auswahl hoch bzw. entfernt es. Das
 * Bild lebt in MinIO (users.avatar_key); der Upload geht an
 * POST /api/users/[id]/avatar. Vorschau bricht ihren Cache über ?v=<bust>.
 */
export function ProfileCard() {
  const { user, isLoading } = useCurrentUser();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [bust, setBust] = useState(0);
  const [hasImg, setHasImg] = useState(false);

  if (isLoading || !user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profilbild</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-16 w-16 animate-pulse rounded-full bg-muted" />
        </CardContent>
      </Card>
    );
  }

  // initialsOf/colorForUser teilen sich mit den Board-Avataren, damit die
  // Vorschau exakt so aussieht wie überall sonst.
  const member: BoardMember = {
    id: user.id,
    display_name: user.displayName,
    email: user.email,
    role: user.role,
    disabled_at: null,
    avatar_url: null,
  };
  const color = colorForUser(user.id);
  const src = `/api/users/${user.id}/avatar?v=${bust}`;

  async function upload(file: File) {
    if (!ACCEPT.split(',').includes(file.type)) {
      toast.error('Nur PNG, JPEG, WebP oder GIF.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('Bild zu groß (max. 2 MB).');
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      // Kein Content-Type-Header setzen — der Browser setzt die multipart-Grenze.
      const res = await fetch(`/api/users/${user!.id}/avatar`, { method: 'POST', body });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error ?? 'Upload fehlgeschlagen.');
      }
      setBust((b) => b + 1);
      setHasImg(true);
      // Board-Mitglieder-/Avatar-Caches auffrischen, damit das neue Bild überall
      // erscheint (nicht nur hier).
      queryClient.invalidateQueries({ queryKey: QK.boardMembers });
      toast.success('Profilbild aktualisiert.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${user!.id}/avatar`, { method: 'DELETE' });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error ?? 'Entfernen fehlgeschlagen.');
      }
      setBust((b) => b + 1);
      setHasImg(false);
      queryClient.invalidateQueries({ queryKey: QK.boardMembers });
      toast.success('Profilbild entfernt.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Entfernen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profilbild</CardTitle>
      </CardHeader>
      <CardContent>
        {/* flex-wrap: auf schmalen Screens rutschen die Buttons unter den
            Avatar statt zu quetschen. */}
        <div className="flex flex-wrap items-center gap-4">
          <span
            className="relative inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full text-xl font-semibold text-white select-none"
            style={{ backgroundColor: color }}
            aria-hidden
          >
            {!hasImg && initialsOf(member)}
            {/* key={bust}: erzwingt Remount nach Wechsel/Entfernen, damit der
                onError-/onLoad-Zustand frisch ausgewertet wird. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={bust}
              src={src}
              alt=""
              width={64}
              height={64}
              decoding="async"
              onLoad={() => setHasImg(true)}
              onError={() => setHasImg(false)}
              className={cn('absolute inset-0 h-full w-full object-cover', !hasImg && 'opacity-0')}
            />
          </span>

          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                Bild ändern
              </Button>
              {hasImg && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={remove}
                  className="text-muted-foreground hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                  Entfernen
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              PNG, JPEG, WebP oder GIF · max. 2 MB. Ohne Bild zeigen wir deine Initialen.
            </p>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Wert zurücksetzen: dieselbe Datei erneut wählen soll wieder feuern.
            e.target.value = '';
            if (file) void upload(file);
          }}
        />
      </CardContent>
    </Card>
  );
}
