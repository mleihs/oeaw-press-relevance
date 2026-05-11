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
  // Phase-2 architecture-boundaries hardening (Plan §6.3 + §6.6 step 5).
  // - Uses boundaries/dependencies (v6 rule name; element-types is the
  //   deprecated v5 name).
  // - default: "disallow" means every cross-element import must be on an
  //   explicit allow list; everything outside (third-party packages,
  //   unclassified files) is silently allowed by the plugin's
  //   checkAllOrigins/checkUnknownLocals defaults.
  // - level: "error" — CI fails on new violations.
  //
  // Selector form: still string-based even though v6's TS types document an
  // object form (`{ type: "shared" }`). The runtime ESLint JSON-schema in
  // eslint-plugin-boundaries@6.0.2 only validates string selectors, so the
  // "Consider migrating to object-based selectors" notice printed at lint
  // start is unactionable until upstream ships the schema update.
  //
  // Pattern order matters (first-match-wins): app/api/** must come BEFORE
  // app/** so route handlers resolve to api-routes, not app-pages.
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
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          rules: [
            // shared is the kernel — no project-internal deps
            { from: "shared", allow: ["shared"] },
            // server can call into shared + other server modules
            { from: "server", allow: ["shared", "server"] },
            // client must NOT reach into server (would leak into the bundle)
            { from: "client", allow: ["shared", "client"] },
            // components are pure UI; no server, no app-pages, no api-routes
            { from: "components", allow: ["shared", "client", "components"] },
            // app-pages compose client/components; server is forbidden
            // (use API routes instead)
            {
              from: "app-pages",
              allow: ["shared", "client", "components", "app-pages"],
            },
            // api-routes are the only surface that bridges to server
            { from: "api-routes", allow: ["server", "shared", "api-routes"] },
            // scripts run offline / in cron; need server enrichment clients
            { from: "scripts", allow: ["shared", "server", "scripts"] },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
