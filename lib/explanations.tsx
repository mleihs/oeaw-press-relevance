// Central source of truth for "what does this number mean / how was it computed".
// Every metric, badge, derived value, and threshold across the UI references
// these entries via <InfoBubble id="…" />. Editing wording in one place updates
// the whole interface — no drift between Spotlight, Table, Detail, Publication views.
//
// Conventions:
// - `title`     short headline (≤ 6 words)
// - `formula`   optional inline-code block (mathematical formula)
// - `body`      JSX for the main explanation, multi-paragraph allowed
// - `example`   optional concrete example
// - `note`      optional caveat / data-quality warning

import type { ReactNode } from 'react';

export interface Explanation {
  title: string;
  formula?: string;
  body: ReactNode;
  example?: ReactNode;
  note?: ReactNode;
}

const Para = ({ children }: { children: ReactNode }) => <p className="leading-relaxed">{children}</p>;
const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] text-neutral-800">{children}</code>
);

export const EXPL: Record<string, Explanation> = {
  // ─── Per-publication press_score ─────────────────────────────────────────
  press_score: {
    title: 'StoryScore (Press-Relevanz)',
    formula:
      '0.20·Verständlichkeit + 0.25·Gesellschaftl. Relevanz + 0.20·Neuheit + 0.20·Erzählpotenzial + 0.15·Aktualität',
    body: (
      <>
        <Para>
          Gewichtete Summe aus 5 Dimensionen, jede 0–1. Ein Sprachmodell (z.B. Claude Opus 4.7)
          liest den verfügbaren Inhalt einer Publikation (Pressezusammenfassung der Institute,
          angereichertes Abstract, Originalabstract, Citation) und schätzt jede Dimension.
        </Para>
        <Para>
          Die Gewichtung wurde von der Pressestelle festgelegt: Gesellschaftliche Relevanz wiegt
          am stärksten, Aktualität am schwächsten. Konfiguration in <Code>lib/constants.ts</Code>.
        </Para>
      </>
    ),
    note: (
      <Para>
        Score-Wertebereich 0–1 wird in der UI als 0–100 % dargestellt. Die institutsinterne
        <Code>popular_science</Code>- und <Code>mahighlight</Code>-Markierung fließen
        nicht ein; die Bewertung ist inhaltsgetrieben.
      </Para>
    ),
  },

  // ─── Score-Dimensionen ────────────────────────────────────────────────────
  dim_public_accessibility: {
    title: 'Verständlichkeit · Gewicht 20 %',
    body: (
      <Para>
        Wie zugänglich ist die Forschung für Nicht-Fachleute? Berücksichtigt Fachjargon-Dichte,
        Konzept-Komplexität und ob Erkenntnisse in einem Satz erklärbar sind.
      </Para>
    ),
  },
  dim_societal_relevance: {
    title: 'Gesellschaftliche Relevanz · Gewicht 25 %',
    body: (
      <Para>
        Wie direkt betrifft die Forschung Gesundheit, Umwelt, Wirtschaft, Kultur oder Alltag?
        Höchstes Gewicht im StoryScore — das wichtigste Kriterium für Pressetauglichkeit.
      </Para>
    ),
  },
  dim_novelty_factor: {
    title: 'Neuheit · Gewicht 20 %',
    body: (
      <Para>
        Durchbruch? Stellt es bestehende Annahmen in Frage, ist es ein Paradigmenwechsel
        oder liefert es unerwartete Resultate?
      </Para>
    ),
  },
  dim_storytelling_potential: {
    title: 'Erzählpotenzial · Gewicht 20 %',
    body: (
      <Para>
        Können Journalist:innen daraus eine fesselnde Erzählung bauen? Gibt es
        Human-Interest-Aspekte, visuelle Elemente, lebensnahe Szenarien?
      </Para>
    ),
  },
  dim_media_timeliness: {
    title: 'Aktualität · Gewicht 15 %',
    body: (
      <Para>
        Anschlussfähig an aktuellen öffentlichen Diskurs, jüngste Ereignisse, Trends,
        saisonale Themen? Niedrigstes Gewicht im StoryScore.
      </Para>
    ),
  },

  // ─── Score-Bands ──────────────────────────────────────────────────────────
  score_band: {
    title: 'Score-Bänder',
    body: (
      <>
        <Para>Drei Schwellen, die die UI durchgängig nutzt:</Para>
        <ul className="ml-3 mt-1 space-y-0.5 list-disc">
          <li><strong>Hoch (blau)</strong>: ≥ 70 % — solider Pitch-Kandidat</li>
          <li><strong>Mittel (amber)</strong>: 40–69 % — fallweise prüfen</li>
          <li><strong>Niedrig (grau)</strong>: &lt; 40 % — Spezialpaper, kaum pressetauglich</li>
        </ul>
      </>
    ),
    note: (
      <Para>
        Schwellen sind hardcodiert in den DB-Functions. Die 0,70-Linie definiert auch
        die <Code>count_high</Code>-Metrik im Forscher:innen-Ranking.
      </Para>
    ),
  },

  // ─── Forscher:innen-Metriken ──────────────────────────────────────────────
  count_high: {
    title: 'Hochbewertete Pubs (≥ 70 %)',
    formula: 'count(WHERE press_score ≥ 0.7) im Zeitfenster',
    body: (
      <Para>
        Wieviele Publikationen einer Person im gewählten Zeitraum einen StoryScore ≥ 0,70
        erreichen. Default-Sortierung der Rangliste — robusteste Reliability-Metrik
        für „echte Pitch-Kandidat:innen".
      </Para>
    ),
  },
  sum_score: {
    title: 'Σ Press-Score',
    formula: 'sum(press_score) im Zeitfenster',
    body: (
      <Para>
        Summe aller StoryScores einer Person. Belohnt Volumen — auch viele
        mittelmäßige Pubs ergeben eine hohe Summe.
      </Para>
    ),
    note: (
      <Para>
        Spitzenreiter dieser Metrik sind oft Konsortialteilnehmer:innen mit 50+ Pubs
        bei avg ≈ 0,25. Für „wer ist press-tauglich" eher unbrauchbar; für „wer schreibt
        viel im Themenfeld" sinnvoll.
      </Para>
    ),
  },
  avg_score: {
    title: 'Ø Press-Score (roh)',
    formula: 'avg(press_score) im Zeitfenster',
    body: (
      <Para>
        Roher arithmetischer Mittelwert über alle Pubs einer Person. Mathematisch
        korrekt, aber ohne Berücksichtigung der Datenmenge.
      </Para>
    ),
    note: (
      <Para>
        <strong>1-Pub-Wonder dominieren</strong>: Eine Person mit einer einzelnen 0,72-Pub
        rangiert über jemandem mit 5 Pubs Schnitt 0,55. Wenn Reliability gefragt ist:
        lieber „Ø Score (verlässlich)" wählen.
      </Para>
    ),
  },
  weighted_avg: {
    title: 'Ø Press-Score (verlässlich, gewichtet)',
    formula: 'weighted = (n · avg + 3 · prior) / (n + 3)',
    body: (
      <>
        <Para>
          Bayessche Glättung nach IMDb-Top-250-Formel. Zieht den rohen Schnitt zur Mitte
          (zum globalen Prior im aktuellen Filterscope), je weniger Pubs eine Person hat.
        </Para>
        <Para>
          Mit <Code>n</Code> = Anzahl Pubs, <Code>prior</Code> = Mittelwert über alle
          aktuell sichtbaren Pubs, Konstante <Code>k = 3</Code> (eine Person braucht ~3 Pubs,
          damit ihr eigener Schnitt gleichberechtigt mit dem Prior gewichtet wird).
        </Para>
      </>
    ),
    example: (
      <div className="space-y-1">
        <p className="font-medium">Beispiel mit Prior ≈ 0,25:</p>
        <ul className="ml-3 space-y-0.5 list-disc">
          <li>1 Pub bei 0,72 → weighted ≈ 0,37</li>
          <li>3 Pubs Schnitt 0,65 → weighted ≈ 0,45</li>
          <li>10 Pubs Schnitt 0,55 → weighted ≈ 0,48</li>
        </ul>
      </div>
    ),
    note: (
      <Para>
        Self-kalibrierend: Wenn Filter (z.B. ITA/Outreach inkludieren) den globalen Prior
        verschieben, passt sich die Glättung an.
      </Para>
    ),
  },
  pubs_total: {
    title: 'Pubs gesamt',
    formula: 'count(*) im Zeitfenster',
    body: (
      <Para>
        Alle bewerteten Publikationen einer Person im Zeitraum, unabhängig vom StoryScore.
        Reine Volumen-Metrik.
      </Para>
    ),
  },

  // ─── Trend / Δ ────────────────────────────────────────────────────────────
  delta_count_high: {
    title: 'Trend ggü. Vorperiode',
    formula: 'count_high(jetzt) − count_high(vorherige gleichlange Periode)',
    body: (
      <>
        <Para>
          Vergleich der hochbewerteten Pubs mit der direkt davor liegenden Periode
          gleicher Länge. Bei Zeitraum „12 Monate" wird die Periode 24–12 Monate vor
          heute gegen die letzten 12 Monate verglichen.
        </Para>
        <Para>
          <strong>NEU</strong>: Person hatte in der Vorperiode keine bewerteten Pubs,
          ist also frisch im Ranking aufgetaucht.
        </Para>
      </>
    ),
  },
  rank: {
    title: 'Rang',
    formula: 'RANK() OVER (ORDER BY metric DESC, sum_score DESC, person_id)',
    body: (
      <>
        <Para>
          PostgreSQL <Code>RANK()</Code> über die gewählte Metrik. Bei Gleichstand
          wird auf <Code>sum_score</Code> als Tiebreaker zurückgefallen, dann auf
          die UUID (deterministisch).
        </Para>
        <Para>
          Bei Ties zeigen mehrere Personen denselben Rang (z.B. zwei Personen auf #2,
          dann nächste Person auf #4). Top 50 werden hart gecappt — keine vollständige
          Rangliste.
        </Para>
      </>
    ),
  },
  rank_medals: {
    title: 'Top-3-Akzente',
    body: (
      <Para>
        Krone (Gold), Award (Silber), Medaille (Bronze): rein dekorativ für Plätze 1–3.
        Subtile linke Akzent-Border in derselben Farbe. Keine Punkte, kein Spiel.
      </Para>
    ),
  },
  sparkline: {
    title: 'Verlauf (12 Monate)',
    body: (
      <Para>
        Polylinie über monatliche Buckets. Y-Wert pro Bucket = Anzahl hochbewerteter Pubs
        (≥ 70 %) in diesem Monat. Skala ist personen-relativ (auf eigenes Maximum normiert),
        nicht global vergleichbar — sie zeigt Trend, nicht Absolutwert.
      </Para>
    ),
  },

  // ─── Personen-Attribute ───────────────────────────────────────────────────
  member_oeaw: {
    title: 'ÖAW-Mitgliedschaft',
    body: (
      <Para>
        Person hat ein Eintrag in <Code>persons.member_type_id</Code> mit Bezug auf
        <Code>member_types</Code> — also in einer Akademie-Klasse aufgenommen
        (Wirklich, Korrespondierend In-/Ausland, Junge Akademie, Ehrenmitglied
        etc.). Stammdaten aus der WebDB.
      </Para>
    ),
    note: (
      <Para>
        Nicht zu verwechseln mit <Code>person_publications.mahighlight</Code> —
        das ist eine selbst gesetzte Pub-Markierung, die <em>nicht</em> Mitgliedschaft
        bedeutet (90 % der mahighlights stammen von Nicht-Mitgliedern).
      </Para>
    ),
  },
  external_person: {
    title: 'Externe Person',
    body: (
      <Para>
        Im WebDB als externe Co-Autor:in geführt — nicht ÖAW-Personal, sondern
        Gast-/Kooperationsautor:in. Per Default in der Rangliste ausgeblendet.
      </Para>
    ),
  },
  oestat3: {
    title: 'ÖSTAT-3-Sektion',
    body: (
      <Para>
        Statistik-Austria-Klassifikation der Wissenschaftsdisziplin auf 3-stelliger Ebene
        (Naturwissenschaften, Geisteswissenschaften etc.). Wird pro Person geführt — nicht
        pro Publikation. Vergleiche zwischen Sektionen sind heikel: Citation- und
        Press-Patterns unterscheiden sich um Größenordnungen.
      </Para>
    ),
  },

  // ─── Filter-Wirkungen ─────────────────────────────────────────────────────
  filter_ita: {
    title: 'ITA-Filter',
    body: (
      <>
        <Para>
          Schließt alle Publikationen aus, die einer Orgunit im ITA-Subtree zugeordnet
          sind (Akronym <Code>ITA</Code> samt allen rekursiven Unter-Units wie
          <Code>ITA_Allgemein</Code>, <Code>ITA_AG_Nentwich</Code>).
        </Para>
        <Para>
          Default aktiv, weil ITA-Dossiers eigene Pop-Sci-Outreach-Formate sind — sie
          erzielen hohe AI-Scores wegen ihrer zugänglichen Sprache, sind aber bereits
          publizierte Outreach-Inhalte, keine Press-Targets.
        </Para>
      </>
    ),
  },
  filter_outreach: {
    title: 'Outreach-Filter',
    body: (
      <>
        <Para>
          Schließt Publikationen mit dem Typ <Code>aufwändige Multimedia-Publikation</Code>
          aus — das umfasst u.a. die Pragmaticus- und ÖAW-Hiccup-Podcast-Reihen.
        </Para>
        <Para>
          Default aktiv. Begründung wie ITA: bereits publizierte Eigenmedien, keine
          Pitch-Kandidaten. Die KI bewertet diese Formate strukturell hoch
          (Verständlichkeit + Erzählpotenzial), ohne dass das die Pressestelle interessiert.
        </Para>
      </>
    ),
  },
  filter_authorship: {
    title: 'Autorschaft-Scope',
    body: (
      <>
        <Para>
          <strong>Alle Beteiligten</strong>: jede Person, die in <Code>person_publications</Code>
          mit einer Pub verbunden ist, zählt.
        </Para>
        <Para>
          <strong>Nur Hauptautor:innen</strong>: nur <Code>HauptautorIn</Code> oder
          <Code>AlleinautorIn</Code>.
        </Para>
      </>
    ),
    note: (
      <Para>
        <strong>Datenwarnung</strong>: das WebDB füllt die Authorship-Spalte nur für
        ~1,4 % der Junction-Rows. „Nur Hauptautor:innen" filtert daher in der Praxis
        fast alles weg. „Alle Beteiligten" ist die belastbare Default-Wahl.
      </Para>
    ),
  },

  // ─── Pub-Detail-Spezifika ─────────────────────────────────────────────────
  ai_provenance: {
    title: 'AI-Provenance',
    body: (
      <>
        <Para>
          Die Bewertung wurde von einem Sprachmodell (über OpenRouter oder lokal in
          Claude-Code-Sessions) erstellt. Modell-ID und ungefähre Kosten werden mit
          jeder Pub gespeichert.
        </Para>
        <Para>
          <Code>anthropic/claude-opus-4.7-session</Code> bedeutet: Bewertung erfolgte
          interaktiv in einer Claude-Code-Session, ohne API-Kosten. OpenRouter-Modelle
          haben echte Token-Kosten in USD.
        </Para>
      </>
    ),
  },
  haiku_block: {
    title: 'Haiku',
    body: (
      <Para>
        Drei Zeilen mit 5-7-5 Silben, vom Sprachmodell erzeugt. Verdichtet den
        Kerngedanken zu einem Bild und dient der Pressestelle als merkbarer
        Lesezeichen-Text. Regeln: keine Eigennamen, keine Fachbegriffe, echte
        deutsche Umlaute.
      </Para>
    ),
  },
  mahighlight_self: {
    title: 'Eigen-Highlight',
    body: (
      <>
        <Para>
          Die Person hat diese Publikation im WebDB selbst als persönliches Highlight
          markiert (<Code>person_publications.mahighlight = true</Code>).
        </Para>
        <Para>
          Trotz <Code>ma</Code>-Präfix (Typo3-Legacy: „Mitglied der Akademie") <strong>kein
          Akademie-Endorsement</strong> — empirisch stammen 90 % der gesetzten Marker
          von Nicht-Mitgliedern. Eine Pub kann von mehreren Personen markiert werden.
        </Para>
      </>
    ),
  },
  highlight_unit: {
    title: 'Orgunit-Highlight',
    body: (
      <Para>
        Die Pub wurde auf Orgunit-Ebene als Highlight markiert (vermutlich durch
        Institutsleitung). Strikte Teilmenge der Eigen-Highlights ist ungefähr deckungsgleich,
        aber das Orgunit-Flag wird seltener gepflegt.
      </Para>
    ),
  },

  // ─── Coauthor & Activity ─────────────────────────────────────────────────
  coauthor_shared: {
    title: 'Gemeinsame Publikationen',
    body: (
      <Para>
        Anzahl Pubs im aktuellen Zeitfenster, an denen sowohl die fokussierte Person
        als auch diese Co-Autor:in als Beteiligte (<Code>person_publications</Code>)
        eingetragen sind.
      </Para>
    ),
  },
  activity_chart: {
    title: 'Aktivitäts-Histogramm',
    body: (
      <Para>
        Monatliche Buckets der bewerteten Pubs, gestapelt nach Score-Band (hoch/mittel/niedrig).
        Y-Achse zeigt Anzahl Pubs pro Monat. Spiegelt Veröffentlichungs-Rhythmus + Quality-Mix.
      </Para>
    ),
  },

  // ─── Beeswarm ─────────────────────────────────────────────────────────────
  beeswarm: {
    title: 'Verteilungs-Beeswarm',
    body: (
      <>
        <Para>
          Jeder Punkt = eine Forscher:in. X-Position: ihre Metrik (gewählter Sortiermodus).
          Y-Position: nur Kollisions-Versatz, ohne semantische Bedeutung.
        </Para>
        <Para>
          Größe ∝ √(pubs_total), Farbe = ÖSTAT-3-Sektion (deterministisch gehasht).
          Punkte mit blauem Rand sind ÖAW-Mitglieder.
        </Para>
        <Para>
          Layout via D3 force-simulation (forceX zur Metrik, forceCollide zur Trennung,
          140 Iterationen vorab → statisches SVG). Hover dimmt alle anderen.
        </Para>
      </>
    ),
  },

  // ─── Dashboard ────────────────────────────────────────────────────────────
  stat_total_pubs: {
    title: 'Publikationen gesamt',
    body: (
      <Para>
        Anzahl Datensätze in der lokalen <Code>publications</Code>-Tabelle, synchronisiert
        aus der Typo3-WebDB. Beinhaltet alle Publikationsformate (Fachartikel,
        Buchkapitel, Multimedia, Sonstige) ohne Filter.
      </Para>
    ),
  },
  stat_popular_science: {
    title: 'Popular Science (WebDB-Flag)',
    body: (
      <>
        <Para>
          Anzahl Pubs mit <Code>popular_science = true</Code> aus der WebDB. Markierung
          erfolgt durch das publizierende Institut, ist aber nicht streng kuratiert —
          deshalb fließt das Flag <strong>nicht</strong> in den StoryScore ein.
        </Para>
        <Para>Reines Datenherkunfts-Signal, kein Qualitätsmerkmal.</Para>
      </>
    ),
  },
  stat_analyzed: {
    title: 'Analysierte Publikationen',
    body: (
      <Para>
        Pubs mit <Code>analysis_status = 'analyzed'</Code> — d.h. ein Sprachmodell hat
        StoryScore + 5 Dimensionen + Pitch + Begründung + Haiku berechnet. Die übrigen
        sind <Code>pending</Code> und können über die Analyse-Seite nachbewertet werden.
      </Para>
    ),
  },
  stat_high_score: {
    title: 'Hohes Story-Potenzial',
    formula: 'count(WHERE press_score ≥ 0.7)',
    body: (
      <Para>
        Pubs mit StoryScore ≥ 70 % über alle Zeiträume. Der Subline „Durchschnitt"
        zeigt den Mittelwert über <em>alle</em> analysierten Pubs (nicht nur die hohen).
      </Para>
    ),
  },
  top10_panel: {
    title: 'Top-10-Panel',
    body: (
      <>
        <Para>
          Die zehn Pubs mit höchstem StoryScore im gewählten Zeitraum (basierend auf
          <Code>published_at</Code>). Sortierung absteigend nach <Code>press_score</Code>.
        </Para>
        <Para>
          <strong>ITA-Bias-Korrektur</strong>: Pubs aus dem ITA-Subtree werden im
          Dashboard-Panel ausgeblendet, damit eine einzelne Abteilung nicht die Top-10
          dominiert. Auf der Forscher:innen-Seite gibt es einen separaten Filter dafür.
        </Para>
      </>
    ),
  },
  score_distribution_chart: {
    title: 'StoryScore-Verteilung',
    body: (
      <Para>
        Histogramm der Press-Scores aller analysierten Pubs in Buckets von 10 %.
        Zeigt die Form der Score-Verteilung — bei einem gesunden Datensatz erwartet
        man einen Peak im 20–40 %-Bereich (typisches Fachpaper) und einen langen
        Tail nach rechts (echte Pitch-Kandidaten).
      </Para>
    ),
  },
  dimensions_profile: {
    title: 'Dimensions-Profil',
    body: (
      <Para>
        Radar-Chart über die fünf StoryScore-Dimensionen mit den Mittelwerten aller
        analysierten Pubs. Zeigt, welche Achsen die ÖAW-Forschung im Schnitt stark/schwach
        besetzt — z.B. „durchschnittlich hohe gesellschaftliche Relevanz, schwache
        Verständlichkeit".
      </Para>
    ),
  },
  top_keywords: {
    title: 'Top Keywords',
    body: (
      <Para>
        Häufigste Schlagwörter aus <Code>enriched_keywords</Code> (angereichert via
        OpenAlex, Semantic Scholar etc.). Größe ∝ Häufigkeit. Nur aus
        OpenAccess-/enrichten Pubs — Closed-Access ohne API-Daten fehlt hier.
      </Para>
    ),
  },

  // ─── Enrichment-Status-Badges ────────────────────────────────────────────
  status_pending: {
    title: 'Anreicherung steht aus',
    body: (
      <>
        <Para>
          Externe Datenquellen (CrossRef, OpenAlex, Unpaywall, SemanticScholar) wurden für
          diese Publikation noch nicht abgefragt. WebDB liefert oft nur Titel und Autor:innen;
          Abstract und Keywords kommen erst durch die Anreicherung dazu.
        </Para>
        <Para>
          Solange das nicht geschehen ist, kann die Pub auch nicht inhaltlich bewertet werden —
          eine Bewertung ohne Substanz wäre Fabrikation.
        </Para>
      </>
    ),
  },
  status_enriched: {
    title: 'Anreicherung erfolgreich',
    body: (
      <Para>
        Mindestens eine externe Quelle hat zusätzliche Metadaten geliefert — typischerweise
        Abstract, Keywords oder Volltext-Snippet. Die Pub ist damit bereit für die inhaltliche
        Bewertung durch ein Sprachmodell.
      </Para>
    ),
  },
  status_partial: {
    title: 'Anreicherung teilweise erfolgreich',
    body: (
      <Para>
        Manche externen Quellen lieferten Daten, andere nicht. Häufig fehlt der Abstract,
        was die spätere Bewertung erschwert oder sie nur auf Basis von Keywords + Citation
        möglich macht. Über <Code>enrich-augment</Code> lassen sich weitere Quellen nachladen.
      </Para>
    ),
  },
  status_analyzed: {
    title: 'Inhaltlich bewertet',
    body: (
      <Para>
        Ein Sprachmodell hat den verfügbaren Inhalt gelesen und Press-Score, Dimensionen,
        Pitch, Angle und Reasoning erzeugt. Die Pub ist damit für die Pressestellen-Triage
        verfügbar.
      </Para>
    ),
  },
  status_failed: {
    title: 'Anreicherung fehlgeschlagen',
    body: (
      <Para>
        Alle externen Quellen wurden abgefragt, keine lieferte verwertbare Daten. Häufige
        Ursachen: Pub hat keinen DOI, DOI ist in keiner Datenbank registriert, oder der
        Abstract liegt nur in einem Format vor, das die APIs nicht ausliefern.
      </Para>
    ),
  },

  // ─── Score N/A ───────────────────────────────────────────────────────────
  score_na: {
    title: 'Kein Press-Score',
    body: (
      <>
        <Para>
          Diese Publikation wurde noch nicht inhaltlich bewertet — daher kein StoryScore.
          Die häufigsten Ursachen:
        </Para>
        <Para>
          1. Anreicherung steht noch aus oder ist fehlgeschlagen — ohne Abstract liegt zu
          wenig Substanz für eine seriöse Bewertung vor.<br />
          2. Anreicherung ist durch, aber die Scoring-Session ist noch nicht gelaufen — das
          Sprachmodell muss explizit getriggert werden.
        </Para>
      </>
    ),
  },

  // ─── Publications table ──────────────────────────────────────────────────
  pub_score_column: {
    title: 'StoryScore-Spalte',
    body: (
      <>
        <Para>
          Ø Pub-Press-Score als prozentuale Anzeige. Klick auf die Zeile öffnet die
          Detail-Ansicht mit voller Dimensions-Aufschlüsselung und Pitch.
        </Para>
        <Para>
          Sortierbar via Spaltenkopf. Bei <Code>N/A</Code> wurde die Pub noch nicht
          bewertet (<Code>analysis_status = pending</Code>).
        </Para>
      </>
    ),
  },
  pub_filter_eligibility: {
    title: 'Press-Eligibility-Filter',
    body: (
      <Para>
        Default-Filter blendet Publikationsformate aus, die für Pressestellen nahezu nie
        relevant sind: Diplomarbeiten, Dissertationen, Habilitationsschriften,
        Konferenzbeiträge, Reports, Working Papers, Editionen. Über „Alles anzeigen"
        deaktivierbar.
      </Para>
    ),
  },

  // ─── Time window ──────────────────────────────────────────────────────────
  since_window: {
    title: 'Zeitfenster',
    body: (
      <Para>
        Filtert auf Publikationen mit <Code>published_at ≥ heute − N Monate</Code>.
        Default 12 Monate. „Alle" greift zurück auf alle bewerteten Pubs (effektiv
        unbegrenzt — 600 Monate Cap).
      </Para>
    ),
    note: (
      <Para>
        Trend-Δ und Vorperiode skalieren mit dem Fenster: bei „6 Monate" wird gegen die
        Periode 12–6 Monate vor heute verglichen.
      </Para>
    ),
  },
};
