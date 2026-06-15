import type { Metadata } from 'next';

// Server layout wrapper: the /researchers page itself is a Client Component
// (heavy nuqs-driven filtering + react-query), so it can't export metadata.
// This thin server boundary supplies the document title instead of falling
// back to the root title.
export const metadata: Metadata = {
  title: 'Forscher:innen | Story Scout',
};

export default function ResearchersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
