'use client';

import type { FlagNote, Decision } from '@/lib/shared/types';
import { QK } from '@/lib/client/query-keys';
import { EntityFlag } from './entity-flag';

interface PublicationFlagProps {
  pubId: string;
  flagNotes: FlagNote[];
  /** Optional callback fired with the new flag_notes after a successful mutation. */
  onChange?: (notes: FlagNote[]) => void;
  /** Compact mode for tight rows; default = normal. */
  size?: 'sm' | 'md';
  /** Triage decision-state — switches the icon to reflect lifecycle. */
  decision?: Decision | null;
}

/** Thin wrapper around the generic <EntityFlag>. The actual popover UI,
 *  mutation logic, and reviewer-name handling live in entity-flag.tsx so
 *  the events route can reuse them by entity-kind, not by copy-paste. */
export function PublicationFlag({
  pubId,
  flagNotes,
  onChange,
  size,
  decision,
}: PublicationFlagProps) {
  return (
    <EntityFlag
      entityId={pubId}
      flagNotes={flagNotes}
      apiBase={`/api/publications/${pubId}`}
      invalidateOnSuccess={[QK.publications, QK.publication(pubId)]}
      decision={decision}
      size={size}
      onChange={onChange}
      infoBubbleId="publication_flag"
    />
  );
}
