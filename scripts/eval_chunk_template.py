# -*- coding: utf-8 -*-
"""
Vorlage fuer Session-basierte Re-Eval-Skripte.

Workflow:
  1. Diese Datei kopieren: cp scripts/eval_chunk_template.py /tmp/build_chunk_revisions.py
  2. Im Block PUBS unten die add(...)-Aufrufe pro Pub fuellen
  3. Ausfuehren: cd /tmp && python3 build_chunk_revisions.py
  4. Bei Erfolg: node scripts/session-pipeline.mjs apply /tmp/chunk_revisions.json --apply --force

Strenge Sanity-Checks:
  * Pitch 350-650 Zeichen (Memory-Soll 350-550, mit Toleranz)
  * Reasoning 200-300 Zeichen (Memory-Soll 180-280; untere Grenze auf 200 hochgezogen,
    weil Stichprobe Sessions 7-15 zeigte: ein Drittel der Reasonings rutschte unter 180,
    und kurze Reasonings korrespondieren mit Mustermuedigkeit / fehlender Vermittelbarkeit)
  * Angle 50-200 Zeichen
  * Keine Pressewertbar-Floskel
  * Keine reine-Fachpresse / Spezialfachpresse-Audiences
  * Keine generic Angles (keine breitenwirksame, keine starke eigenstaendige, kein eigenstaendiger pressewinkel)
  * Keine Wiener-Templates ('Eine Studie aus dem Wiener')
  * Keine Variablennamen (popular_science=, peer_reviewed=, mahighlight=)
  * Keine Akronym-Inferenz: Wenn 'Habsburgermonarchie', 'Mittelalter', etc. im Pitch
    erwaehnt, MUSS der Content (uebergeben via content=...) das Wort wortwoertlich enthalten,
    sonst ist es Fabrikation aus Akronym (z.B. AKP -> 'Austrian Prosopographical' -> 'Habsburg')
  * Keine Bindestrich-statt-Punkt-Tippfehler ('Wort - Eine ...' wo Punkt gemeint war)
  * Alle pitch/angle/haiku unique
  * Haiku-Sanity (haiku_discipline.md): Trenner " / " (kein "\n"),
    keine ASCII-Replacements (waechst/traegt/fuer/Mass/...), 5-7-5 +-1 Silben
  * Mustermuedigkeit-Warner: alle 10 Pubs Reasoning-Median pruefen

Bei Verletzung -> sys.exit(1).
"""

import json
import sys
import statistics
import re

EVALUATIONS = []
CONTENT_BY_ID = {}  # Optional: ID -> content text fuer Akronym-Inferenz-Check

# Pattern, die ohne Content-Beleg Fabrikation sein koennen
_FABRIKATION_KEYWORDS = [
    'habsburgermonarchie', 'habsburger',
    'mittelalter',
    'reformation', 'gegenreformation',
    'aufklaerungszeit', 'aufklärung',
    'cisleithanisch', 'transleithanisch',
    'k.u.k.',
    'erstmonografie', 'erstmals beschrieben',
    'kaum erforscht', 'wenig erschlossen', 'selten thematisiert',
]

# ASCII-Replacement-Marker im Haiku — siehe haiku_discipline.md.
# `prompts.ts` verlangt echte Umlaute; ae/oe/ue/ss sind Pfusch-Symptom des
# Build-Skripts (Python-Quote-Vermeidung). Diese Wortliste deckt die 21
# Treffer aus dem 2026-05-02-Sweep + ein paar wahrscheinliche Erweiterungen.
_ASCII_REPLACEMENT_WORDS = [
    'waechst', 'traegt', 'fuer', 'prueft', 'haengt', 'zaehlt',
    'fliesst', 'schliesst', 'taeuscht', 'klaert', 'gewaehlt',
    'zurueck', 'Heisses', 'Mass ', 'Waerme', 'Kohaerenz',
    'Woerter', 'Schluessel', 'Gluehn', 'stoeren', 'Koerpers',
    'Tueren', 'fluechten', 'gehoert', 'koennen', 'muessen',
    'fuehrt', 'fuehlt', 'staerker', 'naeher', 'spueren',
]


def _count_syllables_de(word: str) -> int:
    """Approximative deutsche Silbenzaehlung. Diphthonge werden als 1 Silbe
    gewertet UND eine Silbengrenze "|" eingefuegt — sonst verschmilzt z.B.
    "zweier" ("ei"+"er") in einer Vokalgruppe und liefert 1 statt 2.
    Reicht fuer 5-7-5-Toleranz +-1, nicht fuer Lyrik-Lehrbuch."""
    w = word.lower()
    # Laengste zuerst, damit "aeu" vor "eu" matcht
    diphthongs = ['aeu', 'äu', 'au', 'ei', 'ie', 'eu', 'ai', 'oi', 'oe', 'ee', 'aa', 'oo']
    for d in diphthongs:
        w = w.replace(d, '@|')
    vowels = set('aeiouäöü@y')
    total = 0
    for segment in w.split('|'):
        in_group = False
        for ch in segment:
            if ch in vowels:
                if not in_group:
                    total += 1
                    in_group = True
            else:
                in_group = False
    return max(1, total)


def _count_syllables_line(line: str) -> int:
    return sum(_count_syllables_de(w) for w in line.split() if any(c.isalpha() for c in w))


def add(pub_id, pa, sr, nf, sp, mt, pitch, angle, reason, audience, haiku, content=None):
    """Fuegt eine Bewertung hinzu. content optional fuer Fabrikations-Check."""
    EVALUATIONS.append({
        'id': pub_id,
        'public_accessibility': pa,
        'societal_relevance': sr,
        'novelty_factor': nf,
        'storytelling_potential': sp,
        'media_timeliness': mt,
        'pitch_suggestion': pitch,
        'suggested_angle': angle,
        'reasoning': reason,
        'target_audience': audience,
        'haiku': haiku,
    })
    if content is not None:
        CONTENT_BY_ID[pub_id] = content


def validate(out_path='/tmp/chunk_revisions.json', expected_count=None):
    problems = []
    ids = set()
    pitches = set()
    angles = set()
    haikus = set()

    GENERIC_ANGLES = [
        'keine breitenwirksame',
        'keine starke eigenstaendige',
        'kein eigenstaendiger pressewinkel',
        'keine eigenstaendige',
    ]
    BAD_AUDIENCE = ['reine fachpresse', 'spezialfachpresse']
    VAR_NAMES = ['popular_science=', 'peer_reviewed=', 'mahighlight=']

    for i, ev in enumerate(EVALUATIONS):
        pid = ev['id']
        if pid in ids:
            problems.append(f'duplicate id {pid}')
        ids.add(pid)

        pitch = ev['pitch_suggestion']
        angle = ev['suggested_angle']
        reason = ev['reasoning']
        audience = ev['target_audience']

        pitch_l = pitch.lower()
        angle_l = angle.lower()
        reason_l = reason.lower()
        audience_l = audience.lower()

        # Defekt-Patterns
        if 'pressewertbar' in (reason_l + pitch_l + angle_l):
            problems.append(f'{pid}: enthaelt "pressewertbar"')
        for ga in GENERIC_ANGLES:
            if ga in (angle_l + pitch_l):
                problems.append(f'{pid}: generic angle "{ga}"')
        for ba in BAD_AUDIENCE:
            if ba in audience_l:
                problems.append(f'{pid}: bad audience "{ba}"')
        if pitch_l.startswith('eine studie aus dem wiener'):
            problems.append(f'{pid}: wiener template start')
        for vn in VAR_NAMES:
            if vn in (reason_l + pitch_l + angle_l):
                problems.append(f'{pid}: variable name "{vn}"')

        # Laengen-Schwellen
        pl, rl, al = len(pitch), len(reason), len(angle)
        if pl < 350 or pl > 650:
            problems.append(f'{pid}: pitch length {pl} (soll 350-650)')
        if rl < 200 or rl > 300:
            problems.append(f'{pid}: reasoning length {rl} (soll 200-300)')
        if al < 50 or al > 200:
            problems.append(f'{pid}: angle length {al} (soll 50-200)')

        # Akronym-Inferenz / Fabrikations-Check
        if pid in CONTENT_BY_ID:
            content_l = CONTENT_BY_ID[pid].lower()
            for kw in _FABRIKATION_KEYWORDS:
                if kw in pitch_l and kw not in content_l:
                    problems.append(
                        f'{pid}: pitch enthaelt "{kw}", aber im Content nicht belegt - moegliche Akronym-Inferenz / Fabrikation'
                    )

        # Bindestrich-statt-Punkt: Klein/Umlaut + " - " + Grossbuchstabe-Wort
        if re.search(r'[a-zäöüß]\s+-\s+[A-ZÄÖÜ][a-zäöüß]+', pitch):
            problems.append(f'{pid}: moeglicher Bindestrich-statt-Punkt-Tippfehler im Pitch')

        # Uniqueness
        if pitch in pitches:
            problems.append(f'{pid}: duplicate pitch')
        pitches.add(pitch)

        if angle in angles:
            problems.append(f'{pid}: duplicate angle')
        angles.add(angle)

        if ev['haiku'] in haikus:
            problems.append(f'{pid}: duplicate haiku')
        haikus.add(ev['haiku'])

        # Haiku-Sanity (siehe haiku_discipline.md):
        # 1. Trenner muss " / " sein, nie "\n" (UI-Renderer erwartet /).
        # 2. Keine ASCII-Replacement-Woerter (waechst, traegt, fuer, Mass, ...) —
        #    die LLM-Promptregel verlangt echte Umlaute.
        # 3. Silbenstruktur 5-7-5 mit Toleranz +-1 je Zeile.
        haiku = ev['haiku']
        if '\n' in haiku:
            problems.append(f'{pid}: haiku enthaelt Newline statt " / " als Trenner')
        for w in _ASCII_REPLACEMENT_WORDS:
            if w in haiku:
                problems.append(f'{pid}: haiku enthaelt ASCII-Replacement "{w.strip()}" — echte Umlaute verwenden')
        haiku_lines = [seg.strip() for seg in haiku.split(' / ') if seg.strip()]
        if len(haiku_lines) != 3:
            problems.append(f'{pid}: haiku hat {len(haiku_lines)} Zeilen statt 3 (Trenner " / ")')
        else:
            target = (5, 7, 5)
            for j, (line, t) in enumerate(zip(haiku_lines, target), 1):
                s = _count_syllables_line(line)
                if abs(s - t) > 1:
                    problems.append(
                        f'{pid}: haiku-Zeile {j} hat ~{s} Silben (Soll {t}+-1): "{line}"'
                    )

        # Mustermuedigkeit-Warner: alle 10 Pubs Reasoning-Median pruefen
        if (i + 1) % 10 == 0:
            recent_rl = [len(e['reasoning']) for e in EVALUATIONS[max(0, i - 9):i + 1]]
            recent_med = statistics.median(recent_rl)
            if recent_med < 220:
                # Warner, nicht Block - gibt nur Hinweis aus
                print(
                    f'  [WARN] Pubs {i-8}..{i+1}: Reasoning-Median {recent_med:.0f} < 220 - Mustermuedigkeit?',
                    file=sys.stderr,
                )

    if expected_count is not None and len(EVALUATIONS) != expected_count:
        problems.append(f'expected {expected_count} evals, got {len(EVALUATIONS)}')

    if problems:
        print('PROBLEMS:', file=sys.stderr)
        for p in problems:
            print('  ', p, file=sys.stderr)
        sys.exit(1)

    # Statistik
    pl_all = [len(ev['pitch_suggestion']) for ev in EVALUATIONS]
    rl_all = [len(ev['reasoning']) for ev in EVALUATIONS]
    al_all = [len(ev['suggested_angle']) for ev in EVALUATIONS]
    print(f'pubs: {len(EVALUATIONS)}')
    print(f'pitch  len: min {min(pl_all)}, median {statistics.median(pl_all):.0f}, max {max(pl_all)}')
    print(f'reason len: min {min(rl_all)}, median {statistics.median(rl_all):.0f}, max {max(rl_all)}')
    print(f'angle  len: min {min(al_all)}, median {statistics.median(al_all):.0f}, max {max(al_all)}')

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump({'evaluations': EVALUATIONS}, f, ensure_ascii=False, indent=2)
    print(f'OK -> {out_path}')


# ============================================================
# PUBS - hier die add(...)-Aufrufe einfuegen
# ============================================================

# add(
#     'uuid-here',
#     0.0, 0.0, 0.0, 0.0, 0.0,  # pa, sr, nf, sp, mt
#     'Pitch ... (350-650 Zeichen)',
#     'Angle ... (50-200 Zeichen)',
#     'Reasoning ... (200-300 Zeichen, dimensional begruendet)',
#     'konkrete Outlets',
#     'Zeile1 / Zeile2 / Zeile3',
#     content='optional - voller Content-Text fuer Fabrikations-Check',
# )


# ============================================================
# Run validation
# ============================================================
if __name__ == '__main__':
    validate(expected_count=50)
