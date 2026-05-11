import type { Publication } from './types';

type WithOrgunits = {
  orgunits?: Array<{ akronym_de: string | null; name_de: string }>;
};

/** Display the primary author. Falls back to 'Unbekannt' only when nothing is available. */
export function displayAuthor(pub: Pick<Publication, 'lead_author'>): string {
  return pub.lead_author?.trim() || 'Unbekannt';
}

/** Display the primary institute via the orgunits relation. Returns null when no orgunit is attached. */
export function displayInstitute(pub: WithOrgunits): string | null {
  const first = pub.orgunits?.[0];
  return first?.akronym_de?.trim() || first?.name_de?.trim() || null;
}
