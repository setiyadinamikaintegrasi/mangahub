# MangaHub monorepo CI

MangaHub has two independently buildable components:

- `src/backend` — Go API, scraper, and image proxy;
- `src/frontend` — React/Vite browser application.

The repository adopts the template's version-2 component contract in
`.template/project.yaml`. The standard `ci.yml` dispatcher validates that
contract and calls the reusable `ci-monorepo.yml` workflow. Quality, tests, and
builds fan out by component with stable aggregate and component check names.

The current component map is:

| Component | Path | Stack | Artifact |
|---|---|---|---|
| backend | `src/backend` | Go | `build-backend` |
| frontend | `src/frontend` | Node.js | `build-frontend` |

The previous consumer-specific bridge was removed to avoid duplicate checks.

Keep component commands working-directory aware. Do not add a root-level
`go.mod` symlink to make a single-stack detector pass. Component checks remain
advisory until branch-protection policy is explicitly updated; production
deployment and smoke testing remain consumer-owned skeletons.
