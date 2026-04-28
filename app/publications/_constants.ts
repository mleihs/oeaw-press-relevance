// publication_type webdb_uids treated as press-eligible by default.
// Excluded when showAll=false: theses, posters, scripts, encyclopedia stubs, reviews.
export const ELIGIBILITY_EXCLUDE_TYPE_UIDS = [
  5,  // Buch- oder Aufsatzbesprechung
  7,  // Diplomarbeit / Bakkalaureatsarbeit
  8,  // Dissertation
  13, // Habilitationsschrift
  15, // Konferenzbeitrag: Poster (in Proceedingsband)
  19, // Skriptum
  23, // kurze Lexikonbeiträge, summarisch
];

// publication_type webdb_uids forming the "Wissenschaftlich" preset.
export const WISS_TYPE_UIDS = [
  1,  // Beitrag in Fachzeitschrift  (Journal article)
  4,  // Beitrag in Sammelwerk        (Book chapter)
  6,  // Buch/Monographie             (Book)
  14, // Herausgeberschaft            (Editorship)
  16, // Konferenzbeitrag: Publikation in Proceedingsband (Conference paper)
];

export const SUPER_DOMAIN_LABELS: Record<number, string> = {
  1: 'Naturwissenschaften',
  2: 'Technische Wissenschaften',
  3: 'Humanmedizin, Gesundheitswiss.',
  4: 'Agrarwissenschaften, Vet.med.',
  5: 'Sozialwissenschaften',
  6: 'Geisteswissenschaften',
};

export const PRESETS = [
  { key: 'pitch', label: 'Pitch-fertig' },
  { key: 'mahighlights', label: 'Eigen-Highlights' },
  { key: 'wiss', label: 'Wissenschaftlich' },
  { key: 'popsci', label: 'Popular Science' },
  { key: 'peer', label: 'Peer-reviewed' },
] as const;
