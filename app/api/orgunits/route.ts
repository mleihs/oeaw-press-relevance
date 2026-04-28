import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/api-helpers';

type OrgUnit = {
  id: string;
  webdb_uid?: string | null;
  name_de?: string | null;
  name_en?: string | null;
  akronym_de?: string | null;
  akronym_en?: string | null;
  parent_id?: string | null;
  tier?: number;
  is_research_unit?: boolean;
};

// Knoten, die strukturell oder administrativ sind — also keine Forschungs-
// einrichtungen. Diese Liste filtert sowohl Hierarchie-Sammelknoten ("Bereich")
// als auch Verwaltungseinheiten (VWST, Personal, Controlling, …) heraus.
const STRUCTURAL_NODE_PATTERNS = [
  // Hierarchie-Sammelknoten
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
  // Administrative Klammern und Verwaltungseinheiten
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

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(req);

    const all: OrgUnit[] = [];
    const batchSize = 1000;
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await supabase
        .from('orgunits')
        .select('id, webdb_uid, name_de, name_en, akronym_de, akronym_en, parent_id')
        .order('name_de', { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < batchSize) break;
    }

    // Compute tier (distance to closest root with parent_id IS NULL).
    const byId = new Map(all.map((o) => [o.id, o]));
    const tierCache = new Map<string, number>();
    function getTier(id: string, seen = new Set<string>()): number {
      if (tierCache.has(id)) return tierCache.get(id) as number;
      if (seen.has(id)) return 0; // cycle guard
      seen.add(id);
      const node = byId.get(id);
      if (!node) return 0;
      const t = !node.parent_id ? 0 : getTier(node.parent_id as string, seen) + 1;
      tierCache.set(id, t);
      return t;
    }
    for (const o of all) {
      o.tier = getTier(o.id);
      // Forschungseinrichtungen sitzen auf tier 4 in der ÖAW-Hierarchie:
      // ÖAW (0) → Bereich FE/w-o (1) → FE MN/PH (2) → Klasse (3) → Institut (4).
      // Sub-AGs, Abteilungen, Subkommissionen liegen tiefer und gehören nicht
      // in den Top-Filter. Strukturelle Knoten ohne Akronym auch nicht.
      o.is_research_unit =
        o.tier === 4 &&
        !isStructuralNode(o.name_de) &&
        !!o.akronym_de;
    }

    return NextResponse.json({
      orgunits: all,
      total: all.length,
      research_units_total: all.filter((o) => o.is_research_unit).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
