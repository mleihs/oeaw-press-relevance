'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScoringModal } from '@/components/scoring-modal';
import { Brain } from '@/lib/icons';

/**
 * „Bewerten"-Knopf für eine EINZELNE Publikation bzw. ein einzelnes Event auf
 * der jeweiligen Detailseite. Bis 2026-07-21 war ein Score von dort aus nur
 * erreichbar, indem man aufs Dashboard zurückging und einen Batch startete,
 * der die gerade betrachtete Publikation womöglich gar nicht enthält.
 *
 * Die Maschinerie ist dieselbe wie im Batch-Lauf (ScoringModal + `ids` im
 * Payload), damit es keinen zweiten Scoring-Pfad mit eigener Semantik gibt.
 * Insbesondere gelten die Bewertbarkeits-Gates auch hier: was sie aussortieren,
 * meldet das Modal als „übersprungen" mit Begründung.
 */
export function ScoreNowButton({
  entity,
  id,
  label = 'Bewerten',
  variant = 'outline',
  size = 'sm',
  className,
}: {
  entity: 'publications' | 'events';
  id: string;
  label?: string;
  variant?: 'default' | 'outline';
  size?: 'sm' | 'default';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        title="Über OpenRouter bewerten (kostet Guthaben)"
      >
        <Brain className="h-4 w-4" weight="duotone" />
        {label}
      </Button>
      <ScoringModal entity={entity} ids={[id]} open={open} onOpenChange={setOpen} />
    </>
  );
}
