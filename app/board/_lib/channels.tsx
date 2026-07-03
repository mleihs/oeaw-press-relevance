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
  type LucideIcon,
} from '@/lib/icons';

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
