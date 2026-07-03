'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { QK } from '@/lib/client/query-keys';
import type { BoardWithColumns } from '@/lib/shared/board';
import { getRealtimeClient } from '@/lib/client/supabase-realtime';

/**
 * Realtime für das offene Board (BOARD_PLAN.md §3.2, Phase 3). Abonniert
 * postgres_changes auf den Kollaborations-Tabellen und invalidiert die
 * React-Query-Caches — Realtime ist bewusst NUR eine zusätzliche
 * Invalidierungs-Quelle neben den optimistischen Updates, nie die primäre
 * Zustandsquelle (der eine Query-Store bleibt Wahrheit).
 *
 * Scoping: alle Tabellen kommen ungefiltert an — ein DB-seitiger
 * `board_id`-Filter würde UPDATEs gegen die NEUE Zeile prüfen (eine auf ein
 * anderes Board verschobene Karte sendete dem Quellboard kein Event) und bei
 * DELETE enthält `old` unter RLS ohnehin nur den PK. Stattdessen wird
 * clientseitig invalidiert, wenn die Zeile zu diesem Board gehört ODER die
 * Karte im Cache dieses Boards liegt. Items/Kommentare/Anhänge ändern auch
 * den Chip (Fortschritt bzw. comment_count/attachment_count) → Board mit-
 * invalidieren; nur Aktivität ist reines Kartendetail.
 *
 * Auth: kurzlebiger Access-Token via /api/auth/realtime-token (Cookies
 * bleiben httpOnly); vor Ablauf proaktiv erneuert. Fehlt der Browser-Client
 * (ENV) oder scheitert der Token, degradiert das Board still auf staleTime.
 */

type Row = Record<string, unknown>;

async function fetchRealtimeToken(): Promise<{ token: string; expiresAt: number | null } | null> {
  try {
    const res = await fetch('/api/auth/realtime-token', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as { token: string; expiresAt: number | null };
  } catch {
    return null;
  }
}

export function useBoardRealtime(boardId: string | null, slug: string) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!boardId) return;
    const client = getRealtimeClient();
    if (!client) return;

    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: RealtimeChannel | null = null;

    // INSERT/UPDATE liefern die Zeile in `new`; bei DELETE enthält `old`
    // unter RLS trotz REPLICA IDENTITY FULL NUR den Primary Key (Supabase-
    // Doku, Postgres Changes) — Fremdschlüssel wie card_id fehlen dann.
    const rowOf = (p: RealtimePostgresChangesPayload<Row>): Row =>
      (p.eventType === 'DELETE' ? p.old : p.new) as Row;

    const invalidateBoard = () => qc.invalidateQueries({ queryKey: QK.board(slug) });
    const invalidateCard = (id: unknown) => {
      if (typeof id === 'string') qc.invalidateQueries({ queryKey: QK.card(id) });
    };
    const cardInBoardCache = (cardId: string) => {
      const board = qc.getQueryData<BoardWithColumns>(QK.board(slug));
      return !!board?.cards.some((c) => c.id === cardId);
    };

    const onCard = (p: RealtimePostgresChangesPayload<Row>) => {
      const row = rowOf(p);
      const cardId = typeof row.id === 'string' ? row.id : null;
      // Relevant, wenn die Zeile zu diesem Board gehört ODER die Karte hier
      // im Cache liegt (deckt Wegzug auf ein anderes Board und DELETE ab).
      if (row.board_id === boardId || (cardId && cardInBoardCache(cardId))) invalidateBoard();
      invalidateCard(cardId);
    };

    // Items/Kommentare/Anhänge: Kartendetail + Chip (Fortschritt/Zähler).
    const onCardChild = (p: RealtimePostgresChangesPayload<Row>) => {
      const row = rowOf(p);
      const cardId = typeof row.card_id === 'string' ? row.card_id : null;
      if (!cardId) {
        // DELETE ohne card_id (PK-only-Payload): Ziel unbekannt → Board und
        // alle offenen Kartendetails invalidieren, statt still zu veralten.
        invalidateBoard();
        void qc.invalidateQueries({ queryKey: ['card'] });
        return;
      }
      invalidateCard(cardId);
      if (cardInBoardCache(cardId)) invalidateBoard();
    };

    // Aktivität ist append-only und reines Kartendetail. Scheinbar redundant
    // (jede Activity hat ein Companion-Event auf cards/child, das QK.card schon
    // invalidiert) — aber writeActivity committet SEPARAT nach der Companion-
    // Mutation, ein vom Companion-Event getriggerter Refetch kann der Activity-
    // Zeile davonlaufen. Diese Subscription fängt den Strang für Fremdbeobachter
    // sicher ein; die Doppel-Invalidierung dedupt React Query ohnehin.
    const onActivity = (p: RealtimePostgresChangesPayload<Row>) => {
      invalidateCard(rowOf(p).card_id);
    };

    const scheduleRefresh = (expiresAt: number | null) => {
      if (refreshTimer) clearTimeout(refreshTimer);
      const nowSec = Date.now() / 1000;
      // 5 min Vorlauf; ohne expiresAt konservativ nach 50 min.
      const leadSec = expiresAt ? Math.max(expiresAt - nowSec - 300, 30) : 3000;
      refreshTimer = setTimeout(() => void refresh(), leadSec * 1000);
    };

    const refresh = async () => {
      const t = await fetchRealtimeToken();
      if (cancelled) return;
      if (!t) {
        // Transient (Netz weg, 500): mit kurzem Backoff weiterversuchen,
        // sonst stirbt Realtime still beim Token-Ablauf (~1 h).
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => void refresh(), 30_000);
        return;
      }
      await client.realtime.setAuth(t.token);
      scheduleRefresh(t.expiresAt);
    };

    void (async () => {
      const t = await fetchRealtimeToken();
      if (cancelled) return;
      if (t) {
        await client.realtime.setAuth(t.token);
        scheduleRefresh(t.expiresAt);
      }
      if (cancelled) return;
      channel = client
        .channel(`board:${boardId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, onCard)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'card_items' }, onCardChild)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'card_comments' }, onCardChild)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'card_attachments' },
          onCardChild,
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'card_activity' }, onActivity)
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (channel) void client.removeChannel(channel);
    };
  }, [boardId, slug, qc]);
}
