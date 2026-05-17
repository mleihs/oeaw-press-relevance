'use client';

import {
  BarChart3,
  BookOpen,
  Newspaper,
  Users,
  ClipboardCheck,
  Upload,
  Settings,
  HelpCircle,
  Sun,
  Moon,
  Monitor,
  Keyboard,
  Info,
  type LucideIcon,
} from 'lucide-react';
import type { Binding } from './keybindings';

/**
 * The single source of truth for the command palette, the global keyboard
 * layer, and the cheat-sheet. Specs are pure data (no React, no hooks) so
 * they stay testable; CommandMenu turns each spec into an executable command
 * by binding the hook-dependent ones (theme, toggles) to live setters at
 * render time. Because all three consumers read this one list, a binding can
 * never drift from what the cheat-sheet advertises.
 */

export interface NavSpec {
  id: string;
  kind: 'nav';
  group: 'Navigation';
  label: string;
  icon: LucideIcon;
  href: string;
  binding?: Binding;
  keywords?: string[];
}

export type ActionId =
  | 'theme.light'
  | 'theme.dark'
  | 'theme.system'
  | 'bubbles.toggle'
  | 'shortcuts.toggle'
  | 'cheatsheet.open';

export interface ActionSpec {
  id: string;
  kind: 'action';
  group: 'Aktionen';
  label: string;
  icon: LucideIcon;
  action: ActionId;
  binding?: Binding;
  keywords?: string[];
}

/**
 * Navigation. Mnemonic "g <key>" sequences, German-first:
 *   g d  Dashboard      g p  Publikationen   g r  Triage (Review)
 *   g f  Forscher:innen  g m  Mitteilungen    g i  Import
 *   g s  Einstellungen   g h  Hilfe
 * Routes only (never query-only) so router.push is safe under the Next.js 16
 * query-nav regression.
 */
export const NAV_SPECS: NavSpec[] = [
  {
    id: 'nav.dashboard',
    kind: 'nav',
    group: 'Navigation',
    label: 'Dashboard',
    icon: BarChart3,
    href: '/',
    binding: { kind: 'sequence', lead: 'g', key: 'd' },
    keywords: ['start', 'home', 'übersicht', 'overview'],
  },
  {
    id: 'nav.publications',
    kind: 'nav',
    group: 'Navigation',
    label: 'Publikationen',
    icon: BookOpen,
    href: '/publications',
    binding: { kind: 'sequence', lead: 'g', key: 'p' },
    keywords: ['papers', 'pubs', 'liste', 'bibliothek'],
  },
  {
    id: 'nav.review',
    kind: 'nav',
    group: 'Navigation',
    label: 'Triage-Sitzung',
    icon: ClipboardCheck,
    href: '/review',
    binding: { kind: 'sequence', lead: 'g', key: 'r' },
    keywords: ['review', 'triage', 'pitch', 'hold', 'skip', 'sitzung'],
  },
  {
    id: 'nav.researchers',
    kind: 'nav',
    group: 'Navigation',
    label: 'Forscher:innen',
    icon: Users,
    href: '/researchers',
    binding: { kind: 'sequence', lead: 'g', key: 'f' },
    keywords: ['autoren', 'personen', 'researchers', 'people'],
  },
  {
    id: 'nav.press-releases',
    kind: 'nav',
    group: 'Navigation',
    label: 'Pressemitteilungen',
    icon: Newspaper,
    href: '/press-releases',
    binding: { kind: 'sequence', lead: 'g', key: 'm' },
    keywords: ['press', 'releases', 'coverage', 'mitteilungen'],
  },
  {
    id: 'nav.upload',
    kind: 'nav',
    group: 'Navigation',
    label: 'Import',
    icon: Upload,
    href: '/upload',
    binding: { kind: 'sequence', lead: 'g', key: 'i' },
    keywords: ['upload', 'import', 'webdb', 'ingest'],
  },
  {
    id: 'nav.settings',
    kind: 'nav',
    group: 'Navigation',
    label: 'Einstellungen',
    icon: Settings,
    href: '/settings',
    binding: { kind: 'sequence', lead: 'g', key: 's' },
    keywords: ['settings', 'optionen', 'konfiguration', 'api'],
  },
  {
    id: 'nav.help',
    kind: 'nav',
    group: 'Navigation',
    label: 'Hilfe',
    icon: HelpCircle,
    href: '/help',
    binding: { kind: 'sequence', lead: 'g', key: 'h' },
    keywords: ['help', 'doku', 'wissen', 'kb', 'knowledgebase'],
  },
];

export const ACTION_SPECS: ActionSpec[] = [
  {
    id: 'action.theme.light',
    kind: 'action',
    group: 'Aktionen',
    label: 'Theme: Hell',
    icon: Sun,
    action: 'theme.light',
    keywords: ['light', 'hell', 'thema', 'darstellung'],
  },
  {
    id: 'action.theme.dark',
    kind: 'action',
    group: 'Aktionen',
    label: 'Theme: Dunkel',
    icon: Moon,
    action: 'theme.dark',
    keywords: ['dark', 'dunkel', 'thema', 'darstellung'],
  },
  {
    id: 'action.theme.system',
    kind: 'action',
    group: 'Aktionen',
    label: 'Theme: System',
    icon: Monitor,
    action: 'theme.system',
    keywords: ['system', 'auto', 'thema', 'darstellung'],
  },
  {
    id: 'action.bubbles.toggle',
    kind: 'action',
    group: 'Aktionen',
    label: 'Erklärungs-Bubbles umschalten',
    icon: Info,
    action: 'bubbles.toggle',
    keywords: ['infobubbles', 'erklärung', 'hilfe', 'tooltips'],
  },
  {
    id: 'action.shortcuts.toggle',
    kind: 'action',
    group: 'Aktionen',
    label: 'Tastenkürzel aktivieren / deaktivieren',
    icon: Keyboard,
    action: 'shortcuts.toggle',
    keywords: ['shortcuts', 'tastatur', 'hotkeys', 'barrierefrei'],
  },
  {
    id: 'action.cheatsheet.open',
    kind: 'action',
    group: 'Aktionen',
    label: 'Tastenkürzel anzeigen',
    icon: Keyboard,
    action: 'cheatsheet.open',
    binding: { kind: 'single', key: '?' },
    keywords: ['shortcuts', 'tastatur', 'hilfe', 'cheatsheet', 'übersicht'],
  },
];

// Pure ranking lives in its own isomorphic module (testable without pulling
// the icon-bearing specs); re-exported so consumers keep a single import.
export { scoreCommand } from './score';
