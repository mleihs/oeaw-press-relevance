'use client';

import { useRef } from 'react';
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
import type { CardDetail } from '@/lib/shared/board';
import { MAX_ATTACHMENT_BYTES } from '@/lib/shared/board';
import { useCurrentUser } from '@/lib/client/hooks/use-current-user';
import { Button } from '@/components/ui/button';
import { uploadAttachmentApi, deleteAttachmentApi, attachmentUrl } from '../_lib/api';

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

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <span className="text-[13.5px] font-semibold text-foreground">Anhänge</span>
        {card.attachments.length > 0 && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {card.attachments.length}
          </span>
        )}
      </div>

      {card.attachments.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {card.attachments.map((a) => {
            const Icon = iconFor(a.content_type);
            const canDelete = !!user && (a.uploaded_by === user.id || isAdmin);
            return (
              <li
                key={a.id}
                className="group flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <a
                  href={attachmentUrl(a.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-[13px] text-foreground hover:text-brand hover:underline"
                >
                  {a.filename}
                </a>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
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
                {canDelete && (
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
        <span className="text-[11.5px] text-muted-foreground">
          max. {MAX_MB} MB · PDF, Office, Text, Bild
        </span>
      </div>
    </div>
  );
}
