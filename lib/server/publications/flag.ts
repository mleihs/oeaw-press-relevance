// Publication flag-notes: thin binding of the generic flag-notes engine
// (lib/server/flag-notes.ts) to the publications repo. All dedup/timestamp
// logic lives in the engine; this only injects persistence + the not-found error.

import 'server-only';
import { publicationsRepo } from '@/lib/server/repos/publications';
import type { FlagNote } from '@/lib/shared/types';
import type { FlagSetPayload, FlagDeletePayload } from '@/lib/shared/schemas';
import { PublicationNotFoundError } from './errors';
import { setFlagNote, clearFlagNote, type FlagNoteStore } from '@/lib/server/flag-notes';

// readFlagNotes returns undefined for a missing pub (→ notFound), [] for a pub
// with no notes — exactly the contract the engine expects.
function store(pubId: string): FlagNoteStore {
  return {
    readNotes: () => publicationsRepo.readFlagNotes(pubId),
    writeNotes: (notes) => publicationsRepo.updateFlagNotes(pubId, notes),
    notFound: () => new PublicationNotFoundError(),
  };
}

export function setFlag(pubId: string, payload: FlagSetPayload): Promise<FlagNote[]> {
  return setFlagNote(store(pubId), payload);
}

export function clearFlag(pubId: string, payload: FlagDeletePayload): Promise<FlagNote[]> {
  return clearFlagNote(store(pubId), payload);
}
