import { createElement } from 'react';
import {
  Plus,
  Check,
  Paperclip,
  ArrowRightToLine,
  Clock,
  CheckCircle2,
  Layers,
  MessageCircle,
  RotateCcw,
  UserPlus,
  type LucideIcon,
} from '@/lib/icons';
import type { CardActivityEntry } from '@/lib/shared/board';

const ICONS: Record<string, LucideIcon> = {
  created: Plus,
  created_from_subtask: Plus,
  created_from_triage: Plus,
  moved: ArrowRightToLine,
  completed: CheckCircle2,
  reopened: RotateCcw,
  due_set: Clock,
  due_cleared: Clock,
  assignee_set: UserPlus,
  assignee_cleared: UserPlus,
  item_checked: Check,
  item_unchecked: RotateCcw,
  attachment_added: Paperclip,
  comment_added: MessageCircle,
  reference_added: Layers,
  reference_removed: Layers,
};

export function activityIcon(verb: string): LucideIcon {
  return ICONS[verb] ?? Clock;
}

/** Eigene Komponente + createElement (react-hooks/static-components). */
export function ActivityIcon({ verb, className }: { verb: string; className?: string }) {
  return createElement(activityIcon(verb), { className });
}

/** Deutsche Verb-Phrase für den Aktivitäts-Strang. Text-Item-Verben greifen auf
 *  payload.text zurück (der Server legt ihn beim item_checked/unchecked ab). */
export function activityPhrase(a: CardActivityEntry): string {
  const text = typeof a.payload.text === 'string' ? a.payload.text : '';
  switch (a.verb) {
    case 'created':
      return 'hat die Karte angelegt';
    case 'created_from_subtask':
      return 'hat die Karte aus einer Unteraufgabe angelegt';
    case 'created_from_triage':
      return 'hat die Karte aus der Triage angelegt';
    case 'moved':
      return 'hat die Karte verschoben';
    case 'completed':
      return 'hat die Karte abgeschlossen';
    case 'reopened':
      return 'hat die Karte wieder geöffnet';
    case 'due_set':
      return 'hat die Fälligkeit gesetzt';
    case 'due_cleared':
      return 'hat die Fälligkeit entfernt';
    case 'assignee_set':
      return 'hat die Zuständigkeit gesetzt';
    case 'assignee_cleared':
      return 'hat die Zuständigkeit entfernt';
    case 'item_added': {
      const kind = a.payload.kind;
      if (kind === 'subtask') {
        return text ? `hat die Unteraufgabe „${text}" angelegt` : 'hat eine Unteraufgabe angelegt';
      }
      return text ? `hat „${text}" zur Checkliste hinzugefügt` : 'hat einen Checklisten-Eintrag hinzugefügt';
    }
    case 'item_checked':
      return text ? `hat „${text}" abgehakt` : 'hat einen Eintrag abgehakt';
    case 'item_unchecked':
      return text ? `hat „${text}" wieder geöffnet` : 'hat einen Eintrag wieder geöffnet';
    case 'attachment_added':
      return 'hat einen Anhang hinzugefügt';
    case 'comment_added':
      return 'hat einen Kommentar geschrieben';
    case 'reference_added': {
      const title = typeof a.payload.title === 'string' ? a.payload.title : '';
      return title ? `hat „${title}" verknüpft` : 'hat ein Objekt verknüpft';
    }
    case 'reference_removed': {
      const title = typeof a.payload.title === 'string' ? a.payload.title : '';
      return title
        ? `hat die Verknüpfung zu „${title}" entfernt`
        : 'hat eine Objekt-Verknüpfung entfernt';
    }
    default:
      return a.verb;
  }
}
