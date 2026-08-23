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
