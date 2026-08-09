# MangaHub monorepo CI

MangaHub has two independently buildable components:

- `src/backend` — Go API, scraper, and image proxy;
- `src/frontend` — React/Vite browser application.

The inherited template dispatcher intentionally returns `unknown` for a
declared monorepo until component-aware CI is implemented in the template.
The consumer-owned [`mangahub-components.yml`](../../.github/workflows/mangahub-components.yml)
workflow is therefore the current CI entry point for backend and frontend
quality, tests, and builds.

Keep component commands working-directory aware. Do not add a root-level
`go.mod` symlink to make a single-stack detector pass. When the template's
component-aware contract is accepted, migrate this workflow deliberately and
keep the existing check names during the transition.
