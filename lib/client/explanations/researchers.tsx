// Forscher:innen-Domäne des EXPL-Objekts — Ranglisten-Metriken, Trend/Rang/
// Sparkline, Personen-Attribute, Ranglisten-Filter, Co-Autor:innen/Aktivität,
// Beeswarm und das Zeitfenster. Zusammengeführt in ./index.tsx.

import { Para, Code, type Explanation } from './primitives';

export const RESEARCHERS_EXPL = {
  // ─── Forscher:innen-Metriken ──────────────────────────────────────────────
  count_high: {
    title: 'Hochbewertete Pubs (≥ 70 %)',
    formula: 'count(WHERE press_score ≥ 0.7) im Zeitfenster',
    body: (
      <Para>
        Wieviele Publikationen einer Person im gewählten Zeitraum einen Story Score ≥ 0,70
        erreichen. Default-Sortierung der Rangliste: robusteste Reliability-Metrik
        für „echte Pitch-Kandidat:innen".
      </Para>
    ),
  },
  sum_score: {
    title: 'Σ Press-Score',
    formula: 'sum(press_score) im Zeitfenster',
    body: (
      <Para>
        Summe aller Story Scores einer Person. Belohnt Volumen: auch viele
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
        Alle bewerteten Publikationen einer Person im Zeitraum, unabhängig vom Story Score.
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
          dann nächste Person auf #4). Top 50 werden hart gecappt, es gibt keine
          vollständige Rangliste.
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
        nicht global vergleichbar. Sie zeigt Trend, nicht Absolutwert.
      </Para>
    ),
  },

  // ─── Personen-Attribute ───────────────────────────────────────────────────
  member_oeaw: {
    title: 'ÖAW-Mitgliedschaft',
    body: (
      <Para>
        Person hat ein Eintrag in <Code>persons.member_type_id</Code> mit Bezug auf
        <Code>member_types</Code>, also in einer Akademie-Klasse aufgenommen
        (Wirklich, Korrespondierend In-/Ausland, Junge Akademie, Ehrenmitglied
        etc.). Stammdaten aus der WebDB.
      </Para>
    ),
    note: (
      <Para>
        Nicht zu verwechseln mit <Code>person_publications.mahighlight</Code>:
        das ist eine selbst gesetzte Pub-Markierung, die <em>nicht</em> Mitgliedschaft
        bedeutet (90 % der mahighlights stammen von Nicht-Mitgliedern).
      </Para>
    ),
  },
  external_person: {
    title: 'Externe Person',
    body: (
      <Para>
        Im WebDB als externe Co-Autor:in geführt, nicht ÖAW-Personal, sondern
        Gast-/Kooperationsautor:in. Per Default in der Rangliste ausgeblendet.
      </Para>
    ),
  },
  oestat3: {
    title: 'ÖSTAT-3-Sektion',
    body: (
      <Para>
        Statistik-Austria-Klassifikation der Wissenschaftsdisziplin auf 3-stelliger Ebene
        (Naturwissenschaften, Geisteswissenschaften etc.). Wird pro Person geführt, nicht
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
          Default aktiv, weil ITA-Dossiers eigene Pop-Sci-Outreach-Formate sind. Sie
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
          aus. Das umfasst u.a. die Pragmaticus- und ÖAW-Hiccup-Podcast-Reihen.
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

  // ─── Time window ──────────────────────────────────────────────────────────
  since_window: {
    title: 'Zeitfenster',
    body: (
      <Para>
        Filtert auf Publikationen mit <Code>published_at ≥ heute − N Monate</Code>.
        Default 12 Monate. „Alle" greift zurück auf alle bewerteten Pubs (effektiv
        unbegrenzt: 600 Monate Cap).
      </Para>
    ),
    note: (
      <Para>
        Trend-Δ und Vorperiode skalieren mit dem Fenster: bei „6 Monate" wird gegen die
        Periode 12–6 Monate vor heute verglichen.
      </Para>
    ),
  },

} satisfies Record<string, Explanation>;
