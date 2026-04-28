import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <FileQuestion className="h-10 w-10 text-neutral-400" aria-hidden />
      <div>
        <h1 className="text-xl font-semibold">Nicht gefunden</h1>
        <p className="mt-1 max-w-md text-sm text-neutral-500">
          Die Seite, die du suchst, existiert nicht (mehr).
        </p>
      </div>
      <Button asChild>
        <Link href="/">Zur Startseite</Link>
      </Button>
    </div>
  );
}
