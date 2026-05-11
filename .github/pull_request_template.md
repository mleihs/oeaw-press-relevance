<!--
Thanks for contributing to StoryScout. Please fill in the sections
below. For non-trivial changes, link to a related issue.

References:
- Style + conventions: CONTRIBUTING.md
- Architecture context: ARCHITECTURE.md
- Roadmap (so we know if this is on the planned path): docs/ROADMAP.md
-->

## What

<!-- Brief description of the change — one or two sentences. -->

## Why

<!-- Motivation. Link to a related issue with `Closes #123` or
     `Refs #123` if applicable. -->

## How tested

- [ ] Local dev (`npm run dev`)
- [ ] Type check (`npm run typecheck`)
- [ ] Lint (`npm run lint`)
- [ ] Unit tests (`npm test`)
- [ ] Playwright e2e (`npx playwright test`) — if UI changes
- [ ] Manual UI walk-through — if UI changes
- [ ] New tests added — if the change introduces logic that should be tested

## Screenshots (if UI change)

<!-- Drag-drop or paste images here. Before / after is most useful. -->

## Checklist

- [ ] Commit message(s) follow Conventional Commits (`type(scope): subject`)
- [ ] Migrations are forward-compatible (don't break existing data, idempotent)
- [ ] Docs updated (README / ARCHITECTURE / docs/) if the change affects behaviour or contracts
- [ ] No new ESLint warnings
- [ ] No new TypeScript errors
- [ ] `.env.example` updated if a new env var was introduced
