/** Anzeige-Helfer für Nutzer (Avatar-Initialen, Label) — Nav und
 *  Nutzerverwaltung teilen sich die Logik. */

export function userLabel(user: { displayName: string | null; email: string }): string {
  return user.displayName?.trim() || user.email;
}

/** „Christine Brand" → CB, „Julia" → JU, sonst erste zwei E-Mail-Zeichen. */
export function userInitials(user: { displayName: string | null; email: string }): string {
  const name = user.displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  return user.email.slice(0, 2).toUpperCase();
}
