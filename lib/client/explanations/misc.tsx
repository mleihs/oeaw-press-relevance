// Sonstige Domänen des EXPL-Objekts — Dashboard-Statistiken & -Panels,
// Triage-Sitzungs-Stat-Cards, Press-Releases-Seite, Einstellungen und die
// Bewertungs-Kachel. Zusammengeführt in ./index.tsx.

import { Para, Code, type Explanation } from './primitives';
import { SCORING_RECENT_DAYS } from '@/lib/shared/dashboard';

export const MISC_EXPL = {
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
          erfolgt durch das publizierende Institut, ist aber nicht streng kuratiert.
          Deshalb fließt das Flag <strong>nicht</strong> in den Story Score ein.
        </Para>
        <Para>Reines Datenherkunfts-Signal, kein Qualitätsmerkmal.</Para>
      </>
    ),
  },
  stat_analyzed: {
    title: 'Analysierte Publikationen',
    body: (
      <Para>
        Pubs mit <Code>analysis_status = 'analyzed'</Code>, d.h. ein Sprachmodell hat
        Story Score + 5 Dimensionen + Pitch + Begründung + Haiku berechnet. Die übrigen
        sind <Code>pending</Code> und können über die Analyse-Seite nachbewertet werden.
      </Para>
    ),
  },
  stat_high_score: {
    title: 'Hohes Story-Potenzial',
    formula: 'count(WHERE press_score ≥ 0.7)',
    body: (
      <Para>
        Pubs mit Story Score ≥ 70 % über alle Zeiträume. Der Subline „Durchschnitt"
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
          Triage-Sitzung markiert hat. Flag-Notes sind frei formulierbare Kommentare,
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
        wurden und einen Story Score von mindestens 70 % erreicht haben. Stellt sicher,
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
          <Code>mahighlight=true</Code>-Flag gesetzt hat. Das Institut sieht das
          Paper als bemerkenswert für die ÖAW-Außenwirkung.
        </Para>
        <Para>
          <strong>Achtung</strong>: <Code>mahighlight</Code> heißt <em>Eigen-Highlight</em>,
          nicht „Akademie-Mitglied". 90 % der Highlights kommen tatsächlich von Pubs
          ohne Akademie-Mitglied im Author-Pool. Die Institute markieren also auch
          ohne Mitgliedsbezug.
        </Para>
      </>
    ),
  },
  top10_panel: {
    title: 'Top-Publikationen-Panel',
    body: (
      <>
        <Para>
          Die zwanzig Pubs mit höchstem Story Score im gewählten Zeitraum (basierend auf
          <Code>published_at</Code>). Sortierung absteigend nach <Code>press_score</Code>.
          Über den Button „Mehr laden" werden jeweils 20 weitere Pubs aus demselben
          Pool nachgeladen, bis zu einem Maximum von 200.
        </Para>
        <Para>
          <strong>ITA-Bias-Korrektur</strong>: Pubs aus dem ITA-Subtree werden im
          Dashboard-Panel ausgeblendet, damit eine einzelne Abteilung nicht die Liste
          dominiert. Auf der Forscher:innen-Seite gibt es einen separaten Filter dafür.
        </Para>
      </>
    ),
  },
  score_distribution_chart: {
    title: 'Verteilungen: Story Score & Press-Similarity',
    body: (
      <>
        <Para>
          Streudiagramm: jeder Punkt eine analysierte Publikation,
          <strong> Story Score</strong> auf der X-Achse (0 – 100 %),
          <strong> Press-Similarity</strong> auf der Y-Achse (70 – 100 %,
          gezoomt, weil SPECTER2-Cosinus naturgemäß in diesem Band sitzt).
          Die beiden sind <em>unabhängige</em> Signale: Story Score ist das
          LLM-Inhaltsurteil, Press-Similarity die reine Embedding-Nähe zum
          Cluster früher gepresster Papers. Genau deshalb ein gemeinsames
          Diagramm statt zweier getrennter Histogramme: nur so wird sichtbar,
          dass ein Paper niedrig scoren und trotzdem embedding-nah liegen kann.
          Die schraffierte Zone oben-links (niedriger Score, hohe Similarity)
          markiert wahrscheinliche LLM-Unterschätzungen für die manuelle
          Prüfung.
        </Para>
        <Para>
          <strong>Empirische Score-Decke:</strong> Der obere Story Score-Bucket
          (90 – 100 %) ist im Datensatz leer. Der höchste tatsächlich erreichte
          Score liegt bei rund 0,82. Grund: die gewichtete 5-Dim-Formel
          erzwingt für ≥ 90 % praktisch alle Dimensionen gleichzeitig ≥ 0,9,
          eine Kombination, die empirisch nicht vorkommt (typische Pubs haben
          eine starke Achse und mehrere mittlere). Plus eine systematische
          Drift-Korrektur (~0,05 nach unten) aus dem 872-Pub-Audit. Lesart:
          70 % ist schon sehr gut, 80 % außergewöhnlich.
        </Para>
      </>
    ),
  },
  dimensions_profile: {
    title: 'Dimensions-Profil',
    body: (
      <Para>
        Radar-Chart über die fünf Story Score-Dimensionen mit den Mittelwerten aller
        analysierten Pubs. Zeigt, welche Achsen die ÖAW-Forschung im Schnitt stark/schwach
        besetzt, z.B. „durchschnittlich hohe gesellschaftliche Relevanz, schwache
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
        OpenAccess-/enrichten Pubs. Closed-Access ohne API-Daten fehlt hier.
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
    title: 'ÖAW-PR ohne Pub-Match',
    body: (
      <Para>
        ÖAW-Pressemitteilungen mit DOI-Verweis, deren zugehöriges Paper noch nicht
        in der lokalen WebDB liegt. „Ohne Pub-Match" beschreibt also die
        <strong> Publikation</strong>, nicht die Pressemitteilung selbst: die PR
        ist regulärer ÖAW-Output, das Paper ist nur lokal (noch) nicht verfügbar.
      </Para>
    ),
    note: (
      <Para>
        Häufigste Ursache: das Institut hat die Pub intern
        <strong> nicht für die Web-Anzeige freigegeben</strong>. Solche Pubs
        landen erst gar nicht in der WebDB und folglich auch nicht im
        lokalen Datenbestand von ÖAW Presse. Seltener: das Paper ist erst
        nach dem letzten Import erschienen. Metadaten werden via OpenAlex
        und CrossRef nachgereichert. Wird die Pub später freigegeben und
        importiert, übernimmt der Match-Job die Zuordnung automatisch.
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
        Zeigt nur Pressemitteilungen, deren zugehöriges Paper noch nicht in der
        WebDB liegt. Alles sind reguläre ÖAW-Pressemitteilungen; „ohne Pub-Match"
        bezieht sich auf die fehlende Publikation, nicht auf die PR. Jede Zeile
        ist aufklappbar und offenbart Abstract, Autor:innen, Journal und
        mutmaßliche ÖAW-Beteiligung.
      </Para>
    ),
  },
  orphan_press_release: {
    title: 'ÖAW-Pressemitteilung ohne Pub-Match',
    body: (
      <>
        <Para>
          Eine reguläre ÖAW-Pressemitteilung, deren zugehöriges Paper lokal
          (noch) nicht in der WebDB liegt. Die PR selbst ist nicht „extern",
          sondern stammt vollständig aus dem ÖAW-Outreach; nur das Paper fehlt
          im importierten Datensatz.
        </Para>
        <Para>
          <strong>Häufigste Ursache:</strong> Das publizierende Institut hat
          die Pub intern nicht für die Web-Anzeige freigegeben. Solche Pubs
          landen erst gar nicht in der WebDB und folglich auch nicht im
          lokalen Datenstand von ÖAW Presse. Seltener kommt vor, dass die Pub
          erst nach dem letzten Import publiziert wurde.
        </Para>
        <Para>
          Metadaten kommen aus OpenAlex und CrossRef. Eine
          Beteiligungs-Heuristik matcht Nachname plus Vornamen-Initial gegen
          die <Code>persons</Code>-Tabelle. Sobald die Pub später freigegeben
          oder nachgereicht und importiert wird, wird das Paper automatisch
          verknüpft.
        </Para>
      </>
    ),
    note: (
      <Para>
        Manuelle Verifikation der ÖAW-Beteiligung wird empfohlen, weil
        Nachnamens-Match Homonyme nicht ausschließt.
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

  // ─── Dashboard ───────────────────────────────────────────────────────────
  dashboard_time_range: {
    title: 'Zeitraum-Tabs',
    body: (
      <Para>
        Filtert die Top-Publikationen-Liste (Default 20 Pubs, per
        „Mehr laden" in 20er-Schritten erweiterbar bis 200), die
        Score-Verteilung und das Dimensions-Profil auf ein Zeitfenster:
        Woche, 2 Monate, Jahr oder Gesamt. Default ist 2 Monate, wide genug,
        damit die Top-N-Liste verlässlich gefüllt ist. Der gewählte Tab wird
        in der URL gespeichert, Bookmarks und geteilte Links behalten die
        Ansicht.
      </Para>
    ),
    note: (
      <Para>
        Die Stats-Karten oben (Pubs gesamt, Popular Science, Analysiert, Hohes
        Story-Potenzial) sind nicht von den Tabs betroffen. Sie zeigen immer
        den Gesamtzustand.
      </Para>
    ),
  },

  scoring_status: {
    title: 'Bewertung',
    body: (
      <>
        <Para>
          Die Importe (Publikationen &amp; Events) laufen nächtlich um 06:00 automatisch;
          Publikationen werden dabei gleich angereichert (CrossRef, OpenAlex &amp; Co.), damit
          sie bewertbar werden. Bewertet wird dabei bewusst NICHT. Die Kachel zeigt je Entität,
          wann zuletzt importiert wurde und wie viele Datensätze noch unbewertet sind (älteste
          ab <Code>7 Tagen</Code> rot markiert).
        </Para>
        <Para>
          Der bevorzugte Weg zu bewerten ist das In-Chat-Scoring (Opus, kostenlos) durch die
          Redaktion. Der Knopf <strong>„Bewerten"</strong> ist der Fallback: er bewertet über
          OpenRouter und <strong>kostet Guthaben</strong> (Modellwahl im Dialog), gedacht für
          Fälle, in denen das In-Chat-Scoring nicht rechtzeitig passiert.
        </Para>
        <Para>
          Der Knopf erfasst dabei nur Kandidaten der letzten <Code>{SCORING_RECENT_DAYS} Tage</Code>,
          und genau diese Zahl steht auch in der Pille daneben. Ältere unbewertete Datensätze
          erscheinen gedämpft als <strong>Altbestand</strong>: sie laufen bewusst über das
          kostenlose In-Chat-Scoring, damit ein Klick nicht versehentlich den halben Bestand
          über OpenRouter abrechnet. Auch die Ampel rechnet nur mit den frischen Fällen.
        </Para>
      </>
    ),
    note: (
      <Para>
        Schlägt ein nächtlicher Import fehl, meldet das die Kachel („Letzter Import
        fehlgeschlagen") und zusätzlich eine Mail an websites@oeaw.ac.at.
      </Para>
    ),
  },

} satisfies Record<string, Explanation>;
