import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/api-helpers';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseFromRequest(req);

    const { error } = await supabase
      .from('publications')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseFromRequest(req);

    const { data, error } = await supabase
      .from('publications')
      .select(`
        *,
        publication_type_lookup:publication_types(id, webdb_uid, name_de, name_en),
        person_publications(highlight, mahighlight, authorship, person:persons(*)),
        orgunit_publications(highlight, orgunit:orgunits(id, webdb_uid, name_de, name_en, akronym_de, akronym_en, url_de, url_en)),
        publication_projects(project:projects(*))
      `)
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    // Flatten the nested relations into a friendlier shape.
    const out = {
      ...data,
      authors_resolved: (data.person_publications || [])
        .filter((pp: { person: unknown }) => pp.person)
        .map((pp: { person: Record<string, unknown>; authorship: string | null; highlight: boolean; mahighlight: boolean }) => ({
          ...pp.person,
          authorship: pp.authorship,
          highlight: pp.highlight,
          mahighlight: pp.mahighlight,
        })),
      orgunits: (data.orgunit_publications || [])
        .filter((op: { orgunit: unknown }) => op.orgunit)
        .map((op: { orgunit: Record<string, unknown>; highlight: boolean }) => ({
          ...op.orgunit,
          highlight: op.highlight,
        })),
      projects: (data.publication_projects || [])
        .filter((pp: { project: unknown }) => pp.project)
        .map((pp: { project: Record<string, unknown> }) => pp.project),
    };
    delete out.person_publications;
    delete out.orgunit_publications;
    delete out.publication_projects;

    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
