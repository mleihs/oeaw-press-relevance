'use client';

import * as React from 'react';
import { getApiHeaders } from '@/lib/client/stores/settings-store';
import type { Oestat6, Orgunit, PublicationType } from '@/lib/shared/types';

// Re-export from shared so existing consumers (filter-sheet, preset-bar)
// keep their `import { Orgunit } from '.../use-lookups'` paths working.
export type { Oestat6, Orgunit, PublicationType };

// Venue facet option: an enriched_journal value + how many publications
// carry it. Served by /api/venues (top-N by frequency).
export type VenueOption = { venue: string; count: number };

export type Lookups = {
  publicationTypes: PublicationType[];
  orgunits: Orgunit[];
  oestat6: Oestat6[];
  venues: VenueOption[];
};

let cache: Lookups | null = null;
let inflight: Promise<Lookups> | null = null;

async function fetchLookups(): Promise<Lookups> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const headers = getApiHeaders();
    const [pt, ou, oe, ve] = await Promise.all([
      fetch('/api/publication-types', { headers }).then((r) => r.json()),
      fetch('/api/orgunits', { headers }).then((r) => r.json()),
      fetch('/api/oestat6', { headers }).then((r) => r.json()),
      fetch('/api/venues', { headers }).then((r) => r.json()),
    ]);
    cache = {
      publicationTypes: (pt.publication_types ?? []) as PublicationType[],
      orgunits: (ou.orgunits ?? []) as Orgunit[],
      oestat6: (oe.oestat6 ?? []) as Oestat6[],
      venues: (ve.venues ?? []) as VenueOption[],
    };
    return cache;
  })();
  return inflight;
}

export function useLookups() {
  const [lookups, setLookups] = React.useState<Lookups | null>(cache);
  React.useEffect(() => {
    if (!cache) {
      let alive = true;
      fetchLookups().then((l) => {
        if (alive) setLookups(l);
      });
      return () => {
        alive = false;
      };
    }
  }, []);
  return lookups;
}
