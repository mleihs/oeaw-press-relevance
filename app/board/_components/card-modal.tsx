'use client';

// Karten-Modal (Rahmen): Dialog-Gerüst, Kanalband/Abgeschlossen-Kopf,
// Celebration und die Cache-Verdrahtung (invalidate/applyCard). Die Abschnitte
// leben in card-modal-header/-main/-items/-sidebar.tsx; die stabilen Werte
// wandern über den CardModalProvider (card-modal-context.tsx) nach unten.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X, Check, ChevronDown } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import { QK } from '@/lib/client/query-keys';
import type {
  BoardColumn,
  BoardLabel,
  BoardMember,
  CardDetail,
  CardReference,
} from '@/lib/shared/board';
import { fetchCard, moveCardApi } from '../_lib/api';
import { useBoardAppearance } from '@/lib/client/hooks/use-board-appearance';
import { ChannelIcon } from '../_lib/channels';
import { membersById } from '../_lib/people';
import { AssignButton } from './assign-button';
import {
  CelebrationOverlay,
  CompletionBanner,
  fireCelebrationConfetti,
} from './celebration';
import { CardMovePopover } from './card-move-popover';
import { CardModalProvider } from './card-modal-context';
import { CompleteButton, CompleterLine, CardActionsMenu } from './card-modal-header';
import { MainColumn } from './card-modal-main';
import { Sidebar } from './card-modal-sidebar';

export function CardModal({
  cardId,
  boardSlug,
  boardId,
  columns,
  members,
  labels,
  onClose,
  onOpenCard,
}: {
  cardId: string;
  boardSlug: string;
  boardId: string;
  columns: BoardColumn[];
  members: BoardMember[];
  labels: BoardLabel[];
  onClose: () => void;
  onOpenCard: (id: string) => void;
}) {
  const qc = useQueryClient();
  const byId = useMemo(() => membersById(members), [members]);
  const { data: card, isPending } = useQuery({
    queryKey: QK.card(cardId),
    queryFn: () => fetchCard(cardId),
    staleTime: 5_000,
  });

  // ['board'] als Prefix invalidiert JEDES ['board', slug] — nötig, weil ein
  // Move die Karte in ein anderes Board schieben kann (dessen Cache sonst bis
  // zur staleTime alt bliebe); QK.boards deckt die Zähler in Übersicht/Switcher.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QK.card(cardId) });
    qc.invalidateQueries({ queryKey: ['board'] });
    qc.invalidateQueries({ queryKey: QK.boards });
  };
  const applyCard = (updated: CardDetail) => {
    qc.setQueryData(QK.card(cardId), updated);
    qc.invalidateQueries({ queryKey: ['board'] });
    qc.invalidateQueries({ queryKey: QK.boards });
  };
  // Referenz-Mutationen antworten mit der vollen Referenzliste: sofort in den
  // Cache schreiben (kein Flackern), dann invalidieren (Activity-Strand trägt
  // reference_added/removed nach).
  const applyReferences = (references: CardReference[]) => {
    qc.setQueryData<CardDetail>(QK.card(cardId), (old) =>
      old ? { ...old, references } : old,
    );
    qc.invalidateQueries({ queryKey: QK.card(cardId) });
  };

  const column = card ? columns.find((c) => c.id === card.column_id) : undefined;
  const accent = column?.color ?? '#64748b';

  // Radix Dialog liefert Focus-Trap, aria-modal, Scroll-Lock, Escape und
  // Klick-außerhalb selbst — die früheren Handrollungen (keydown-defaultPrevented,
  // onMouseDown-Target-Guard) entfallen. Genestete Radix-Layer (Move-Popover,
  // Selects) koordinieren über den DismissableLayer-Stack: Escape schließt erst
  // das innere Layer, ein Klick darin gilt nicht als „außerhalb". Der
  // Text-Auswahl-Drag-Fehlschluss entfällt, weil Radix nur bei pointerdown
  // *außerhalb* des Contents schließt.
  // Kanalband + Erscheinungsbild-Tokens am Modal (portaliert → erbt sonst nichts).
  const [appearance] = useBoardAppearance();
  // Abschluss-Celebration (Design Board-Celebration §1a): Badge-Overlay 1,5 s
  // + Konfetti; reduced-motion überspringt beides (Kopf/Banner wechseln sofort).
  const [celebrating, setCelebrating] = useState(false);
  const celebrateTimer = useRef<number | undefined>(undefined);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => window.clearTimeout(celebrateTimer.current), []);
  const celebrate = () => {
    // Konfetti bleibt reduced-motion-gated (fireCelebrationConfetti self-guardt),
    // aber das Badge-Overlay zeigen wir IMMER: unter „Bewegung reduzieren" friert
    // globals.css die Keyframes auf den Endzustand → statisches grünes Häkchen-
    // Badge. So bekommt auch ein Reduced-Motion-Nutzer eine Abschluss-Bestätigung
    // statt gar nichts (vorher unterdrückte der Early-Return beides).
    void fireCelebrationConfetti(contentRef.current);
    setCelebrating(true);
    window.clearTimeout(celebrateTimer.current);
    celebrateTimer.current = window.setTimeout(() => setCelebrating(false), 1500);
  };
  // Gesättigtes Kanalband wie die neuen Spaltenköpfe (Richtung Schwarz vertieft,
  // damit weiße Schrift auch auf hellen Kanalfarben trägt).
  const bandBg = `color-mix(in srgb, ${accent} 82%, #06121f)`;

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          style={{ backgroundColor: 'rgba(13,36,80,.42)' }}
        />
        <DialogPrimitive.Content
          ref={contentRef}
          data-board-appearance={appearance}
          // Modalfläche auf dem Board-Karten-Token: neutrales Weiß im Standard,
          // warmes Papier in „Atmosphäre" (die Sidebar sitzt darauf als
          // eingesenkte Mulde). Der Kanalband-Kopf trägt die Farbe darüber.
          style={{ backgroundColor: 'var(--board-card)' }}
          // Ohne gerenderte Description sonst eine Radix-Warnung; wir haben keine.
          aria-describedby={undefined}
          // Escape in einem Textarea (Beschreibung, Kommentar) bricht nur das
          // Editieren ab, nicht das Modal. Der Guard MUSS hier stehen: Radix
          // lauscht capture-phase auf document und prüft nur defaultPrevented —
          // ein stopPropagation im Feld-Handler käme zu spät. Gleiches gilt fürs
          // Titel-Input, aber nur bei ungespeicherter Umbenennung (data-dirty) —
          // sonst soll Escape das Modal normal schließen.
          onEscapeKeyDown={(e) => {
            const t = e.target;
            if (t instanceof HTMLTextAreaElement) e.preventDefault();
            else if (t instanceof HTMLInputElement && t.dataset.dirty === 'true') e.preventDefault();
          }}
          // <md: Bottom-Sheet nach Mock (Card-Sheet, Board-Mobile Z. 549) —
          // Full-Height ab 14px, oben gerundet, Slide von unten. md+: das
          // bisherige zentrierte Modal (Zoom-Animation nur dort).
          className="fixed inset-x-0 bottom-0 top-[14px] z-50 flex flex-col overflow-hidden rounded-t-[22px] bg-card shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 max-md:data-[state=open]:slide-in-from-bottom-[40%] max-md:data-[state=closed]:slide-out-to-bottom-[40%] md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[calc(100vh-2rem)] md:w-[calc(100%-2rem)] md:max-w-[840px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:data-[state=closed]:zoom-out-95 md:data-[state=open]:zoom-in-95"
        >
          {/* Zugänglicher Dialogtitel (der sichtbare Titel ist ein editierbares
              Input-Feld, kein Heading) — Radix verdrahtet aria-labelledby. */}
          <DialogPrimitive.Title className="sr-only">
            {card?.title || 'Karte'}
          </DialogPrimitive.Title>
          {isPending || !card ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Lädt…</div>
          ) : (
            // Provider-Wert bewusst ohne useMemo: das Objekt entsteht wie zuvor
            // die gedrillten Props bei jedem CardModal-Render neu — identisches
            // Re-Render-Verhalten, nur ohne die 7–8-Props-Ketten.
            <CardModalProvider
              value={{ card, members, byId, onPatch: applyCard, onInvalidate: invalidate }}
            >
              {card.completed_at ? (
                <>
                  {/* Abgeschlossen-Kopf (Design Board-Celebration): grüner Kopf
                      mit Häkchen-Badge + „von {Person}", rechts „Wieder öffnen".
                      Ersetzt das Kanalband, solange die Karte abgeschlossen ist. */}
                  <div className="flex shrink-0 items-center gap-2 border-b border-[#bbf0d3] bg-[#eafaf1] px-4 py-3 md:px-5">
                    <DialogPrimitive.Close asChild>
                      <button
                        type="button"
                        aria-label="Schließen"
                        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md bg-white/70 text-emerald-600 hover:bg-white md:order-last md:bg-[#d6f3e3] md:hover:bg-[#c3ecd6]"
                      >
                        <ChevronDown className="h-[18px] w-[18px] md:hidden" />
                        <X className="hidden h-4 w-4 md:block" />
                      </button>
                    </DialogPrimitive.Close>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_3px_10px_rgba(16,185,129,.45)]">
                      <Check weight="bold" className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[15px] font-bold leading-tight tracking-tight text-emerald-900">
                        Abgeschlossen
                      </div>
                      <CompleterLine card={card} byId={byId} />
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <CompleteButton card={card} onDone={applyCard} onCompleted={celebrate} />
                      <CardActionsMenu
                        card={card}
                        boardSlug={boardSlug}
                        onDeleted={onClose}
                        onInvalidate={invalidate}
                      />
                    </div>
                  </div>
                  <CompletionBanner card={card} byId={byId} />
                </>
              ) : (
                /* Header — gesättigtes Kanalband (wie die Spaltenköpfe): solide
                   Kanalfarbe, weiße Icons/Labels. Trägt Farbe + Identität. */
                <div
                  className="flex shrink-0 items-center gap-2 px-4 py-3 md:px-5 md:py-4"
                  style={{ backgroundColor: bandBg }}
                >
                  {/* Mobil steht der Schließen-Caret links (Mock Card-Sheet),
                      auf Desktop bleibt das X rechts außen (md:order-last). */}
                  <DialogPrimitive.Close asChild>
                    <button
                      type="button"
                      aria-label="Schließen"
                      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md bg-white/15 text-white hover:bg-white/25 md:order-last"
                    >
                      <ChevronDown className="h-[18px] w-[18px] md:hidden" />
                      <X className="hidden h-4 w-4 md:block" />
                    </button>
                  </DialogPrimitive.Close>
                  {column && (
                    <ChannelIcon name={column.name} className="h-[18px] w-[18px] text-white" />
                  )}
                  <span className="rounded-md bg-white/20 px-2 py-0.5 text-xs font-semibold text-white">
                    {column?.name ?? 'Kanal'}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <AssignButton card={card} members={members} onPatch={applyCard} />
                    <CardMovePopover
                      card={card}
                      currentSlug={boardSlug}
                      columns={columns}
                      onMove={async (columnId) => {
                        const updated = await moveCardApi(cardId, columnId);
                        applyCard(updated);
                      }}
                    />
                    <CompleteButton card={card} onDone={applyCard} onCompleted={celebrate} />
                    <CardActionsMenu
                      card={card}
                      boardSlug={boardSlug}
                      onDeleted={onClose}
                      onInvalidate={invalidate}
                    />
                  </div>
                </div>
              )}

              {/* Body — abgeschlossen: gedimmt (Design). Bewusst OHNE
                  pointer-events-none: das tötete auch Scrollen/Textauswahl
                  langer Inhalte (Review-Fund) — lesen bleibt möglich,
                  „Wieder öffnen" im Kopf hebt die Dämpfung auf. */}
              <div
                className={cn(
                  'flex min-h-0 flex-1 flex-col transition-[opacity,filter] duration-300 md:flex-row',
                  card.completed_at && 'opacity-60 grayscale-[.25]',
                )}
              >
                <div className="flex-1 overflow-y-auto p-6">
                  <MainColumn
                    key={card.id}
                    onReferences={applyReferences}
                    onOpenCard={onOpenCard}
                    columns={columns}
                  />
                </div>
                <div
                  className="w-full shrink-0 overflow-y-auto border-t p-5 md:w-[248px] md:border-l md:border-t-0"
                  style={{ backgroundColor: 'var(--board-trough)' }}
                >
                  <Sidebar key={card.id} boardId={boardId} labels={labels} />
                </div>
              </div>
              {celebrating && <CelebrationOverlay />}
            </CardModalProvider>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
