'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScoringModal } from '@/components/scoring-modal';
import { Brain } from '@/lib/icons';

// „Bewerten"-Trigger in der /events-Toolbar. Öffnet das gemeinsame
// ScoringModal (entity='events') — dasselbe Modal wie die Dashboard-Kachel und
// die Publikationsseite, damit der Fallback-Weg „aus einem Guss" ist. Ersetzt
// das frühere self-contained event-analyze-modal.tsx.
export function EventScoreButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Brain className="mr-2 h-4 w-4" />
        Bewerten
      </Button>
      <ScoringModal entity="events" open={open} onOpenChange={setOpen} />
    </>
  );
}
