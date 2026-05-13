import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/server/source';

// Orama-backed full-text search over content/help/*.mdx. The Fumadocs
// SearchProvider on /help fetches this endpoint via the default URL.
export const { GET } = createFromSource(source);
