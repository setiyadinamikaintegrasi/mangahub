# ADR-0006: Declare project layout before stack detection

- Status: Accepted
- Date: 2026-08-08
- Decision owners: Template maintainers

## Context

The template originally detected one primary stack from the repository root or
directly under `src/`. A consumer monorepo may instead contain multiple
components such as `src/backend/go.mod` and `src/frontend/package.json`.
Choosing the first nested manifest would be ambiguous and could run a stack
toolchain against the wrong component.

## Decision

The consumer initializer records a credential-free layout declaration in
`.template/project.yaml`:

```yaml
version: 1
layout: monorepo
primary_stack: go
primary_path: src/backend
```

Supported layouts are `single`, `monorepo`, and `undecided`. The project config
is validated locally and by `make ci` when present.

The single-stack detector returns `unknown` for a declared `monorepo`. A
version-2 config is instead resolved by the dispatcher and reusable
component-aware workflow; version-1 configs retain the fail-safe compatibility
behavior. Repositories without a config retain compatibility behavior.

## Consequences

Positive:

- The layout decision is explicit and reviewable.
- Consumer onboarding can ask the monorepo question early.
- Nested services are not silently misclassified.
- No credentials or provider-specific settings are introduced.

Trade-offs:

- Version-2 monorepos receive component-aware CI with explicit working
  directories; version-1 monorepos remain fail-safe until migrated.
- `primary_path` records the primary component while the explicit component list
  owns fan-out, paths, artifacts, and check contexts.

## Rejected alternative

Recursively selecting the first manifest under `src/` was rejected because it is
not deterministic for multi-stack repositories and can produce false-green or
false-red CI results.
