'use client';

import { useQueryStates, debounce } from 'nuqs';
import { filterParsers } from './_filters';

export function useFilters() {
  return useQueryStates(filterParsers, {
    shallow: false,
    limitUrlUpdates: debounce(250),
    history: 'replace',
    clearOnDefault: true,
  });
}
