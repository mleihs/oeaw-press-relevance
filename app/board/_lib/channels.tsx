import { createElement, type CSSProperties } from 'react';
import {
  Megaphone,
  Globe,
  PenTool,
  Mic,
  CalendarDays,
  Monitor,
  Sparkles,
  Archive,
  Newspaper,
  Radio,
  Camera,
  Image,
  InstagramLogo,
  Mail,
  MessageCircle,
  Flame,
  Star,
  Heart,
  Award,
  Crown,
  Radar,
  MapPin,
  Users,
  Tag,
  type LucideIcon,
} from '@/lib/icons';
import { BOARD_COLUMN_ICONS, type BoardColumn, type BoardColumnIconKey } from '@/lib/shared/board';

/**
 * Kanalname -> Icon + Kurzname (Design Book). Keine DB-Spalte: die 8
 * Ausspielkanäle des „Channels"-Boards werden über ihren Spaltennamen gemappt;
 * generische Boards haben freie Spalten ohne Icon (Fallback null -> nur der
 * Farbpunkt). Icons kommen über das zentrale `@/lib/icons`-Modul (Phosphor,
 * Rollout Phase C); Kanal→Icon-Mapping in docs/design/DESIGN_SYSTEM.md §7.
 */
const CHANNELS: Record<string, { icon: LucideIcon; short: string }> = {
  'pm/presse': { icon: Megaphone, short: 'Presse' },
  presse: { icon: Megaphone, short: 'Presse' },
  web: { icon: Globe, short: 'Web' },
  'blog gö': { icon: PenTool, short: 'Blog' },
  blog: { icon: PenTool, short: 'Blog' },
  podcast: { icon: Mic, short: 'Podcast' },
  events: { icon: CalendarDays, short: 'Events' },
  screens: { icon: Monitor, short: 'Screens' },
  'science pop': { icon: Sparkles, short: 'Sci Pop' },
  zeitlos: { icon: Archive, short: 'Zeitlos' },
};

export function channelIcon(name: string): LucideIcon | null {
  return CHANNELS[name.trim().toLowerCase()]?.icon ?? null;
}

/**
 * Frei wählbare Kanal-Icons: Schlüssel (BOARD_COLUMN_ICONS, gespeichert in
 * board_columns.icon) → Phosphor-Komponente. `Record<BoardColumnIconKey, …>`
 * erzwingt Vollständigkeit — fehlt ein Schlüssel, bricht der Typecheck. Die
 * Reihenfolge/Labels des Pickers kommen aus BOARD_COLUMN_ICONS (shared).
 */
const COLUMN_ICONS: Record<BoardColumnIconKey, LucideIcon> = {
  megaphone: Megaphone,
  globe: Globe,
  pen: PenTool,
  mic: Mic,
  calendar: CalendarDays,
  monitor: Monitor,
  sparkles: Sparkles,
  archive: Archive,
  newspaper: Newspaper,
  radio: Radio,
  camera: Camera,
  image: Image,
  instagram: InstagramLogo,
  mail: Mail,
  message: MessageCircle,
  flame: Flame,
  star: Star,
  heart: Heart,
  award: Award,
  crown: Crown,
  radar: Radar,
  map: MapPin,
  users: Users,
  tag: Tag,
};

export function columnIconByKey(key: string | null | undefined): LucideIcon | null {
  return key ? (COLUMN_ICONS[key as BoardColumnIconKey] ?? null) : null;
}

/** Picker-Auswahl (Schlüssel + Label + Komponente) in Anzeige-Reihenfolge. */
export const COLUMN_ICON_CHOICES: { key: BoardColumnIconKey; label: string; Icon: LucideIcon }[] =
  BOARD_COLUMN_ICONS.map((c) => ({ key: c.key, label: c.label, Icon: COLUMN_ICONS[c.key] }));

/**
 * Effektives Spalten-Icon: explizit gewähltes Icon (column.icon) hat Vorrang,
 * sonst das namensbasierte Kanal-Mapping (Rückwärtskompatibilität). null → nur
 * der Farbkopf ohne Icon.
 */
export function ColumnIcon({
  column,
  className,
  style,
}: {
  column: Pick<BoardColumn, 'icon' | 'name'>;
  className?: string;
  style?: CSSProperties;
}) {
  const icon = columnIconByKey(column.icon) ?? channelIcon(column.name);
  return icon ? createElement(icon, { className, style }) : null;
}

export function channelShort(name: string): string {
  return CHANNELS[name.trim().toLowerCase()]?.short ?? name;
}

/** Rendert das Kanal-Icon (oder nichts bei generischen Spalten). Eigene
 *  Komponente + createElement, damit die react-hooks/static-components-Regel
 *  nicht anschlägt (kein `const Icon = fn()` im Render der Aufrufer). */
export function ChannelIcon({
  name,
  className,
  style,
}: {
  name: string;
  className?: string;
  style?: CSSProperties;
}) {
  const icon = channelIcon(name);
  return icon ? createElement(icon, { className, style }) : null;
}
