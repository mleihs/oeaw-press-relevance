import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Off — low signal in a German text corpus where straight quotes inside
      // EXPL bodies and prose are common (15+ violations in lib/explanations.tsx
      // alone). If we want consistent typography, the right move is German
      // curly quotes („…") in a separate pass — not entity-escaping.
      "react/no-unescaped-entities": "off",

      // Warn (not error) — react-hooks 7.x flags every `setState` inside
      // useEffect, including legitimate localStorage-sync and fetch-loading
      // patterns. The proper fix is useSyncExternalStore for localStorage and
      // Suspense / a data-fetching lib for the fetches; that's a larger
      // refactor (see use-leaderboard.ts, beeswarm-view.tsx, settings/page.tsx).
      // Surfaced as warning so the signal stays visible without blocking CI.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
