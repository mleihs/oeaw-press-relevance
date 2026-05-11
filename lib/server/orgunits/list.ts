import { asc } from 'drizzle-orm';
import { db, orgunits as orgunitsTable } from '@/lib/server/db';
import type { Orgunit } from '@/lib/shared/types';

export interface OrgunitsListResult {
  orgunits: Orgunit[];
  total: number;
  research_units_total: number;
}

// Knoten, die strukturell oder administrativ sind — also keine Forschungs-
// einrichtungen. Diese Liste filtert sowohl Hierarchie-Sammelknoten
// ("Bereich") als auch Verwaltungseinheiten (VWST, Personal, Controlling, …)
// heraus.
const STRUCTURAL_NODE_PATTERNS = [
  /^Bereich\b/i,
  /^Mitgliederverwaltung\b/i,
  /^ehemalige\b/i,
  /^Wissenschaftlich orientierte Einheiten/i,
  /^Andere Bereiche/i,
  /^Organisationseinheit für Nicht-ÖAW Track-Record/i,
  /^Institute der Mathematik/i,
  /^Institute der Geistes-/i,
  /^Beratungskommissionen$/i,
  /^Gruppe Altertumswissenschaften$/i,
  /^Arbeitsgruppe Geschichte/i,
  /^Arbeitskreis für Gleichbehandlung/i,
  /^Fusion@ÖAW/i,
  /^Aktuariat/i,
  /^Controlling$/i,
  /^Drittmittelmanagement$/i,
  /^Strategie und Organisations/i,
  /^Internationale Beziehungen$/i,
  /^Forschungsförderung/i,
  /^Knowledge Transfer Office/i,
  /^Qualitätssicherung/i,
  /^Support Wissenschaft und Gesellschaft/i,
  /^Veranstaltungsmanagement$/i,
  /^Zentrale Beschaffung/i,
  /^Personal$/i,
  /^Rechnungswesen$/i,
  /^Präsidialsekretariat$/i,
  /^Stipendien/i,
  /^Geschäftsstelle/i,
  /^Assistenz Finanzen$/i,
  /^Grant Service$/i,
  /^Gebäude & Technik$/i,
  /^Öffentlichkeit & Kommunikation$/i,
  /^Akademie-Gebäude/i,
  /^Akademie-Rechenzentrum$/i,
  /^Bibliothek, Archiv, Sammlungen/i,
  /^Administration Institute$/i,
  /^CLEARINGSTELLE/i,
  /^HPDA/i,
  /^AG Geschichte der Soziologie/i,
];

function isStructuralNode(name: string | null | undefined): boolean {
  if (!name) return false;
  return STRUCTURAL_NODE_PATTERNS.some((re) => re.test(name));
}

// Explicit Drizzle row -> shared Orgunit DTO. A column rename in the schema
// fails to compile here, surfacing schema drift at build time (Plan §7.1).
function toApi(
  row: typeof orgunitsTable.$inferSelect,
  tier: number,
  isResearchUnit: boolean,
): Orgunit {
  return {
    id: row.id,
    webdb_uid: row.webdbUid,
    name_de: row.nameDe,
    name_en: row.nameEn,
    akronym_de: row.akronymDe,
    akronym_en: row.akronymEn,
    url_de: row.urlDe,
    url_en: row.urlEn,
    parent_id: row.parentId,
    tier,
    is_research_unit: isResearchUnit,
  };
}

/**
 * Returns all orgunits with computed `tier` (depth from the root) and
 * `is_research_unit` (tier 4 + non-structural + has akronym).
 *
 * Tier 4 in the ÖAW hierarchy:
 *   ÖAW (0) → Bereich FE/w-o (1) → FE MN/PH (2) → Klasse (3) → Institut (4).
 * Sub-AGs, Abteilungen, Subkommissionen liegen tiefer und gehören nicht in
 * den Top-Filter. Strukturelle Knoten ohne Akronym auch nicht.
 */
export async function listOrgunits(): Promise<OrgunitsListResult> {
  // Drizzle pages internally; one .select() returns all rows here. The
  // Supabase-JS version paginated because PostgREST caps at 1000 — Drizzle's
  // direct postgres-js connection has no such limit.
  const rows = await db
    .select()
    .from(orgunitsTable)
    .orderBy(asc(orgunitsTable.nameDe));

  // Compute tier via memoized DFS with cycle guard.
  const byId = new Map(rows.map((o) => [o.id, o]));
  const tierCache = new Map<string, number>();
  function getTier(id: string, seen = new Set<string>()): number {
    const cached = tierCache.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0;
    seen.add(id);
    const node = byId.get(id);
    if (!node) return 0;
    const t = !node.parentId ? 0 : getTier(node.parentId, seen) + 1;
    tierCache.set(id, t);
    return t;
  }

  const mapped: Orgunit[] = rows.map((row) => {
    const tier = getTier(row.id);
    const isResearchUnit =
      tier === 4 && !isStructuralNode(row.nameDe) && !!row.akronymDe;
    return toApi(row, tier, isResearchUnit);
  });

  return {
    orgunits: mapped,
    total: mapped.length,
    research_units_total: mapped.filter((o) => o.is_research_unit).length,
  };
}
