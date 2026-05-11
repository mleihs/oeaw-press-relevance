import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

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
    // Python-Venv vom SPECTER2-Embedding-Setup — enthält torch/sklearn JS-Dateien
    // die ESLint mitscannt; sind aber third-party und nicht unsere Verantwortung.
    "scripts/embeddings/.venv/**",
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

      // Allow `_`-prefixed args/vars as intentional-unused convention.
      // Used for Next.js route handlers and helpers that take but don't read
      // a parameter (e.g. `getSupabaseFromRequest(_req)`). Universal JS/TS
      // pattern that lint should respect.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Phase-2 architecture-boundaries (Plan §6.3). Warn-level during the
  // gradual migration; promote to "error" in the hardening PR once all
  // routes are moved (Plan §6.6 step 5).
  // First-match-wins on element patterns — `app/api/**` listed BEFORE
  // `app/**` so route handlers resolve to api-routes, not app-pages.
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "server", pattern: "lib/server/**" },
        { type: "shared", pattern: "lib/shared/**" },
        { type: "client", pattern: "lib/client/**" },
        { type: "api-routes", pattern: "app/api/**" },
        { type: "app-pages", pattern: "app/**" },
        { type: "components", pattern: "components/**" },
        { type: "scripts", pattern: "scripts/**" },
      ],
    },
    rules: {
      "boundaries/element-types": [
        "warn",
        {
          default: "allow",
          rules: [
            { from: "shared", allow: ["shared"] },
            { from: "server", allow: ["shared", "server"] },
            { from: "client", allow: ["shared", "client"] },
            { from: "components", allow: ["shared", "client", "components"] },
            { from: "app-pages", disallow: ["server"] },
            { from: "api-routes", allow: ["server", "shared", "api-routes"] },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
