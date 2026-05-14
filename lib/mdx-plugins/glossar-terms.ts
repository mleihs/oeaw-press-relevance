// Conservative glossary auto-link map. Each entry maps a term to the URL
// fragment of the glossar section that defines it. The remark plugin uses
// these to inject deep-links into article prose on first occurrence.
//
// Selection rules (to avoid noisy or false-positive links):
//  - Specific jargon only (no generic English nouns like "Abstract", "API").
//  - Acronyms ≥ 3 chars with low collision risk.
//  - Compound terms (e.g. "Press-Cluster") link as a unit when they appear
//    verbatim — partial matches against generic words like "Pure" are
//    avoided unless the term is contextually distinctive in this codebase.
//
// Length-sorted at plugin level so longest prefixes win (ÖSTAT-6 before ÖSTAT,
// Press-Cluster before any partial overlap).

export const GLOSSAR_TERMS: Record<string, string> = {
  // R – Z
  StoryScore: '/help/grundlagen/glossar#r-z',
  WebDB: '/help/grundlagen/glossar#r-z',
  SPECTER2: '/help/grundlagen/glossar#r-z',
  TYPO3: '/help/grundlagen/glossar#r-z',
  Triage: '/help/grundlagen/glossar#r-z',

  // M – P
  mahighlight: '/help/grundlagen/glossar#m-p',
  MeisterTask: '/help/grundlagen/glossar#m-p',
  'ÖSTAT-6': '/help/grundlagen/glossar#m-p',
  'ÖSTAT-3': '/help/grundlagen/glossar#m-p',
  ÖSTAT: '/help/grundlagen/glossar#m-p',
  Orgunit: '/help/grundlagen/glossar#m-p',
  'Peer-Review': '/help/grundlagen/glossar#m-p',
  'Press-Cluster': '/help/grundlagen/glossar#m-p',
  Pure: '/help/grundlagen/glossar#m-p',

  // E – L
  ETL: '/help/grundlagen/glossar#e-l',
  ITA: '/help/grundlagen/glossar#e-l',
  Embedding: '/help/grundlagen/glossar#e-l',

  // A – D
  BYOK: '/help/grundlagen/glossar#a-d',
  'Cosinus-Ähnlichkeit': '/help/grundlagen/glossar#a-d',
  'Drift-Korrektur': '/help/grundlagen/glossar#a-d',
};
