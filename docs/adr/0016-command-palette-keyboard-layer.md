---
date: 2026-05-17
status: accepted
deciders: Command-interface build (Option B) + self-review web research 2026-05-17
supersedes: none
---

# 0016 — Command palette + global keyboard layer (cmdk, 0-dep matcher)

## Context

The product needed a keyboard-first command/navigation interface like
GitHub/Linear. Deep research + codebase recon found the starting point was
*not* greenfield: `cmdk@1.1.1` and the shadcn `components/ui/command.tsx`
wrapper were installed, Fumadocs/Orama search was wired at `/api/search`,
and `lib/client/hooks/use-keyboard-shortcuts.ts` already grabbed `⌘K`
(metaKey-only, no Ctrl) for the publications filter. Constraints in play:
the Next.js 16 query-nav regression (`memory/nextjs16_client_nav_regression.md`),
WCAG 2.1.4 (printable single-key shortcuts must be switchable off), German
UI, and the dark-mode token conventions.

## Decision

One global palette (`components/command/command-menu.tsx`) owns `⌘K`/`Ctrl+K`.
A single pure registry (`lib/client/commands/registry.ts`) feeds the palette,
the keybinding matcher, *and* the cheat-sheet, so an advertised shortcut can
never drift from a wired one.

- **0-dependency keybinding matcher** (`lib/client/commands/keybindings.ts`,
  ~90 LOC: chord / single / `g`-sequence; guards for `event.repeat`,
  IME/Dead keys and typing targets; sequence-buffer reset on blur; React-19
  clean `dispose()`). cmdk's own README says to wire ⌘K yourself; shadcn
  and dub.co hand-roll the same layer; the library candidates do **not**
  remove the parts that actually cost work here (typing/IME guard, WCAG
  toggle). Correctness is pinned by `keybindings.test.ts` + `score.test.ts`
  (the pure scorer is split into `score.ts`). Ergonomics mirror tinykeys so
  swapping in a library stays a one-liner if scope ever explodes.
- **`/` stays page-local, `⌘K` is global** — GitHub's exact split. `⌘K`
  removed from `use-keyboard-shortcuts.ts` (documented, not a silent change).
- **Fumadocs RootProvider `search` disabled**; help results are surfaced
  *inside* the palette via `useDocsSearch` (one ⌘K, not two).
- **WCAG 2.1.4**: a `useKeyboardShortcutsEnabled` toggle modelled 1:1 on
  `useInfoBubblesEnabled` gates the single-key/sequence layer; `⌘K` is a
  modifier chord and stays on (exempt) as the primary affordance.
- **Triage single-keys (`p/h/s/z`, `j/k`) deferred.** They need a row-cursor
  + imperative decision API inside the shared 828-LOC `PublicationTable` /
  `DecisionToolbar`; the registry's `binding`/scoping makes that purely
  additive later. Not faked.

## Consequences

- ✅ Single unified `⌘K`; cheat-sheet cannot lie (single source of truth).
- ✅ No new runtime dependency; React-19/StrictMode-clean teardown.
- ✅ Fixed a real a11y bug: `CommandDialog` rendered `DialogTitle` outside
  `DialogContent` (no accessible name + Radix dev warning).
- ✅ The self-review web-research pass caught a real defect in the first cut
  (no `event.repeat` guard → a held key refired); fixed + regression-tested.
- ⚠️ `/publications` `⌘K` now opens the global palette, not the list filter
  (`/` still focuses it); placeholder hint updated.
- ⚠️ `/help` no longer has Fumadocs' own search box — help search is the
  palette now.
- ↔️ Superhuman-style focused-row triage is an explicit follow-up.

## Alternatives considered

(Decision-grade web research, 2026-05-17 — sources below.)

- **tinykeys (the literal Option B pick).** Rejected. Dormant (no commits
  since 2024-08; open bugs hitting this exact use: #197 mixed-length
  sequences, #130 `?`, #191 TS `moduleResolution: "Bundler"` on Next 16).
  Ships **no** typing guard, **no** IME/Dead guard, **no** WCAG toggle — it
  would sit *next to* wrapper code its own size, for net-neutral LOC plus a
  dormant dependency.
- **react-hotkeys-hook@5.3.2 (the strongest "buy").** Actively maintained,
  0 deps, native `g>d` sequences, built-in form-tag guard. Still rejected:
  it does **not** discharge the WCAG-2.1.4 toggle + persistence (built
  regardless), needs a 1-line IME shim anyway, and the reference consensus
  (cmdk README "do it yourself"; shadcn; dub.co) is to hand-roll this
  10-binding layer. Documented escape hatch if bindings grow to dozens of
  scoped/remappable shortcuts.
- **kbar.** Rejected: stale (no release since 2025-07) and adopting it means
  *deleting* the installed cmdk + shadcn `command.tsx` (17 kB gz, 5 deps).
- **@github/hotkey.** Native sequences but vanilla DOM: you hand-write the
  React adapter + StrictMode-idempotent install. Worse DX, same result.
- **Keep Fumadocs' global ⌘K separate.** Rejected: two palettes + two `⌘K`
  owners is exactly the conflict this design removes.

## References

- `lib/client/commands/registry.ts`, `components/command/command-menu.tsx`,
  `lib/client/commands/keybindings.ts`, `lib/client/hooks/use-keyboard-shortcuts-enabled.ts`
- `memory/nextjs16_client_nav_regression.md` (why nav is route-only)
- `memory/dark_mode_token_conventions.md` (token discipline followed)
- `lib/client/commands/{keybindings,score}.test.ts` (correctness artifact)
- Research 2026-05-17: cmdk README FAQ ("⌘K? do it yourself"); shadcn
  command-menu source; dub.co `use-keyboard-shortcut`; tinykeys repo/npm
  (dormant); react-hotkeys-hook@5.3.2 npm/docs; WCAG 2.1.4 Understanding
  (W3C, updated 2026-02-23); Hazel Duvall 2025 keyboard-lib audit
- [ADR 0009](0009-rsc-server-components-pilot.md) (client-island under RSC layout)
