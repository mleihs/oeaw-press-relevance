import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/server/source';

// `nav.enabled: false` because the host app already renders its own brand
// nav (components/nav.tsx) above {children}. We only want Fumadocs to own
// the sidebar / TOC / breadcrumb chrome — not a second top bar.
export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout tree={source.pageTree} nav={{ enabled: false }}>
      {children}
    </DocsLayout>
  );
}
