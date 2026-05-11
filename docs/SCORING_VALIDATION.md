# Press-Score Validation

Empirical analysis of the LLM-driven `press_score` against the gold
standard — which publications actually became press releases.

## Setup

- Gold standard: ~120 pubs that turned into a press release
- Candidate pool: ~7000 analyzed publications
- Methodology: 5-fold cross-validation, AUC-ROC + Average Precision

## Findings — V1 Formula (in production)

The shipped weights (Public Accessibility 20% / Societal Relevance 25%
/ Novelty 20% / Storytelling 20% / Media Timeliness 15%) are
hypothesis-driven, not data-fit.

- CV-AUC: 0.85
- Average Precision: 0.088

## Logistic-Regression Baseline (5 dimensions)

A plain LR over the same 5 LLM dimensions yields AP 0.114 — better than
hand-tuned weights. `novelty` + `storytelling_potential` account for
~75% of the signal. `societal_relevance` effectively contributes 0.

## Multicollinearity Warning

VIF 12–32 across 4 of 5 LLM dimensions: the LLM's halo effect makes
single-dimension scores noisy. The aggregate `press_score` is robust;
individual dimension values are not reliable as standalone signals.

## SPECTER2 Embedding-Similarity

- **Centroid cosine** of pressed-pubs centroid vs candidate embedding
- **k-NN top-5 average** cosine over the 5 nearest pressed pubs

Empirical result: k-NN beats centroid by ΔAP +0.049. Implementation:
`refresh_press_similarity_knn` RPC, `ivfflat.probes=50` forced via
function-attribute.

## IQOQI / Quanten-Reputation Blind Spot

7/10 LR false-negatives are quantum-physics publications — the LLM
doesn't infer "this is the IQOQI flagship institute, so the bar is
higher / the topic is press-worthy by reputation". An Institute-One-Hot
feature would help, but the cleaner long-term fix is SPECTER2 embedding
similarity, which captures topical reputation implicitly.

## Recommended V2 Formula

Re-weight by LR coefficients, re-validate. Not yet shipped — tracked in
[ROADMAP.md](ROADMAP.md).
