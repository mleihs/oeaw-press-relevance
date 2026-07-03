import { AlertCircle } from '@/lib/icons';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface ApiErrorCardProps {
  title?: string;
  message: string;
  hint?: ReactNode;
  /** Optional recovery control (e.g. a "retry" button wired to error.tsx's
   *  `reset()`). Rendered below the message. */
  action?: ReactNode;
}

export function ApiErrorCard({ title = 'Fehler', message, hint, action }: ApiErrorCardProps) {
  return (
    <Card className="border-red-300/60 dark:border-red-500/30">
      <CardContent className="flex items-start gap-3 p-6">
        <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium text-red-800 dark:text-red-200">{title}</p>
          <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
          {hint && <div className="text-sm text-muted-foreground mt-1">{hint}</div>}
          {action && <div className="mt-3">{action}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
