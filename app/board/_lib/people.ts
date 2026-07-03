import type { BoardMember } from '@/lib/shared/board';

// Deterministische Personenfarben (Design Book Team-Palette). Hash der UUID ->
// stabile Farbe, damit Avatare überall gleich aussehen ohne DB-Spalte.
const PERSON_COLORS = [
  '#2563eb', '#0d9488', '#7c3aed', '#ea580c', '#c026d3',
  '#16a34a', '#0891b2', '#d97706', '#4f46e5', '#db2777',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function colorForUser(userId: string): string {
  return PERSON_COLORS[hash(userId) % PERSON_COLORS.length];
}

// Boards haben keine Farb-Spalte (§4) — Akzent deterministisch aus der id, wie
// die Personenfarben. Rein kosmetisch (Kachel-Linksrand/Icon).
const BOARD_ACCENTS = [
  '#0047bb', '#0d9488', '#ea580c', '#c026d3', '#7c3aed',
  '#16a34a', '#2563eb', '#dc2626', '#64748b', '#0891b2',
];
export function boardAccent(boardId: string): string {
  return BOARD_ACCENTS[hash(boardId) % BOARD_ACCENTS.length];
}

export function displayNameOf(member: BoardMember | undefined | null): string {
  if (!member) return 'Unbekannt';
  return member.display_name?.trim() || member.email;
}

export function firstNameOf(member: BoardMember | undefined | null): string | null {
  if (!member) return null;
  const name = member.display_name?.trim();
  if (name) return name.split(/\s+/)[0];
  return member.email.split('@')[0] || null;
}

export function initialsOf(member: BoardMember | undefined | null): string {
  if (!member) return '?';
  const name = member.display_name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return member.email.slice(0, 2).toUpperCase();
}

/** Nachschlage-Map für schnelle Auflösung id -> member. */
export function membersById(members: BoardMember[]): Map<string, BoardMember> {
  return new Map(members.map((m) => [m.id, m]));
}
