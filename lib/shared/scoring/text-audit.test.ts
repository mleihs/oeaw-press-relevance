import { describe, it, expect } from 'vitest';
import {
  auditItem,
  auditBatch,
  splitSentences,
  closingBigram,
  countFindings,
  AUDIT_CODES,
  type AuditItem,
  type AuditCode,
} from './text-audit';

const GOOD_PITCH =
  'Ein Team des Instituts für Interdisziplinäre Gebirgsforschung hat gemessen, wie schnell Zwergsträucher auf Gipfeln der Alpen nach oben wandern. Der Befund ist robust.';

const pub = (texts: AuditItem['texts'], id = 'p1'): AuditItem => ({ id, texts });
const codesOf = (item: AuditItem, entity: 'publications' | 'events' = 'publications') =>
  auditItem(item, { entity }).map((f) => f.code);

describe('auditItem', () => {
  it('finds nothing in a clean record', () => {
    expect(
      codesOf(
        pub({
          pitch_suggestion: GOOD_PITCH,
          suggested_angle: 'Wie weit die Sträucher in zehn Jahren gewandert sind.',
          reasoning: 'Klarer Befund mit langer Messreihe. Die Methode ist etabliert.',
          target_audience: 'Wissenschaftsressorts, Umweltmedien',
        }),
      ),
    ).toEqual([]);
  });

  const cases: Array<[AuditCode, AuditItem['texts'], AuditItem['texts']]> = [
    ['leak', { reasoning: 'Da peer_reviewed = true, hoch.' }, { reasoning: 'Begutachtet in einer Fachzeitschrift.' }],
    ['leak', { pitch_suggestion: `${GOOD_PITCH} Die Arbeit ist peer-reviewed.` }, { target_audience: 'peer-reviewed Fachpresse' }],
    ['leak', { suggested_angle: 'Vom Institut pressetauglich markiert.' }, { suggested_angle: 'Vom Institut gemessen.' }],
    // Der Bewertungsvorgang im Text (übernommene Zwillingsbewertung, Handlauf 28.10.).
    ['leak', { reasoning: 'Der Vortrag wurde auf der Zentralseite bereits bewertet, daher gilt dieselbe Einstufung.' }, { reasoning: 'Der Vortrag wurde im Programmheft bereits angekündigt.' }],
    ['leak', { reasoning: 'Deshalb bleibt die Bewertung identisch.' }, { reasoning: 'Die Bewertung der Quellen durch das Team ist neu.' }],
    ['em_dash', { reasoning: 'Der Befund — robust.' }, { reasoning: 'Zeitraum 1975–1980 belegt.' }],
    ['em_dash', { reasoning: 'Der Befund – robust.' }, { reasoning: 'Seiten 12–14.' }],
    ['umlaut_digraph', { reasoning: 'Die Studie zeigt Ueberraschendes.' }, { reasoning: 'Die Studie ist aktuell und virtuell, die Statue bleibt.' }],
    ['umlaut_digraph', { reasoning: 'Eine Fuelle von Daten.' }, { reasoning: 'Kongruenz und Influenz, Samuel und Israel.' }],
    ['filler', { pitch_suggestion: `${GOOD_PITCH} Dankbares Thema für eine Bildstrecke.` }, { pitch_suggestion: GOOD_PITCH }],
    ['filler', { pitch_suggestion: `${GOOD_PITCH} Das eignet sich für ein Feature.` }, { pitch_suggestion: `${GOOD_PITCH} Das Verfahren eignet sich zur Diagnostik.` }],
    ['fallback_phrase', { reasoning: 'Ohne aktuellen Anlass schwer zu vermitteln.' }, { reasoning: 'Der Anlass ist die Messkampagne.' }],
    ['fallback_phrase', { target_audience: 'breites Publikum' }, { target_audience: 'Wissenschaftsressorts' }],
    ['pitch_length', { pitch_suggestion: 'Zu kurz.' }, { pitch_suggestion: GOOD_PITCH }],
    ['es_start', { reasoning: 'Es zeigt sich viel. Es bleibt robust.' }, { reasoning: 'Es zeigt sich viel. Der Befund bleibt robust.' }],
  ];

  it.each(cases)('flags %s and spares the negative case', (code, positive, negative) => {
    expect(codesOf(pub(positive))).toContain(code);
    expect(codesOf(pub(negative))).not.toContain(code);
  });

  // Bewertungssprache, wie sie in der ersten Nacht und im Bestand stand (2026-10-29).
  // Positiv und negativ je Entität: was bei Events Prozess ist, kann bei
  // Publikationen Inhalt sein.
  const process: Array<[string, 'publications' | 'events', boolean]> = [
    ['Das Seminar zählt damit zu den Fachvorträgen im engen Kreis.', 'events', true],
    ['Die Werte entsprechen deshalb dem Bereich interner Fachseminare.', 'events', true],
    ['Das rechtfertigt eine Einstufung klar im Flaggschiff-Bereich.', 'events', true],
    ['Als Termin einer Fachreihe liegt er im mittleren Bereich.', 'events', true],
    ['Weil derselbe Termin auch mit ausführlicherem Text angekündigt ist, werden beide Einträge gleich eingestuft.', 'events', true],
    ['Die Bewertung entspricht daher der englischen Fassung.', 'events', true],
    ['Englische Fassung des Vortrags.', 'events', true],
    ['Bewertung unveraendert gegenueber dem ersten Durchgang.', 'events', true],
    ['Bewusst niedrig bewertet, das Event fällt automatisch in den Pool zurück.', 'events', true],
    ['Die Bewertung fällt entsprechend sehr niedrig aus.', 'publications', true],
    ['Deutsche Version des bereits im vorigen Batch bewerteten englischen Dossiers.', 'publications', true],
    ['Höchster Score in diesem Batch.', 'publications', true],
    ['Die hohe Novelty rechtfertigt den höheren Novelty-Score.', 'publications', true],
    ['Wer als chancenarm eingestuft wird, bekommt weniger Weiterbildung.', 'publications', false],
    ['Die englische Fassung des Dossiers erschien parallel.', 'publications', false],
    ['Digitale Zwillinge des Herzens und der Apgar-Score der Neugeborenen.', 'publications', false],
    ['Die Spektren zeigen das Kalium-Dublett, die kalten Seen tragen die höchsten Werte.', 'publications', false],
    ['Keinerlei Medienrelevanz, niedrigste Werte im Batch.', 'publications', true],
    ['Die Ankündigung nennt weder Vortragende noch Ort.', 'events', false],
    ['Ein Fachvortrag für die Arbeitsgruppe, ohne Bezug zur Tagespolitik.', 'events', false],
    ['Das Podium fragt, wie sich KI-Risiken bewerten lassen.', 'events', false],
  ];

  it.each(process)('process language: %s (%s) → leak %s', (reasoning, entity, leaks) => {
    expect(codesOf(pub({ reasoning }), entity).includes('leak')).toBe(leaks);
  });

  it('checks fillers only in publication pitches', () => {
    const texts = { pitch_suggestion: `${GOOD_PITCH} Ein Aufmacher.` };
    expect(codesOf(pub(texts), 'publications')).toContain('filler');
    expect(codesOf(pub(texts), 'events')).not.toContain('filler');
  });

  it('applies the shorter event pitch bounds', () => {
    const texts = { pitch_suggestion: 'Ein Abend über Handschriften aus dem 16. Jahrhundert, mit Führung.' };
    expect(codesOf(pub(texts), 'events')).not.toContain('pitch_length');
    expect(codesOf(pub(texts), 'publications')).toContain('pitch_length');
    expect(codesOf(pub({ pitch_suggestion: 'x'.repeat(701) }), 'events')).toContain('pitch_length');
  });

  it('names the field and the offending text', () => {
    const [f] = auditItem(pub({ reasoning: 'Weil mahighlight=1.' }), { entity: 'publications' });
    expect(f).toEqual({ id: 'p1', field: 'reasoning', code: 'leak', detail: 'mahighlight=' });
  });

  it('spares names that the source spells with oe/ue', () => {
    const texts = { reasoning: 'Gefördert von Boehringer Ingelheim, geleitet von Coelho.' };
    expect(codesOf(pub(texts))).toContain('umlaut_digraph');
    const source = { text: 'Funded by Boehringer Ingelheim.', names: ['Coelho, Ana'] };
    expect(codesOf({ id: 'p1', texts, source })).not.toContain('umlaut_digraph');
    // Ein echter Ersatz neben dem Namen bleibt ein Befund.
    expect(codesOf({ id: 'p1', texts: { reasoning: `${texts.reasoning} Eine Fuelle von Daten.` }, source })).toContain(
      'umlaut_digraph',
    );
  });

  it('skips fields that are missing or not strings', () => {
    expect(codesOf(pub({ pitch_suggestion: undefined, reasoning: null }))).toEqual([]);
  });
});

describe('splitSentences', () => {
  it('splits on sentence ends', () => {
    expect(splitSentences('Eins ist da. Zwei folgt! Drei? Vier.')).toEqual(['Eins ist da.', 'Zwei folgt!', 'Drei?', 'Vier.']);
  });

  it('does not split after ordinals, Roman numerals and abbreviations', () => {
    expect(splitSentences('Der XXII. Parteitag tagte. Danach Ruhe.')).toEqual(['Der XXII. Parteitag tagte.', 'Danach Ruhe.']);
    expect(splitSentences('Im 16. Jahrhundert entstand das. Dann nicht.')).toEqual([
      'Im 16. Jahrhundert entstand das.',
      'Dann nicht.',
    ]);
    expect(splitSentences('Etwa z. B. Moose. Und Flechten.')).toEqual(['Etwa z. B. Moose.', 'Und Flechten.']);
    expect(splitSentences('Laut Dr. Huber stimmt das. Sagt sie.')).toEqual(['Laut Dr. Huber stimmt das.', 'Sagt sie.']);
    expect(splitSentences('Das gilt u.a. für Moose. Gut.')).toEqual(['Das gilt u.a. für Moose.', 'Gut.']);
  });

  it('still ends a sentence on a year', () => {
    expect(splitSentences('Das war 1975. Danach kam mehr.')).toEqual(['Das war 1975.', 'Danach kam mehr.']);
  });

  it('keeps a lower-case continuation in the sentence', () => {
    expect(splitSentences('Rund 3 Mio. von ihnen leben dort. Gut.')).toEqual(['Rund 3 Mio. von ihnen leben dort.', 'Gut.']);
  });
});

describe('closingBigram', () => {
  it('returns the last two words, lower-cased, without punctuation', () => {
    expect(closingBigram('Das verschiebt die Debatte grundlegend.')).toBe('debatte grundlegend');
    expect(closingBigram('Kurz.')).toBeNull();
  });
});

describe('auditBatch', () => {
  const chunk = (pitches: string[], angles: string[] = []): AuditItem[] =>
    pitches.map((p, i) => ({ id: `p${i}`, texts: { pitch_suggestion: p, suggested_angle: angles[i] } }));

  it('flags the same closing bigram in two records', () => {
    const findings = auditBatch(
      chunk([
        'Moose wandern nach oben. Das verschiebt die Debatte grundlegend.',
        'Gletscher schmelzen schneller. Auch das verändert die Debatte grundlegend.',
        'Flechten bleiben stabil. Der Rest ist offen.',
      ]),
      { entity: 'publications' },
    );
    const dup = findings.filter((f) => f.code === 'closing_bigram_dup');
    expect(dup.map((f) => f.id).sort()).toEqual(['p0', 'p1']);
    expect(dup[0].detail).toContain('debatte grundlegend');
  });

  it('flags a three-word sequence in three records, not in two', () => {
    const three = auditBatch(
      chunk(['Die Studie zeigt Moose.', 'Die Studie zeigt Flechten.', 'Die Studie zeigt Farne.']),
      { entity: 'publications' },
    );
    expect(three.filter((f) => f.code === 'trigram_rep' && f.detail.includes('die studie zeigt'))).toHaveLength(3);

    const two = auditBatch(chunk(['Die Studie zeigt Moose.', 'Die Studie zeigt Flechten.', 'Anders hier.']), {
      entity: 'publications',
    });
    expect(two.filter((f) => f.code === 'trigram_rep')).toHaveLength(0);
  });

  it('does not count the institutional anchor the rubric demands as repetition', () => {
    const findings = auditBatch(
      chunk([
        'Forschende der Österreichischen Akademie der Wissenschaften messen Moose.',
        'Ein Team der Österreichischen Akademie der Wissenschaften zählt Flechten.',
        'An der Österreichischen Akademie der Wissenschaften entstand ein Farnatlas.',
      ]),
      { entity: 'publications' },
    );
    expect(findings.filter((f) => f.code === 'trigram_rep')).toHaveLength(0);
  });

  it('does not count institute names and source wording as repetition', () => {
    const pitches = [
      'Am Institut für Molekulare Biotechnologie der ÖAW wachsen Mini-Gehirne.',
      'Forschende vom Institut für Molekulare Biotechnologie der ÖAW messen Proteine.',
      'Das Institut für Molekulare Biotechnologie der ÖAW zeigt neue Nervenzellen.',
    ];
    const plain = auditBatch(chunk(pitches), { entity: 'publications' });
    expect(plain.filter((f) => f.code === 'trigram_rep').length).toBeGreaterThan(0);

    const sourced = chunk(pitches).map((it) => ({
      ...it,
      source: { text: 'Abstract.', names: ['IMBA', 'Institut für Molekulare Biotechnologie'] },
    }));
    expect(auditBatch(sourced, { entity: 'publications' }).filter((f) => f.code === 'trigram_rep')).toHaveLength(0);

    // Eine Folge aus der eigenen Quelle ist Material, eine fremde bleibt Monotonie.
    const quoted = chunk(['Die Studie zeigt Moose.', 'Die Studie zeigt Flechten.', 'Die Studie zeigt Farne.']).map(
      (it, i) => ({ ...it, source: { text: i === 0 ? 'Die Studie zeigt Moose im Hochgebirge.' : 'Abstract.', names: [] } }),
    );
    const ids = auditBatch(quoted, { entity: 'publications' })
      .filter((f) => f.code === 'trigram_rep' && f.detail.includes('die studie zeigt'))
      .map((f) => f.id);
    expect(ids).toEqual([]);
  });

  it('flags monotonous "Stichwort: Satz" angles above half of at least five', () => {
    const pitches = ['a b c.', 'd e f.', 'g h i.', 'j k l.', 'm n o.'];
    const colon = ['Moose: wandern.', 'Flechten: bleiben.', 'Farne: gehen.', 'Gras wächst.', 'Wald stirbt.'];
    const flagged = auditBatch(chunk(pitches, colon), { entity: 'publications' }).filter(
      (f) => f.code === 'angle_form_monotony',
    );
    expect(flagged.map((f) => f.id)).toEqual(['p0', 'p1', 'p2']);

    const balanced = ['Moose: wandern.', 'Flechten: bleiben.', 'Farne gehen.', 'Gras wächst.', 'Wald stirbt.'];
    expect(
      auditBatch(chunk(pitches, balanced), { entity: 'publications' }).filter((f) => f.code === 'angle_form_monotony'),
    ).toHaveLength(0);

    // Unter fünf Winkeln ist ein Anteil keine Aussage.
    expect(
      auditBatch(chunk(pitches.slice(0, 4), colon.slice(0, 4)), { entity: 'publications' }).filter(
        (f) => f.code === 'angle_form_monotony',
      ),
    ).toHaveLength(0);
  });

  it('leaves target_audience lists alone', () => {
    const items: AuditItem[] = ['a', 'b', 'c'].map((id) => ({
      id,
      texts: { target_audience: 'Wissenschaftsressorts der Tageszeitungen und Umweltmedien' },
    }));
    expect(auditBatch(items, { entity: 'publications' })).toEqual([]);
  });
});

describe('countFindings', () => {
  it('reports every code, zero where nothing was found', () => {
    const counts = countFindings(auditItem(pub({ reasoning: 'Weil mahighlight=1 — klar.' }), { entity: 'publications' }));
    expect(Object.keys(counts)).toEqual([...AUDIT_CODES]);
    expect(counts.leak).toBe(1);
    expect(counts.em_dash).toBe(1);
    expect(counts.filler).toBe(0);
  });
});
