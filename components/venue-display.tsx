import { ExternalLink } from '@/lib/icons';
import { lookupVenue } from '@/lib/shared/venue-registry';

/**
 * Renders a venue value with optional canonical name + domain link from the
 * venue registry. Used in the publication detail page next to the
 * type-aware SectionLabel. For unknown venues, shows the raw string with no
 * decoration — honest fallback.
 *
 * The canonical name replaces corpus variants like "DerStandard.at" with
 * the authoritative "Der Standard"; the domain (when known) renders as a
 * small external-link decoration that opens the outlet's site in a new tab
 * with proper security attributes.
 */
export function VenueDisplay({ raw }: { raw: string }) {
  const meta = lookupVenue(raw);
  const display = meta?.canonicalName ?? raw;
  return (
    <>
      {display}
      {meta?.domain && (
        <a
          href={`https://${meta.domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground/70 hover:text-brand transition-colors"
          aria-label={`${meta.canonicalName} im neuen Tab öffnen`}
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
          {meta.domain}
        </a>
      )}
    </>
  );
}
