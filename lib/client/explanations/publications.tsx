// Publikations-Domäne des EXPL-Objekts — Story Score & Dimensionen, Score-N/A-
// Varianten, Enrichment-Status & -Quellen, Badges, Pitch-Felder, Triage-
// Entscheidungen, Filter/Presets der Publikationsliste, Venue/Institut-Chip
// und die Import-/Pipeline-Erklärungen. Zusammengeführt in ./index.tsx.

import { Para, Code, type Explanation } from './primitives';

export const PUBLICATIONS_EXPL = {
  // ─── Per-publication press_score ─────────────────────────────────────────
  press_score: {
    title: 'Story Score (Press-Relevanz)',
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
        Höchstes Gewicht im Story Score und damit das wichtigste Kriterium für Pressetauglichkeit.
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
        saisonale Themen? Niedrigstes Gewicht im Story Score.
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
          <li><strong>Hoch (blau)</strong>: ≥ 70 % (solider Pitch-Kandidat)</li>
          <li><strong>Mittel (amber)</strong>: 40–69 % (fallweise prüfen)</li>
          <li><strong>Niedrig (grau)</strong>: &lt; 40 % (Spezialpaper, kaum pressetauglich)</li>
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
          Ein Tag wie <Code>anthropic/claude-opus-4.8-session</Code> (bzw. ältere
          <Code>…-4.7-session</Code>) bedeutet: Bewertung erfolgte interaktiv in einer
          Claude-Code-Session, ohne API-Kosten. Die Versionsnummer benennt die
          Modellgeneration. OpenRouter-Modelle haben echte Token-Kosten in USD.
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
          Akademie-Endorsement</strong>. Empirisch stammen 90 % der gesetzten Marker
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
          Solange das nicht geschehen ist, kann die Pub auch nicht inhaltlich bewertet werden,
          denn eine Bewertung ohne Substanz wäre Fabrikation.
        </Para>
      </>
    ),
  },
  status_enriched: {
    title: 'Anreicherung erfolgreich',
    body: (
      <Para>
        Mindestens eine externe Quelle hat zusätzliche Metadaten geliefert, typischerweise
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
        Alle externen Quellen (CrossRef, OpenAlex, Unpaywall, Semantic Scholar) wurden
        abgefragt, keine lieferte verwertbare Daten. Häufige Ursachen: Pub hat keinen DOI;
        DOI ist in keiner Datenbank registriert; der Abstract liegt nur in einem Format
        vor, das die APIs nicht ausliefern; oder das Paper ist „in press" mit bereits
        zugewiesenem DOI, aber das Erscheinungsdatum liegt noch in der Zukunft, sodass die
        APIs den Eintrag noch nicht indexiert haben (klassisches Pre-Publication-Window).
        Im letzten Fall hilft ein Re-Enrichment-Lauf, sobald die Pub formal erschienen ist,
        üblich Tage bis Wochen nach Online-Publication.
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
          ÖAW-Pressemitteilung. Der eigentliche Triage-Pool.
        </Para>
      </>
    ),
  },

  // ─── Score N/A — Variants nach state ─────────────────────────────────────
  score_na: {
    title: 'Kein Press-Score',
    body: (
      <Para>
        Diese Publikation wurde noch nicht inhaltlich bewertet, daher kein Story Score.
      </Para>
    ),
  },
  score_na_pending_pending: {
    title: 'Kein Score: keine Anreicherung versucht',
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
    title: 'Kein Score: Anreicherung teilweise',
    body: (
      <>
        <Para>
          Externe Quellen lieferten zwar Metadaten (z.B. Keywords, Journal), aber keinen
          Abstract. Häufiger Fall: Elsevier- oder Springer-DOIs werden bei CrossRef indexiert,
          aber der Abstract steht nur hinter Paywall und kommt nicht über die freien APIs.
        </Para>
        <Para>
          Eine Bewertung allein auf Basis von Titel und Keywords wäre Fabrikation, daher
          kein Score. Optionen: <Code>enrich-augment</Code> für zusätzliche Quellen, oder
          die Pub manuell bewerten lassen.
        </Para>
      </>
    ),
  },
  score_na_pending_enriched: {
    title: 'Kein Score: bewertbar, aber Scoring fehlt',
    body: (
      <Para>
        Die Anreicherung ist durch und ein Abstract liegt vor. Die Pub könnte sofort durch
        ein Sprachmodell bewertet werden. Es fehlt nur der Trigger einer Scoring-Session.
        Über die Analyse-Seite oder per Pipeline-Befehl auslösbar.
      </Para>
    ),
  },
  score_na_pending_failed: {
    title: 'Kein Score: Anreicherung fehlgeschlagen',
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
    title: 'Kein Score: Bewertung fehlgeschlagen',
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
    title: 'Story Score-Spalte',
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
        Story Score ein, weil die inhaltliche Press-Eignung weiterhin vom Sprachmodell
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
        Die Erklärung des Sprachmodells, warum der Story Score so ausgefallen ist. Hebt
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
          nächsten Nachbarn im Press-Cluster (alle gepressten ÖAW-Papers plus
          Pubs ohne lokalen WebDB-Match, deren PR aus dem ÖAW-Outreach kommt).
          Self-Match wird ausgeschlossen.
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
        Story Score ≥ 70 %, nicht-pressetaugliche Formate ausgeblendet. Die Triage-Sicht
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

  // ─── Institut-Chip (orgunit_publications + Co-Autor-Ableitung) ────────────
  orgunit_chip: {
    title: 'Institut-Chip',
    body: (
      <>
        <Para>
          Die kleinen grauen Kürzel an einer Publikation sind die zugeordneten
          OEAW-Institute (Akronym <Code>akronym_de</Code> aus <Code>orgunits</Code>).
          Eine Publikation kann mehrere Institute haben, etwa wenn Forschende
          aus unterschiedlichen Häusern gemeinsam publizieren.
        </Para>
        <Para>
          Zwei Quellen für denselben Chip, visuell unterschieden:
        </Para>
        <Para>
          <strong>Vollflächiger Chip</strong> = direkte WebDB-Zuordnung
          (<Code>orgunit_publications</Code>). Ein Institut hat das Paper
          editorial in seinem Output beansprucht.
        </Para>
        <Para>
          <strong>Gestrichelter, kursiver Chip</strong> = abgeleitet aus dem
          Anstellungsverhältnis einer Co-Autor:in. Das passiert bei rund 4&nbsp;%
          der Pubs: Paper steht in WebDB ohne Institutszuordnung, aber eine
          Co-Autor:in arbeitet aktuell an einem OEAW-Institut. Für die
          Press-Triage ist diese Verbindung relevant: ein realer
          OEAW-Ansprechpartner für die Story.
        </Para>
      </>
    ),
    note: (
      <Para>
        Quelle der Logik: SQL-View <Code>publication_orgunit_context</Code>.
        Direkte Zuordnung gewinnt; die Ableitung greift nur, wenn das Paper
        in WebDB <em>keinem</em> Institut zugeordnet ist (kein Übermalen
        editorischer Entscheidungen).
      </Para>
    ),
  },

  // ─── Journal / Venue ─────────────────────────────────────────────────────
  venue: {
    title: 'Journal / Venue',
    body: (
      <>
        <Para>
          Das Publikationsorgan: Fachzeitschrift, Buch, Sammel- oder Tagungsband,
          Magazin oder Preprint-Server (z.B. bioRxiv, Zenodo). In der
          Publikationsliste steht es als kursive Zeile mit Buch-Symbol unter dem
          Titel; ein Klick filtert die Liste auf das Outlet (bei bekannten Outlets
          werden alle Schreibvarianten im Korpus zusammengefasst, z.B. „Der Standard"
          + „DerStandard.at" + „Der Standard [Blog]").
        </Para>
        <Para>
          Ermittelt im Feld <Code>enriched_journal</Code> auf zwei Wegen: primär aus
          den Zitationsdaten der WebDB (BibTeX, RIS, EndNote) geparst; wo dort nichts
          steht, per DOI über CrossRef und OpenAlex nachgetragen. Abdeckung rund 90 %.
        </Para>
      </>
    ),
    note: (
      <Para>
        Ein <em>Venue</em>, kein reiner Journal-Name: gut die Hälfte sind Bücher,
        Sammelbände oder Tagungsbände. Die ~10 % ohne ermitteltes Venue zeigen keine
        Zeile.
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
        Der Import läuft als <strong>UPSERT pro <Code>webdb_uid</Code></strong>:
        Story Scores, Pitch-Material, Haiku, Begründung, Flags, Decisions und
        Enrichment-Daten werden nicht angefasst. Pubs, die im neuen Dump fehlen,
        werden auf <Code>archived = true</Code> gesetzt statt gelöscht, damit alle
        Verknüpfungen zu Decisions und MeisterTask-Karten stabil bleiben.
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
        OpenRouter) und berechnet Story Score, fünf Dimensionen, Pitch-Vorschlag,
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

} satisfies Record<string, Explanation>;
