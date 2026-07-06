import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/server/source';

// `nav.enabled: false` hides Fumadocs's own top bar; the host app already
// renders its own brand nav above {children}. `nav.title` is still required
// because the sidebar header reuses it as the back-to-home link — without
// a visible title the link fails axe-core's link-name rule.
export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{ enabled: false, title: 'ÖAW Presse · Hilfe' }}
    >
      {children}
    </DocsLayout>
  );
}
