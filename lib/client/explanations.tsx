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
  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground/90">{children}</code>
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

  // ─── Triage-Sitzung Stat-Cards ────────────────────────────────────────────
  triage_flagged: {
    title: 'Geflaggt',
    body: (
      <>
        <Para>
          Publikationen, die ein Team-Mitglied per Pin-Icon zur Diskussion in der
          Triage-Sitzung markiert hat. Flag-Notes sind frei formulierbare Kommentare —
          sichtbar im Tooltip des Pin-Icons.
        </Para>
        <Para>
          Anders als „Highlights" (vom Institut) und „Frisch" (Score-Threshold) ist
          das ein <em>manuelles</em> Signal aus dem Press-Team selber.
        </Para>
      </>
    ),
  },
  triage_fresh: {
    title: 'Frisch · Score ≥ 70 %',
    formula: 'analyzed_at ≥ letzte_sitzung AND press_score ≥ 0.7',
    body: (
      <Para>
        Publikationen, die seit der letzten abgeschlossenen Sitzung neu analysiert
        wurden und einen StoryScore von mindestens 70 % erreicht haben. Stellt sicher,
        dass hochbewertete Frisch-Eingänge nicht in der Allgemein-Liste untergehen,
        sondern direkt in der nächsten Triage landen.
      </Para>
    ),
    note: (
      <Para>
        Wenn keine Sitzung seit 7 Tagen abgeschlossen wurde, fällt das Fenster auf
        die letzten 7 Tage zurück (Fallback in <Code>fetchSinceTimestamp</Code>).
      </Para>
    ),
  },
  triage_mahl: {
    title: 'ÖAW-Highlights',
    body: (
      <>
        <Para>
          Publikationen, bei denen die Institute-Selbstdarstellung in der WebDB ein
          <Code>mahighlight=true</Code>-Flag gesetzt hat — das Institut sieht das
          Paper als bemerkenswert für die ÖAW-Außenwirkung.
        </Para>
        <Para>
          <strong>Achtung</strong>: <Code>mahighlight</Code> heißt <em>Eigen-Highlight</em>,
          nicht „Akademie-Mitglied". 90 % der Highlights kommen tatsächlich von Pubs
          ohne Akademie-Mitglied im Author-Pool — die Institute markieren also auch
          ohne Mitgliedsbezug.
        </Para>
      </>
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

  filter_deceased: {
    title: 'Verstorbene einbeziehen',
    body: (
      <Para>
        Schaltet verstorbene Forschende in der Rangliste an oder aus. Standardmäßig
        ausgeblendet, weil sie keine neuen Pubs mehr produzieren und das Pitch-Geschehen
        verzerren würden. Wer historische Aggregate auswertet, schaltet sie wieder ein.
      </Para>
    ),
  },

  filter_press_released: {
    title: 'Filter: ÖAW-Pressemitteilung',
    body: (
      <>
        <Para>
          Cross-Reference zu den news-Beiträgen der ÖAW-Hauptseite (Kategorie
          „ÖAW-Pressemeldungen"). Quelle: TYPO3-Dump, DOI-Match aus dem
          <Code>event_information</Code>-Feld.
        </Para>
        <Para>
          <strong>Ja:</strong> nur Publikationen, die schon eine ÖAW-
          Pressemitteilung haben. Praktisch zum Vermeiden von Doppel-Pitches.
        </Para>
        <Para>
          <strong>Nein:</strong> nur Publikationen ohne bisherige
          ÖAW-Pressemitteilung — der eigentliche Triage-Pool.
        </Para>
      </>
    ),
  },

  // ─── Score N/A — Variants nach state ─────────────────────────────────────
  score_na: {
    title: 'Kein Press-Score',
    body: (
      <Para>
        Diese Publikation wurde noch nicht inhaltlich bewertet — daher kein StoryScore.
      </Para>
    ),
  },
  score_na_pending_pending: {
    title: 'Kein Score — keine Anreicherung versucht',
    body: (
      <>
        <Para>
          Diese Publikation hat noch keine externen Daten: kein DOI-Lookup gegen CrossRef,
          OpenAlex, Unpaywall oder SemanticScholar wurde gefahren. WebDB liefert oft nur
          Titel und Autor:innen.
        </Para>
        <Para>
          Nächster Schritt: <Code>enrich-api</Code> in der Pipeline laufen lassen, um
          Abstract und Keywords zu holen. Erst danach ist eine seriöse inhaltliche Bewertung
          möglich.
        </Para>
      </>
    ),
  },
  score_na_pending_partial: {
    title: 'Kein Score — Anreicherung teilweise',
    body: (
      <>
        <Para>
          Externe Quellen lieferten zwar Metadaten (z.B. Keywords, Journal), aber keinen
          Abstract. Häufiger Fall: Elsevier- oder Springer-DOIs werden bei CrossRef indexiert,
          aber der Abstract steht nur hinter Paywall und kommt nicht über die freien APIs.
        </Para>
        <Para>
          Eine Bewertung allein auf Basis von Titel und Keywords wäre Fabrikation — daher
          kein Score. Optionen: <Code>enrich-augment</Code> für zusätzliche Quellen, oder
          die Pub manuell bewerten lassen.
        </Para>
      </>
    ),
  },
  score_na_pending_enriched: {
    title: 'Kein Score — bewertbar, aber Scoring fehlt',
    body: (
      <Para>
        Die Anreicherung ist durch und ein Abstract liegt vor — die Pub könnte sofort durch
        ein Sprachmodell bewertet werden. Es fehlt nur der Trigger einer Scoring-Session.
        Über die Analyse-Seite oder per Pipeline-Befehl auslösbar.
      </Para>
    ),
  },
  score_na_pending_failed: {
    title: 'Kein Score — Anreicherung fehlgeschlagen',
    body: (
      <Para>
        Alle externen Quellen wurden abgefragt, keine lieferte verwertbare Daten. Häufige
        Ursachen: kein DOI vorhanden, DOI nicht in den freien Datenbanken registriert, oder
        der Abstract liegt in einem Format vor, das die APIs nicht ausliefern. Manuelle
        Anreicherung wäre der nächste Schritt, sofern sich der Aufwand lohnt.
      </Para>
    ),
  },
  score_na_analysis_failed: {
    title: 'Kein Score — Bewertung fehlgeschlagen',
    body: (
      <Para>
        Eine Scoring-Session lief, aber das Sprachmodell konnte keine valide Bewertung
        liefern. Häufige Ursache: Content zu kurz unter dem Min-Length-Threshold, oder das
        Modell hat ungültige Werte zurückgegeben. Re-Run mit anderem Modell oder besserem
        Content.
      </Para>
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

  // ─── Triage-Entscheidungen ───────────────────────────────────────────────
  decision_pitch: {
    title: 'Entscheidung: Pitch',
    body: (
      <Para>
        Erste Wahl in der Triage. Die Publikation geht in den aktiven Pitch-Pool und wird,
        sofern MeisterTask konfiguriert ist, dort automatisch als Karte angelegt.
        Snooze-Zeiten werden beim Setzen auf Pitch zurückgenommen, weil die Pub jetzt
        ein laufender Vorgang ist, nicht ein parkender.
      </Para>
    ),
    note: (
      <Para>
        Die Entscheidung lässt sich jederzeit über „Zurücksetzen" rückgängig machen.
        Eine bereits gepushte MeisterTask-Karte bleibt davon unberührt.
      </Para>
    ),
  },
  decision_hold: {
    title: 'Entscheidung: Hold',
    body: (
      <Para>
        Die Pub wirkt aussichtsreich, aber etwas fehlt noch: ein passender Anlass, ein
        zweiter Blick, eine Rückfrage an die Forscher:in. Hold parkt sie sichtbar im
        System, ohne dass sie aus der Liste verschwindet.
      </Para>
    ),
    note: (
      <Para>
        In Kombination mit den Snooze-Schaltern (1 W, 4 W, Quartal) lässt sich ein
        konkretes Wiedervorlage-Datum setzen. Ohne Snooze bleibt Hold zeitlich offen.
      </Para>
    ),
  },
  decision_skip: {
    title: 'Entscheidung: Skip',
    body: (
      <Para>
        Klares Nein für die laufende Triage. Die Pub verschwindet aus den Default-Listen,
        bleibt aber in der Datenbank für Audits, Reports und spätere Re-Evaluierungen.
        Skip sagt: hier ist gerade nichts zu holen, weiter zum nächsten Kandidaten.
      </Para>
    ),
    note: (
      <Para>
        Skip löscht keine Daten. Wer die Pub später doch noch anschauen will, öffnet sie
        über „Zurücksetzen" wieder oder ruft sie direkt über die Detail-URL auf.
      </Para>
    ),
  },
  decision_snooze: {
    title: 'Snooze',
    body: (
      <>
        <Para>
          Verschiebt die Pub auf ein späteres Datum und setzt sie dabei automatisch auf
          Hold. Vier Wege: eine Woche, vier Wochen, ein Quartal, oder ein konkretes Datum
          aus dem Kalender.
        </Para>
        <Para>
          Praktisch, wenn eine Pub erst zu einem bestimmten Termin pressetauglich wird:
          etwa Embargo-Ende, Konferenzstart oder geplante Folgepublikation.
        </Para>
      </>
    ),
  },
  decision_rationale: {
    title: 'Notiz zur Entscheidung',
    body: (
      <Para>
        Optionaler Freitext, der die Begründung der Entscheidung festhält. Mit dem
        nächsten Decision-Klick wird die Notiz gespeichert und erscheint in
        Audit-Logs, Triage-Sitzungs-Übersichten und im Pub-Detail.
      </Para>
    ),
    note: (
      <Para>
        Klare kurze Begründungen sind viel wert, wenn jemand drei Monate später dieselbe
        Pub nochmal anschaut. „Folge-Paper für Q3 erwartet" oder „warten bis MPI-PR
        erscheint" reicht völlig.
      </Para>
    ),
  },

  // ─── Action-Items ────────────────────────────────────────────────────────
  publication_flag: {
    title: 'Flag für die nächste Sitzung',
    body: (
      <>
        <Para>
          Markiert die Pub mit einer Pin-Nadel, damit sie in der nächsten Triage-Sitzung
          garantiert auf den Tisch kommt. Mehrere Teammitglieder können dieselbe Pub
          flaggen; jede Notiz behält ihren Urheber.
        </Para>
        <Para>
          Anders als Eigen-Highlights (vom Institut) und „Frisch" (Score-Threshold) ist
          Flag ein manuelles Signal aus dem Press-Team selbst.
        </Para>
      </>
    ),
    note: (
      <Para>
        Die Notiz ist optional, aber sehr hilfreich: warum diese Pub, was soll besprochen
        werden? Sichtbar im Tooltip und im aufgeklappten Flag-Panel.
      </Para>
    ),
  },
  meistertask_pitch: {
    title: 'An MeisterTask senden',
    body: (
      <>
        <Para>
          Übergibt die Pub als Aufgabe an die MeisterTask-Pitch-Pipeline. Titel,
          Pitch-Vorschlag, Blickwinkel, Zielgruppe und Begründung wandern als Karte mit
          Beschreibung hinüber, plus Deep-Link zurück in die Pub-Detail-Ansicht.
        </Para>
        <Para>
          Falls die Pub bereits gepusht wurde, zeigt der Button stattdessen einen
          Direktlink zur bestehenden Karte. Doppelte Karten werden serverseitig verhindert.
        </Para>
      </>
    ),
    note: (
      <Para>
        Der Push passiert auch automatisch bei der Entscheidung „Pitch", wenn MeisterTask
        konfiguriert ist. Der manuelle Button bleibt verfügbar, falls Push ohne Decision
        gewünscht ist.
      </Para>
    ),
  },

  // ─── Publikations-Badges ─────────────────────────────────────────────────
  peer_reviewed: {
    title: 'Peer-reviewed',
    body: (
      <Para>
        Die Publikation ist in einem peer-review-pflichtigen Format erschienen
        (Fachjournal, Konferenz mit Review-Verfahren). Für die Pressestelle ein
        Qualitätssignal, weil peer-reviewte Arbeiten eine fachliche Validierung
        durchlaufen haben.
      </Para>
    ),
    note: (
      <Para>
        Das Flag wird in der WebDB von den Instituten gesetzt. Rund 54 % aller Pubs sind
        so markiert.
      </Para>
    ),
  },
  popular_science_badge: {
    title: 'Popular Science',
    body: (
      <Para>
        Die Publikation richtet sich an ein breiteres Publikum: Wissenschaftsjournalismus,
        Sachbuch, populärwissenschaftliche Beiträge in Print oder Web. Markierung erfolgt
        institutsseitig in der WebDB.
      </Para>
    ),
    note: (
      <Para>
        Reines Datenherkunfts-Signal, kein Qualitätsmerkmal. Fließt nicht in den
        StoryScore ein, weil die inhaltliche Press-Eignung weiterhin vom Sprachmodell
        beurteilt wird.
      </Para>
    ),
  },
  open_access: {
    title: 'Open Access',
    body: (
      <Para>
        Volltext frei zugänglich. Der konkrete OA-Status (Gold, Hybrid, Green, Bronze,
        Diamond) zeigt, ob der Verlag direkt frei publiziert oder ob ein Repository den
        Zugang ermöglicht.
      </Para>
    ),
    note: (
      <Para>
        Quelle: Unpaywall-API plus Verlags-Metadaten via CrossRef. „Geschlossen" heißt:
        kein frei zugänglicher Volltext gefunden. Mögliche Gründe sind Paywall oder
        fehlende OA-Indexierung.
      </Para>
    ),
  },
  press_release_badge: {
    title: 'Bereits ÖAW-Pressemitteilung',
    body: (
      <Para>
        Für diese Publikation existiert eine eigene ÖAW-Pressemitteilung auf
        oeaw.ac.at. Verknüpfung erfolgt über DOI-Match aus dem TYPO3-News-Dump
        (Kategorie „ÖAW-Pressemeldungen").
      </Para>
    ),
    note: (
      <Para>
        Praktisch zum Vermeiden von Doppel-Pitches. Im Pub-Detail wird die
        Pressemitteilung mit Titel, Datum, Sprache und Abstract verlinkt.
      </Para>
    ),
  },

  // ─── Pitch-Card Labels ───────────────────────────────────────────────────
  pitch_suggestion: {
    title: 'Pitch-Vorschlag',
    body: (
      <>
        <Para>
          Ein vom Sprachmodell formulierter Aufhänger, der den möglichen Einstieg für
          eine Pressemitteilung skizziert. Zwei bis vier Sätze, die den Story-Kern
          festhalten: Was ist neu, warum ist es relevant, wer hat es gemacht.
        </Para>
        <Para>
          Der Vorschlag ist ein Startpunkt für die Pressestelle, kein fertiger Text.
          Er soll inspirieren und die Pitch-Diskussion beschleunigen.
        </Para>
      </>
    ),
  },
  suggested_angle: {
    title: 'Blickwinkel',
    body: (
      <Para>
        Der vorgeschlagene narrative Rahmen: aus welcher Perspektive wird das Paper für
        ein nicht-fachliches Publikum greifbar? Typische Angles sind menschliche
        Auswirkung, Paradigmenwechsel, oder technische Innovation mit Alltagsbezug.
      </Para>
    ),
    note: (
      <Para>
        Der Blickwinkel ergänzt den Pitch-Vorschlag um die strategische Frage, aus
        welcher Richtung die Story angegangen wird.
      </Para>
    ),
  },
  target_audience: {
    title: 'Zielgruppe',
    body: (
      <Para>
        Welche Medienlandschaft passt zum Thema? Tagespresse, Fachpresse,
        populärwissenschaftliche Magazine, Lokalpresse oder Special-Interest-Outlets.
        Die Zuordnung ist ein Vorschlag, der die Outreach-Strategie unterstützt.
      </Para>
    ),
    note: (
      <Para>
        Die Bewertung erfolgt inhaltsgetrieben aus Abstract und Pitch-Material. Lokale
        Anschlussfähigkeit (Wien, Niederösterreich, ÖAW-Standorte) bleibt eine eigene
        redaktionelle Entscheidung.
      </Para>
    ),
  },
  reasoning: {
    title: 'Begründung',
    body: (
      <Para>
        Die Erklärung des Sprachmodells, warum der StoryScore so ausgefallen ist. Hebt
        die treibenden Stärken hervor und benennt offene Schwächen. Ein durchgehender
        Fließtext, keine Aufzählung von Variablen.
      </Para>
    ),
    note: (
      <Para>
        Die Begründung soll plausibilisieren, nicht ersetzen. Bei abweichender
        redaktioneller Einschätzung gilt das menschliche Urteil. Der Score bleibt
        Entscheidungshilfe, nicht Vorgabe.
      </Para>
    ),
  },

  // ─── Press-Similarity (semantische Nähe zum Press-Cluster) ───────────────
  press_similarity: {
    title: 'Press-Similarity',
    formula: 'mean cosine(SPECTER2, top-5 Press-Cluster), Self-Match ausgenommen',
    body: (
      <>
        <Para>
          Wie nah liegt diese Pub semantisch an dem, was die ÖAW-Pressestelle bisher
          pitchwürdig fand? Berechnet als mittlere Cosinus-Ähnlichkeit zu den fünf
          nächsten Nachbarn im Press-Cluster (gepresste Papers plus externe
          Co-Author-Pubs), Self-Match wird ausgeschlossen.
        </Para>
        <Para>
          Embedding-Modell: SPECTER2 über Titel und Abstract. Hohe Werte deuten auf
          thematische Anschlussfähigkeit an den historischen Press-Korpus.
        </Para>
      </>
    ),
    note: (
      <Para>
        SPECTER2 ist auf englischen Texten trainiert. Für deutschsprachige Pubs ist die
        Similarity nur orientierend, weil deutschsprachige Press-Pubs im Korpus
        selten sind.
      </Para>
    ),
  },

  // ─── Anreicherungs-Quellen ───────────────────────────────────────────────
  source_crossref: {
    title: 'Quelle: CrossRef',
    body: (
      <Para>
        DOI-Registratur und Verlags-Metadaten. Liefert Titel, Abstract (sofern der Verlag
        ihn offen indiziert), Journal, ISSN, Autor:innen-Liste, Datum und Lizenz-Infos.
        Eine der zuverlässigsten Quellen für peer-reviewte Pubs.
      </Para>
    ),
  },
  source_openalex: {
    title: 'Quelle: OpenAlex',
    body: (
      <Para>
        Offene Forschungsdatenbank, Nachfolger von Microsoft Academic. Liefert Abstract,
        Zitationszahlen, Themen-Tags und Open-Access-Status. Besonders stark bei
        Themen-Klassifikation und Konferenz-Beiträgen.
      </Para>
    ),
  },
  source_unpaywall: {
    title: 'Quelle: Unpaywall',
    body: (
      <Para>
        Spezialisiert auf das Auffinden frei zugänglicher PDF-Volltext-Links. Indexiert
        Repository-Versionen, Preprint-Server und Verlags-OA-Optionen.
      </Para>
    ),
  },
  source_semantic_scholar: {
    title: 'Quelle: Semantic Scholar',
    body: (
      <Para>
        KI-gestützte Datenbank vom Allen Institute for AI. Liefert Abstract,
        Zitationsmetriken und einen Influence-Score, der den thematischen Einfluss einer
        Arbeit gewichtet.
      </Para>
    ),
  },
  source_pdf: {
    title: 'Quelle: PDF-Volltext',
    body: (
      <Para>
        Direkter PDF-Download von der Publikations-URL mit anschließender
        Volltext-Extraktion. Wird genutzt, wenn der Abstract über die API-Quellen nicht
        verfügbar ist, das PDF aber frei zugänglich liegt.
      </Para>
    ),
    note: (
      <Para>
        Die Extraktion kann an gescannten oder bildbasierten PDFs scheitern. Aktuell
        wird nur Text mit Layout-erhaltender Heuristik gelesen.
      </Para>
    ),
  },

  // ─── Filter-Presets ──────────────────────────────────────────────────────
  preset_pitch: {
    title: 'Preset: Pitch-fertig',
    body: (
      <Para>
        Die schärfste Vorauswahl: peer-reviewed, mit deutscher Zusammenfassung,
        StoryScore ≥ 70 %, nicht-pressetaugliche Formate ausgeblendet. Die Triage-Sicht
        für die Frage „was kommt diese Woche auf den Tisch".
      </Para>
    ),
    note: (
      <Para>
        Die einzelnen Kriterien lassen sich nach dem Preset-Klick beliebig anpassen.
        Die Pille „Preset modifiziert" zeigt das visuell; mit „zurücksetzen" geht es
        zurück zur Voreinstellung.
      </Para>
    ),
  },
  preset_mahighlights: {
    title: 'Preset: Eigen-Highlights',
    body: (
      <Para>
        Alle Publikationen, die im WebDB von einer Person oder einem Institut selbst als
        Eigen-Highlight markiert wurden. Standardfilter werden gleichzeitig deaktiviert,
        damit die volle Highlight-Liste sichtbar wird.
      </Para>
    ),
    note: (
      <Para>
        Trotz des Präfixes „ma" (Typo3-Legacy) ist das kein Mitgliedschafts-Indikator.
        Empirisch stammen rund 90 % der Eigen-Highlights von Nicht-Mitgliedern.
      </Para>
    ),
  },
  preset_wiss: {
    title: 'Preset: Wissenschaftlich',
    body: (
      <Para>
        Beschränkt auf die akademisch zentralen Publikationstypen wie Fachartikel,
        Monographien und Buchkapitel mit Begutachtung. Filtert populärwissenschaftliche,
        didaktische und Multimedia-Formate aus.
      </Para>
    ),
    note: (
      <Para>
        Sinnvoll für Tiefen-Recherche, Forscher:innen-Profile oder Vergleiche mit
        externer Bibliometrik.
      </Para>
    ),
  },
  preset_popsci: {
    title: 'Preset: Popular Science',
    body: (
      <Para>
        Zeigt nur Publikationen mit dem Popular-Science-Flag aus der WebDB. Diese Pubs
        richten sich ans breite Publikum: Sachbücher, Magazinbeiträge,
        Wissenschaftsblogs, Podcast-Episoden.
      </Para>
    ),
    note: (
      <Para>
        Popular-Science-Pubs sind selten Pitch-Kandidaten (sie sind schon Outreach), aber
        gute Indikatoren für aktive Wissenschaftskommunikator:innen im Haus.
      </Para>
    ),
  },
  preset_peer: {
    title: 'Preset: Peer-reviewed',
    body: (
      <Para>
        Nur Publikationen mit gesetztem Peer-Review-Flag. Klassische Qualitätsfilterung
        für die Wissenschaftspresse.
      </Para>
    ),
    note: (
      <Para>
        Das Peer-Flag stammt aus den WebDB-Selbsteinträgen der Institute. Rund 54 % der
        Pubs sind so markiert.
      </Para>
    ),
  },

  // ─── Filter-Misc ─────────────────────────────────────────────────────────
  search_scope: {
    title: 'Titel-Suche',
    body: (
      <Para>
        Volltext-Suche im Titel-Feld, case-insensitive und teilstring-basiert. Umlaute
        und Sonderzeichen werden korrekt indexiert.
      </Para>
    ),
    note: (
      <Para>
        Tastenkürzel <Code>/</Code> oder <Code>⌘K</Code> springt direkt ins Suchfeld.
        Die Suche bleibt aktiv, wenn ein Preset gewechselt wird; sie zählt als
        Modifikator, nicht als Preset-Territorium.
      </Para>
    ),
  },
  filter_publikationstyp: {
    title: 'Publikationstyp',
    body: (
      <Para>
        Filtert auf einen oder mehrere der 26 Publikationsformate aus der
        WebDB-Taxonomie. Die Press-Eligibility-Voreinstellung blendet Diplomarbeiten,
        Habilitationsschriften, Poster und Working-Paper aus, weil sie für Pressearbeit
        selten relevant sind.
      </Para>
    ),
    note: (
      <Para>
        Mehrfachauswahl ist möglich. Eine virtualisierte Liste hält die Performance auch
        bei vielen aktiven Filtern stabil.
      </Para>
    ),
  },
  filter_institut: {
    title: 'Institut',
    body: (
      <Para>
        Filtert nach Organisationseinheit (Forschungsinstitut, Abteilung,
        Arbeitsgruppe). Der Toggle „nur Forschungseinrichtungen" reduziert auf die
        echten ÖAW-Forschungsinstitute und blendet Bereiche, Mitgliederverwaltungen und
        Sub-Akronyme aus.
      </Para>
    ),
    note: (
      <Para>
        Die Suche akzeptiert sowohl Akronyme (z. B. „IQOQI") als auch ausgeschriebene
        Institutsnamen.
      </Para>
    ),
  },
  filter_oestat6: {
    title: 'Forschungsgebiet (ÖSTAT6)',
    body: (
      <Para>
        Filtert nach der österreichischen Wissenschafts-Klassifikation auf
        sechsstelliger Ebene (1.411 Codes). Codes sind nach Super-Domäne gruppiert:
        1xx Naturwissenschaften, 2xx Technik, 3xx Medizin, 4xx Agrar, 5xx Sozial-,
        6xx Geistes- und Kulturwissenschaften.
      </Para>
    ),
    note: (
      <Para>
        Die Klassifikation wird pro Publikation gepflegt. Cross-Domain-Vergleiche sind
        möglich, aber Citation- und Press-Patterns unterscheiden sich von Domäne zu
        Domäne deutlich.
      </Para>
    ),
  },
  filter_min_score: {
    title: 'Mindest-Score',
    body: (
      <Para>
        Schließt analysierte Publikationen unterhalb der gewählten Schwelle aus.
        Slider von 0 bis 100 in 5er-Schritten. Pubs ohne Score (noch nicht analysierte)
        verschwinden bei Mindest-Score &gt; 0 ebenfalls aus der Liste.
      </Para>
    ),
    note: (
      <Para>
        70 % ist die etablierte Grenze für „solider Pitch-Kandidat". Niedriger schauen
        lohnt sich, wenn ein bestimmtes Thema oder Institut im Fokus liegt.
      </Para>
    ),
  },

  // ─── Press-Releases-Seite ────────────────────────────────────────────────
  pr_stat_total: {
    title: 'Pressemitteilungen gesamt',
    body: (
      <Para>
        Anzahl Datensätze in der lokalen <Code>press_releases</Code>-Tabelle. Quelle ist
        der TYPO3-News-Dump der ÖAW-Hauptseite (Kategorie „ÖAW-Pressemeldungen"). Umfasst
        Pressemitteilungen mit Publikations-Match und externe Verweise.
      </Para>
    ),
  },
  pr_stat_matched: {
    title: 'Mit Publikations-Match',
    body: (
      <Para>
        Pressemitteilungen, deren DOI sich einer Publikation in der WebDB zuordnen ließ.
        Die zugehörige Pub bekommt im Detail das Badge „Bereits ÖAW-Pressemitteilung".
      </Para>
    ),
    note: (
      <Para>
        Match erfolgt automatisch beim WebDB-Import via{' '}
        <Code>promote_press_release_orphans()</Code>. Sobald eine bisher externe Pub als
        Datensatz hinzukommt, wird die Zuordnung nachgezogen.
      </Para>
    ),
  },
  pr_stat_orphans: {
    title: 'Externe Referenzen',
    body: (
      <Para>
        Pressemitteilungen mit DOI-Verweis, deren Paper nicht in der WebDB existiert.
        Häufig sind ÖAW-Personen als Co-Autor:innen beteiligt; die WebDB erfasst aber
        primär Lead-Authorships. Metadaten werden via OpenAlex und CrossRef nachgereichert.
      </Para>
    ),
    note: (
      <Para>
        Sobald das Paper später importiert wird, übernimmt der Match-Job die Zuordnung
        automatisch.
      </Para>
    ),
  },
  pr_stat_year: {
    title: 'Aktuelles Jahr',
    body: (
      <Para>
        Pressemitteilungen, deren Veröffentlichungsdatum im laufenden Kalenderjahr liegt.
        Die Subline zeigt zusätzlich die Anzahl des aktuellen Monats als schneller
        Aktivitäts-Indikator.
      </Para>
    ),
  },
  pr_tab_matched: {
    title: 'Tab: Mit Pub-Match',
    body: (
      <Para>
        Schaltet die Liste auf Pressemitteilungen, die einer Publikation in der WebDB
        zugeordnet sind. Klick auf eine Zeile öffnet die zugehörige Pub-Detail-Ansicht.
      </Para>
    ),
    note: (
      <Para>
        URL-getrieben: der aktive Tab landet im Query-Parameter{' '}
        <Code>?tab=matched</Code>, sodass Bookmarks und Shares die Ansicht erhalten.
      </Para>
    ),
  },
  pr_tab_orphans: {
    title: 'Tab: Ohne Pub-Match',
    body: (
      <Para>
        Zeigt nur externe Referenzen, also Pressemitteilungen mit DOI, deren Paper noch
        nicht in der WebDB liegt. Jede Zeile ist aufklappbar und offenbart Abstract,
        Autor:innen, Journal und mutmaßliche ÖAW-Beteiligung.
      </Para>
    ),
  },
  orphan_press_release: {
    title: 'Externe Pressemitteilung',
    body: (
      <>
        <Para>
          Eine ÖAW-Pressemitteilung, deren zugehöriges Paper noch nicht in der WebDB
          liegt. Häufige Gründe: das Paper hat ÖAW-Beteiligung als Co-Authorship (die
          WebDB erfasst primär Lead-Authorships), oder es ist erst nach dem letzten
          Import erschienen.
        </Para>
        <Para>
          Metadaten kommen aus OpenAlex und CrossRef. Eine Beteiligungs-Heuristik matcht
          Nachname plus Vornamen-Initial gegen die <Code>persons</Code>-Tabelle. Beim
          nächsten Import wird das Paper automatisch verknüpft.
        </Para>
      </>
    ),
    note: (
      <Para>
        Manuelle Verifikation der ÖAW-Beteiligung wird empfohlen, weil Nachnamens-Match
        Homonyme nicht ausschließt.
      </Para>
    ),
  },

  // ─── Settings ────────────────────────────────────────────────────────────
  settings_reviewer_name: {
    title: 'Dein Name',
    body: (
      <Para>
        Erscheint bei Flag-Notizen und Triage-Entscheidungen als Urheber. Wird im
        Browser-Local-Storage gespeichert, ist also pro Gerät und Profil. Leer lassen
        heißt: Einträge werden als „team" geführt.
      </Para>
    ),
    note: (
      <Para>
        Praktisch im Team-Setting, wenn mehrere Personen dieselbe Pub flaggen oder
        unterschiedliche Entscheidungen nachvollziehbar bleiben sollen.
      </Para>
    ),
  },
  settings_openrouter: {
    title: 'OpenRouter API-Schlüssel',
    body: (
      <Para>
        BYOK-Setup (Bring Your Own Key) für die LLM-basierten Analyse-Pipelines. Wird
        verwendet, sobald eine Analyse über OpenRouter läuft (etwa Claude, GPT,
        DeepSeek). Der Schlüssel wird ausschließlich lokal gespeichert und bei jedem
        API-Aufruf direkt von hier übergeben.
      </Para>
    ),
    note: (
      <Para>
        Modell-Wahl erfolgt pro Batch im Analyse-Dialog, kein globales Default.
        Unterschiedliche Pub-Sets profitieren von unterschiedlichen
        Preis-Qualitäts-Profilen.
      </Para>
    ),
  },
  settings_min_words: {
    title: 'Minimale Wortanzahl',
    body: (
      <Para>
        Schwellenwert für die Analyse-Pipeline: nur Publikationen mit mindestens so
        vielen Wörtern angereichertem Inhalt werden vom Sprachmodell bewertet.{' '}
        <Code>0</Code> heißt: alle bewertbaren Pubs durchlassen.
      </Para>
    ),
    note: (
      <Para>
        Der Sinn dahinter: Pubs mit nur 30 Wörtern Abstract liefern selten substantielle
        Scores. Der Default 150 ist eine bewährte Heuristik gegen Fabrikation auf zu
        dünner Datenbasis.
      </Para>
    ),
  },
  settings_batch_size: {
    title: 'Batch-Größe',
    body: (
      <Para>
        Anzahl der Publikationen pro LLM-API-Aufruf (1 bis 5). Kleinere Batches geben
        jedem Paper mehr Kontext-Aufmerksamkeit im Modell, kosten aber mehr API-Calls.
        Größere Batches sind effizienter, riskieren aber Quality-Drift bei langen
        Prompts.
      </Para>
    ),
    note: (
      <Para>
        Default 3 ist der empirisch beste Kompromiss aus Kosten und Score-Stabilität.
        Für besonders nuancierte Pubs lohnt sich Batch 1.
      </Para>
    ),
  },

  // ─── Upload / WebDB-Import ───────────────────────────────────────────────
  upload_pipeline: {
    title: 'WebDB-Import',
    body: (
      <>
        <Para>
          Lädt einen vollständigen Adminer- oder mysqldump-Export der TYPO3-WebDB ins
          lokale Postgres. Erfasst werden Publikationen, Personen,
          Organisationseinheiten, Projekte, Vorträge und alle Verknüpfungstabellen.
        </Para>
        <Para>
          Typo3-Versions- und Mirror-Artefakte werden ignoriert, gelöschte Datensätze
          übersprungen, UTF-8-mb4 erhalten und Unix-Timestamps in Postgres-Datentypen
          konvertiert. Dauer rund eine Minute für 37.000 Publikationen plus Junctions.
        </Para>
      </>
    ),
    note: (
      <Para>
        Der Import wischt aktuell die <Code>publications</Code>-Tabelle und lädt
        vollständig neu. Lokale Analyse-Daten gehen dabei verloren und müssen separat
        aus Production via DOI-Match wiederhergestellt werden.
      </Para>
    ),
  },

  // ─── Pipeline-Actions auf der Pub-Listen-Seite ───────────────────────────
  pipeline_enrichment: {
    title: 'Enrichment-Pipeline',
    body: (
      <>
        <Para>
          Reichert Publikationen mit Daten aus externen Quellen an: CrossRef, OpenAlex,
          Unpaywall, Semantic Scholar, PDF-Volltext. Liefert primär Abstract, Keywords,
          Journal-Metadaten und Open-Access-Status.
        </Para>
        <Para>
          Im Modal lassen sich einzelne Quellen aktivieren oder ausschließen, etwa um
          gezielt nur Pubs ohne Abstract nachzuladen.
        </Para>
      </>
    ),
    note: (
      <Para>
        Ohne Enrichment liefert die WebDB oft nur Titel und Autor:innen. Eine seriöse
        Bewertung durch das Sprachmodell setzt mindestens einen Abstract voraus.
      </Para>
    ),
  },
  pipeline_analysis: {
    title: 'Analyse-Pipeline',
    body: (
      <Para>
        Schickt angereicherte Publikationen an das gewählte Sprachmodell (über
        OpenRouter) und berechnet StoryScore, fünf Dimensionen, Pitch-Vorschlag,
        Blickwinkel, Zielgruppe, Begründung und Haiku. Pro Aufruf werden 1 bis 5 Pubs
        gebündelt (Batch-Größe in den Einstellungen).
      </Para>
    ),
    note: (
      <Para>
        Kosten und Token-Verbrauch werden pro Pub mitgeschrieben. Sessions ohne
        kostenpflichtige API (Claude-Code-direkt) werden separat als{' '}
        <Code>*-session</Code>-Provenance markiert und kosten nichts.
      </Para>
    ),
  },

  // ─── Dashboard ───────────────────────────────────────────────────────────
  dashboard_time_range: {
    title: 'Zeitraum-Tabs',
    body: (
      <Para>
        Filtert die Top-10-Liste, die Score-Verteilung und das Dimensions-Profil auf
        ein Zeitfenster: Woche, Monat, Jahr oder Gesamt. Der gewählte Tab wird in der
        URL gespeichert, Bookmarks und geteilte Links behalten die Ansicht.
      </Para>
    ),
    note: (
      <Para>
        Die Stats-Karten oben (Pubs gesamt, Popular Science, Analysiert, Hohes
        Story-Potenzial) sind nicht von den Tabs betroffen. Sie zeigen immer den
        Gesamtzustand.
      </Para>
    ),
  },
};
