# Hunter — Specification

## CI/CD Architecture (GitHub Pages via GitHub Actions)

Hunter is deployed as a static site to GitHub Pages using an automated
GitHub Actions pipeline.

### Target build directory

- The production build output target is `dist/` (Vite default).
- `actions/upload-pages-artifact` packages the `dist/` directory as the
  Pages artifact; `actions/deploy-pages` publishes it.

### Repository base path

- Because the site is served from a project page
  (`https://<org>.github.io/Hunter/`), the Vite base path must be set to
  `'/Hunter/'` in `vite.config.ts`.

### Workflow specification (`.github/workflows/deploy.yml`)

- Trigger: push to `main`.
- Runner: Node 20 (`actions/setup-node@v4`, `node-version: '20'`).
- Quality gate: install dependencies and run the Vitest suite
  (`npm ci && npm run test`); deployment only proceeds if tests pass.
- Build: `npm run build` producing `dist/`.
- Deploy:
  - `actions/configure-pages@v5`
  - `actions/upload-pages-artifact@v3` with `path: dist`
  - `actions/deploy-pages@v4`
- Permissions: `contents: read`, `pages: write`, `id-token: write`;
  concurrency group `pages` with `cancel-in-progress: true`.

## 3-Column Dashboard Layout (TASK-08)

Hunter's main view becomes a responsive three-column dashboard:

| Column | Component | Purpose |
|--------|-----------|---------|
| Left   | `GameCodex` (Information Search) | Metadata lookup: release date, reviews, publisher/synopsis. |
| Center | Existing views (`BacklogManager`, `RoadmapTimeline`, `DealRadar`) | Primary dashboard content, unchanged in behaviour. |
| Right  | `RetroAdsSidebar` (Sponsored Banners) | Playful 90s-style retro game banners, sponsor cards, affiliate deal highlights. |

### Responsive contract

- **Wide (> 1280px):** all three columns visible; sidebars fixed width
  (~280–320px), center column fluid.
- **Medium (768–1280px):** sidebars collapse into collapsible drawers /
  toggle buttons; center column remains primary.
- **Narrow (< 768px):** single column stack — center content first,
  Codex and ads accessible via bottom tab bar or menu toggles.

The layout is implemented with CSS Grid (`grid-template-columns`) and
Tailwind breakpoints; no layout shift when sidebars toggle.

## Duration Prompt Modal UX Contract (TASK-07)

Every flow that adds a game to the backlog must first open a
`DurationPromptModal` asking for estimated playtime hours:

1. **Trigger points:** manual entry form submit in `BacklogManager`, and
   the '+ Backlog' action in `DealRadar`.
2. **Prefill:** if a known estimate exists (e.g. RAWG/HowLongToBeat-style
   data attached to the deal or search result), the input is prefilled
   with it; otherwise it falls back to **20 hours**.
3. **Input:** numeric hours field (min 0.5, step 0.5), prefocused,
   Enter confirms, Escape cancels; Cancel aborts the add entirely.
4. **Confirmation:** on confirm the entry is created with
   `hoursToBeat = <confirmed value>` and flows through the existing
   `onAdd` / `onAddToBacklog` callbacks unchanged.
5. **Accessibility:** modal traps focus, uses
   `role="dialog" aria-modal="true"`, labelled title ("Estimated
   playtime"), and restores focus to the triggering element on close.

## Game Codex — Information Search (Left Sidebar)

`GameCodex` provides a search bar that queries game metadata via the
CheapShark API (game list lookup) with metadata enrichment:

- Debounced text input (≥ 3 chars, ~300ms debounce) calling
  `cheapshark.ts` search; selecting a result fetches game info
  (`storeLookup`/info endpoint) plus any available metadata.
- Displayed fields per result: title, thumbnail, release date,
  review score/description, publisher, and synopsis where available;
  cheapest current deal price with a shortcut to Deal Radar.
- Loading, empty, and error states are explicit; results render as an
  accessible list with keyboard navigation.
- An "Add to backlog" affordance on a result routes through the
  Duration Prompt Modal (prefilled from known data).

## Retro Ads Sidebar (Right Sidebar)

`RetroAdsSidebar` renders monetization/flavor widgets:

- 90s-style retro game banners (pixel-art borders, neon gradients,
  scanline/CRT accents), sponsor cards, and affiliate deal highlights
  sourced from current CheapShark deals.
- Light/dark mode support via existing theme tokens (CSS variables /
  Tailwind dark: variants); all decorative styling degrades gracefully
  without images.
- Affiliate links carry `rel="sponsored noopener"` and are clearly
  labelled "Sponsored"; the sidebar is `aria-label`led and excluded
  from the main landmark flow (`role="complementary"`).
- Banner rotation is deterministic (no layout shift); clicking a deal
  highlight deep-links into Deal Radar.
