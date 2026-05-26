import Link from 'next/link';
import { CalendarDays, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function EventNotFound() {
  return (
    <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
      <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/50" />
      <h1 className="text-xl font-semibold">Veranstaltung nicht gefunden</h1>
      <p className="text-muted-foreground text-sm">
        Die angeforderte Event-ID existiert nicht (mehr) im lokalen Mirror.
        Möglicherweise wurde sie aus der WEBDB entfernt oder die URL ist
        veraltet.
      </p>
      <Button asChild variant="outline">
        <Link href="/events">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zur Veranstaltungs-Liste
        </Link>
      </Button>
    </div>
  );
}
