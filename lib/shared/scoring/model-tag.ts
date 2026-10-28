// Provenienz-Tag für Bewertungen des automatischen Kerns (Nacht, Knopf, CLI).
//
// Drei Wege schreiben `llm_model`, und jeder braucht einen unterscheidbaren Tag,
// sonst vermischt jede Auswertung nach Modell die Kohorten:
//   in-chat Pubs      lib/shared/session-model.json        …-session
//   in-chat Events    lib/shared/event-session-model.json  … (in-chat)
//   Kern (dieser)     autoModelTag(model)                  …-auto
// Für Publikationen und Events derselbe Tag; der Auslöser (Nacht, Knopf, CLI)
// steht im Journal `scoring_runs`, nicht im Tag.

export const AUTO_TAG_SUFFIX = '-auto';

/** Generationsunabhängiger Detektor für SQL `LIKE`, Muster wie session-model.json. */
export const AUTO_MODEL_LIKE = 'anthropic/claude-opus-%-auto';

/** 'anthropic/claude-opus-5.5' → 'anthropic/claude-opus-5.5-auto'. Idempotent. */
export function autoModelTag(model: string): string {
  return model.endsWith(AUTO_TAG_SUFFIX) ? model : `${model}${AUTO_TAG_SUFFIX}`;
}

/** Umkehrung für die Preisermittlung: Tag → Modell-ID. Andere Tags unverändert. */
export function modelFromTag(tag: string): string {
  return tag.endsWith(AUTO_TAG_SUFFIX) ? tag.slice(0, -AUTO_TAG_SUFFIX.length) : tag;
}
