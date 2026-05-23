# Writing style

Konventionen für deutsche UI- und KB-Texte in dieser App. Knapp gehalten,
damit Hilfe-Seiten und Tooltips konsistent lesen und nicht je nach Autor:in
driften.

## Em-Dash (—, U+2014): nicht verwenden

Em-Dashes wirken im deutschen Lesefluss wie typografische Lücken: sie
ersetzen Strukturentscheidungen, statt sie zu treffen. Der saubere Fix ist
deshalb **den Satz umformulieren, nicht ein Komma einsetzen.** Ein
eingefügtes Komma lässt den Gedanken oft halbiert stehen.

### Vorher / Nachher

| Vorher (mit em-dash) | Nachher (sauber) | Technik |
|---|---|---|
| `Jede Publikation trägt — sofern ermittelbar — ihr Venue: …` | `Sofern ermittelbar, trägt jede Publikation ihr Venue: …` | Qualifier voranstellen |
| `Venue-Name geparst — das ist die primäre Quelle …` | `Venue-Name geparst. Das ist die primäre Quelle …` | Satz teilen (Punkt + Neusatz) |
| `… hat der API-Wert Vorrang — er trägt den kanonischen Namen.` | `… hat der API-Wert Vorrang. Er trägt den kanonischen Namen.` | Satz teilen |
| `die Facette „Venue" — eine durchsuchbare Auswahl …` | `die durchsuchbare Facette „Venue" mit …` | Apposition auflösen |
| `Direkter PDF-Download von der URL — extrahiert den Volltext.` | `Direkter PDF-Download von der URL. Extrahiert den Volltext.` | Satz teilen |

### Anti-Pattern: bloß ein Komma einsetzen

Das ist die häufigste schlechte Lösung. Aus „A — B" wird „A, B", und der
Satz liest sich halb. Stattdessen prüfen: Punkt + Neusatz, Klammer,
Umstellung, oder den ganzen Einschub auflösen. Die Techniken in der Tabelle
oben sind das Repertoire.

## Enforcement

Zwei Gates, beide in CI, beide verweisen zurück auf dieses Dokument.

| Gate | Scope | Lokal | CI-Step |
|---|---|---|---|
| ESLint-Rule `no-restricted-syntax` in `eslint.config.mjs` | `.ts`/`.tsx` unter `app/`, `components/`, `lib/client/**`, `lib/shared/**` (Test-Files ausgenommen). Fängt U+2014 in Literal / JSXText / TemplateElement. | `npm run lint` | „Lint" |
| `scripts/check-em-dashes.sh` (grep-basiert) | `.mdx` unter `content/help/**`. MDX braucht `eslint-plugin-mdx`, das wir nicht installiert haben; deshalb der grep-Check als Lückenfüller. | `npm run check-em-dashes` | „Em-dash check (MDX)" |

Beide Gates ignorieren Code-Kommentare (JSDoc, `//`, `/* */`) bewusst. Dort
lesen nur Entwickler:innen mit, und Em-Dashes haben dort ihren legitimen
Platz als prägnante Klammertechnik im englischen Code-Stil.

### Nicht abgedeckt (bewusst)

- **`lib/server/**`**: Log-Messages und technische Error-Strings sind
  englisch und dürfen em-dashes enthalten. Reine User-Strings landen nicht
  hier sondern in `lib/shared/**` oder direkt in der UI.
- **`scripts/**`**: Operations-Logs, dev-facing.
- **CSS-`content`-Property** (`::before { content: '—' }`). Selten und
  derzeit nicht benötigt. Wenn das auftaucht, hier ergänzen und den
  Bash-Check entsprechend erweitern.
