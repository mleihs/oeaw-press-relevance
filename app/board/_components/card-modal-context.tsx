'use client';

// Kleiner Context gegen das Props-Drilling im Karten-Modal: MainColumn und
// Sidebar (samt Untersektionen) teilen sich die fünf stabilen Werte. Bewusst
// NUR diese — alles Übrige (columns, labels, onOpenCard, …) bleibt Props,
// weil es je Abschnitt variiert bzw. nur an einer Stelle gebraucht wird.
import { createContext, useContext } from 'react';
import type { BoardMember, CardDetail } from '@/lib/shared/board';

export interface CardModalContextValue {
  card: CardDetail;
  members: BoardMember[];
  byId: Map<string, BoardMember>;
  /** Server-Antwort direkt in den Query-Cache schreiben (applyCard). */
  onPatch: (c: CardDetail) => void;
  /** Karte + Board(s) invalidieren — für Mutationen ohne volle Karten-Antwort. */
  onInvalidate: () => void;
}

const CardModalContext = createContext<CardModalContextValue | null>(null);

export const CardModalProvider = CardModalContext.Provider;

export function useCardModal(): CardModalContextValue {
  const value = useContext(CardModalContext);
  if (!value) {
    throw new Error('useCardModal() außerhalb von <CardModalProvider> aufgerufen');
  }
  return value;
}
