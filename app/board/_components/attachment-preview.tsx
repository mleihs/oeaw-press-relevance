'use client';

import { useEffect, useState } from 'react';
import { Download, File as FileIcon, Loader2 } from '@/lib/icons';
import type { CardAttachment } from '@/lib/shared/board';
import { attachmentUrl } from '@/lib/client/board-api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { PROSE_CLASS } from '../_lib/prose';
import { cn } from '@/lib/shared/utils';

// Anhang-Vorschau VOR dem Download (Deep-Research 2026-07-06, alles ohne
// externe Viewer — Dateien verlassen das System nicht):
//   Bild  -> <img> (Route liefert Rasterbilder inline)
//   PDF   -> same-origin <iframe>, nativer Browser-Viewer (0 KB Bundle;
//            Dateien sind ≤ 4 MB, Range-Requests unnötig)
//   DOCX  -> mammoth.js im Browser (dynamic import, semantische Näherung —
//            kein pixeltreues Word-Layout)
//   Text  -> fetch + <pre>
//   Rest (legacy .doc, xlsx, pptx, zip) -> „keine Vorschau" + Download.
//   Pixeltreue Office-Vorschau bräuchte serverseitige Konvertierung
//   (Gotenberg/LibreOffice-Container) — bewusst nicht in v1.

type PreviewKind = 'image' | 'pdf' | 'docx' | 'text' | 'none';

function kindOf(a: CardAttachment): PreviewKind {
  const t = a.content_type ?? '';
  if (t.startsWith('image/')) return 'image';
  if (t === 'application/pdf') return 'pdf';
  if (t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'docx';
  }
  if (t.startsWith('text/')) return 'text';
  return 'none';
}

/** Hat der Anhang überhaupt eine Vorschau? (Steuert Klick-Verhalten der Zeile.) */
export function hasPreview(a: CardAttachment): boolean {
  return kindOf(a) !== 'none';
}

/** mammoth-HTML defensiv säubern — Allowlist statt Blocklist. mammoth
 *  generiert das Markup zwar selbst (escaped Text), aber Hyperlink-Ziele
 *  stammen aus der Datei, und eine Blocklist übersieht Vektoren wie
 *  <svg>/<math> (Namespace-Elemente mit eigenen Script-Trägern) oder
 *  style-Attribute. Erlaubt ist nur, was mammoth-Output wirklich braucht:
 *  Struktur-Tags + eine kleine Attribut-Allowlist je Tag. Alles andere wird
 *  entfernt (aktive Inhalte samt Subtree, unbekannte harmlose Wrapper nur
 *  ausgepackt, damit ihr Text erhalten bleibt). */

// Tags, die mammoth erzeugt (p/hN/Listen/Tabellen/Inline-Formate/Anker/Bilder).
const DOCX_ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
  'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup', 'span',
  'a', 'img',
]);

// Aktive/namespacete Elemente: mitsamt Inhalt entfernen, nicht auspacken.
const DOCX_DROP_SUBTREE = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form',
  'svg', 'math', 'foreignobject', 'template', 'base', 'noscript',
]);

// Attribut-Allowlist je Tag. Bewusst OHNE style/class/on* — nicht in der
// Liste = wird gestrippt. `id`/`name` auf <a>: mammoth-Bookmark-Anker,
// Ziel der internen `#`-Links (Fußnoten/Verweise).
const DOCX_ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'id', 'name']),
  img: new Set(['src', 'alt']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
};

function sanitizeDocxHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const el of [...doc.body.querySelectorAll('*')]) {
    const tag = el.tagName.toLowerCase();
    if (DOCX_DROP_SUBTREE.has(tag)) {
      el.remove();
      continue;
    }
    if (!DOCX_ALLOWED_TAGS.has(tag)) {
      // Unbekannt, aber nicht aktiv gefährlich: auspacken, Kinder behalten
      // (die stehen mit im Snapshot und werden selbst noch geprüft).
      el.replaceWith(...el.childNodes);
      continue;
    }
    const allowed = DOCX_ALLOWED_ATTRS[tag];
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (!allowed?.has(name)) {
        el.removeAttribute(attr.name);
        continue;
      }
      // Ziel-Protokolle für Links/Bilder: http(s), eingebettete Rasterbilder
      // (mammoth liefert data:image-URIs), interne Anker.
      if ((name === 'href' || name === 'src') && !/^(https?:|data:image\/|#)/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return doc.body.innerHTML;
}

function DocxPreview({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mammoth, res] = await Promise.all([import('mammoth'), fetch(url)]);
        if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`);
        const arrayBuffer = await res.arrayBuffer();
        const { value } = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) setHtml(sanitizeDocxHtml(value));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Vorschau fehlgeschlagen');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) return <PreviewFallback note={error} url={url} />;
  if (html === null) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Dokument wird aufbereitet…
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto rounded-lg border bg-card px-6 py-5">
      <div className={cn(PROSE_CLASS, 'max-w-[70ch]')} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`);
        return res.text();
      })
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Vorschau fehlgeschlagen');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) return <PreviewFallback note={error} url={url} />;
  if (text === null) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Lädt…
      </div>
    );
  }
  return (
    <pre className="h-full overflow-auto rounded-lg border bg-muted p-4 font-mono text-xs leading-relaxed text-foreground">
      {text}
    </pre>
  );
}

function PreviewFallback({ note, url }: { note: string; url: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <FileIcon className="h-5 w-5 text-muted-foreground" />
      </span>
      <p className="max-w-[36ch] text-sm text-muted-foreground">{note}</p>
      <Button asChild size="sm" variant="outline">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <Download className="mr-1 h-3.5 w-3.5" /> Herunterladen
        </a>
      </Button>
    </div>
  );
}

export function AttachmentPreviewModal({
  attachment,
  onClose,
}: {
  attachment: CardAttachment;
  onClose: () => void;
}) {
  const url = attachmentUrl(attachment.id);
  const kind = kindOf(attachment);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[86vh] max-w-4xl flex-col gap-3 sm:max-w-4xl">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle className="flex items-center gap-2 truncate text-[15px]">
            <span className="min-w-0 truncate">{attachment.filename}</span>
            <Button asChild size="sm" variant="outline" className="ml-auto shrink-0">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <Download className="mr-1 h-3.5 w-3.5" /> Herunterladen
              </a>
            </Button>
          </DialogTitle>
          <DialogDescription className="sr-only">Vorschau von {attachment.filename}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          {kind === 'image' && (
            <div className="flex h-full items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={attachment.filename} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {kind === 'pdf' && (
            <iframe
              src={url}
              title={`Vorschau: ${attachment.filename}`}
              className="h-full w-full rounded-lg border bg-muted/40"
            />
          )}
          {kind === 'docx' && <DocxPreview url={url} />}
          {kind === 'text' && <TextPreview url={url} />}
          {kind === 'none' && (
            <PreviewFallback
              note="Für diesen Dateityp gibt es keine Vorschau."
              url={url}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
