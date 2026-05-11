'use client';

import * as React from 'react';
import { getApiHeaders } from '@/lib/client/stores/settings-store';
import type { Orgunit } from '@/lib/shared/types';

// Re-export from shared so existing consumers (filter-sheet, preset-bar)
// keep their `import { Orgunit } from '.../use-lookups'` paths working.
export type { Orgunit };

export type PublicationType = {
  id: string;
  webdb_uid: number;
  name_de: string;
  name_en: string;
};

export type Oestat6 = {
  id: string;
  webdb_uid: number;
  oestat3: number | null;
  name_de: string;
  name_en: string;
  super_domain: number;
  super_domain_label: string | null;
};

export type Lookups = {
  publicationTypes: PublicationType[];
  orgunits: Orgunit[];
  oestat6: Oestat6[];
};

let cache: Lookups | null = null;
let inflight: Promise<Lookups> | null = null;

async function fetchLookups(): Promise<Lookups> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const headers = getApiHeaders();
    const [pt, ou, oe] = await Promise.all([
      fetch('/api/publication-types', { headers }).then((r) => r.json()),
      fetch('/api/orgunits', { headers }).then((r) => r.json()),
      fetch('/api/oestat6', { headers }).then((r) => r.json()),
    ]);
    cache = {
      publicationTypes: (pt.publication_types ?? []) as PublicationType[],
      orgunits: (ou.orgunits ?? []) as Orgunit[],
      oestat6: (oe.oestat6 ?? []) as Oestat6[],
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
