'use client';

import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Paperclip,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  Trash2,
  Download,
  Loader2,
} from '@/lib/icons';
import { toast } from 'sonner';
import type { CardAttachment, CardDetail } from '@/lib/shared/board';
import { MAX_ATTACHMENT_BYTES } from '@/lib/shared/board';
import { useCurrentUser } from '@/lib/client/hooks/use-current-user';
import { Button } from '@/components/ui/button';
import { uploadAttachmentApi, deleteAttachmentApi, attachmentUrl } from '../_lib/api';
import { AttachmentPreviewModal, hasPreview } from './attachment-preview';

const MAX_MB = (MAX_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0);

function formatBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(type: string | null) {
  if (type?.startsWith('image/')) return ImageIcon;
  if (type === 'application/pdf' || type?.includes('word') || type?.startsWith('text/')) {
    return FileText;
  }
  return FileIcon;
}

export function AttachmentsSection({
  card,
  onInvalidate,
}: {
  card: CardDetail;
  onInvalidate: () => void;
}) {
  const { user, isAdmin } = useCurrentUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<CardAttachment | null>(null);

  const upload = useMutation({
    mutationFn: (file: File) => uploadAttachmentApi(card.id, file),
    onSuccess: () => {
      onInvalidate();
      toast.success('Anhang hinzugefügt.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteAttachmentApi(id),
    onSuccess: onInvalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload.mutate(file);
    e.target.value = ''; // dieselbe Datei erneut wählbar machen
  };

  const canRemove = (uploadedBy: string) => !!user && (uploadedBy === user.id || isAdmin);
  // MeisterTasks Textur-Trick: Bild-Anhänge als echte Vorschau-Kacheln (bringen
  // Material + Farbe in die Karte), Dokumente bleiben als Datei-Zeilen mit
  // Name/Größe/Download. Content-Type kann null sein → dann Datei-Zeile.
  const images = card.attachments.filter((a) => a.content_type?.startsWith('image/'));
  const files = card.attachments.filter((a) => !a.content_type?.startsWith('image/'));

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Anhänge</span>
        {card.attachments.length > 0 && (
          <span className="font-mono text-2xs text-muted-foreground">
            {card.attachments.length}
          </span>
        )}
      </div>

      {images.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {images.map((a) => (
            <div key={a.id} className="group/thumb relative">
              <button
                type="button"
                onClick={() => setPreview(a)}
                className="block h-[62px] w-[92px] overflow-hidden rounded-lg border shadow-sm transition-shadow hover:shadow-md"
                title={a.filename}
                aria-label={`„${a.filename}" ansehen`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachmentUrl(a.id)}
                  alt={a.filename}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
              {canRemove(a.uploaded_by) && (
                <button
                  type="button"
                  onClick={() => del.mutate(a.id)}
                  disabled={del.isPending}
                  className="absolute right-1 top-1 rounded-md bg-black/55 p-1 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/70 focus-visible:opacity-100 group-hover/thumb:opacity-100"
                  aria-label={`„${a.filename}" löschen`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {files.map((a) => {
            const Icon = iconFor(a.content_type);
            return (
              <li
                key={a.id}
                className="group flex items-center gap-2 rounded-md border px-2.5 py-1.5"
                style={{ backgroundColor: 'var(--board-chip-bg)' }}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                {/* Klick = Vorschau (wenn möglich), Download bleibt eigener
                    Button rechts. Ohne Vorschau bleibt der Name ein
                    Download-Link wie bisher. */}
                {hasPreview(a) ? (
                  <button
                    type="button"
                    onClick={() => setPreview(a)}
                    className="min-w-0 flex-1 truncate text-left text-sm text-foreground hover:text-brand hover:underline"
                  >
                    {a.filename}
                  </button>
                ) : (
                  <a
                    href={attachmentUrl(a.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-sm text-foreground hover:text-brand hover:underline"
                  >
                    {a.filename}
                  </a>
                )}
                <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                  {formatBytes(a.size_bytes)}
                </span>
                <a
                  href={attachmentUrl(a.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1 text-muted-foreground hover:text-brand"
                  aria-label={`„${a.filename}" herunterladen`}
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                {canRemove(a.uploaded_by) && (
                  <button
                    type="button"
                    onClick={() => del.mutate(a.id)}
                    disabled={del.isPending}
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                    aria-label={`„${a.filename}" löschen`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={onPick}
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,image/png,image/jpeg,image/gif,image/webp"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Paperclip className="mr-1 h-3.5 w-3.5" />
          )}
          {upload.isPending ? 'Lädt hoch…' : 'Datei anhängen'}
        </Button>
        <span className="text-xs text-muted-foreground">
          max. {MAX_MB} MB · PDF, Office, Text, Bild
        </span>
      </div>

      {preview && (
        <AttachmentPreviewModal attachment={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
