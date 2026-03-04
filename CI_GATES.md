# CI Gates (Phase 9)

This repository uses a two-level CI strategy:

1. `quality-gates` (required)
2. `full-regression` (required on `main`/`master`, optional on PR via `workflow_dispatch`)

## Required Go/No-Go Gates

A change is **Go** only if all required gates pass.

- `npm run type-check`
- `npm run ci:core`
  - `test:dashboard`
  - `test:error-sanitizer`
  - `test:security-inputs`
  - `test:rate-limiter`
  - `test:release-control`
  - `test:usage-monitor`
  - `test:observability`
- `npm run ci:smoke` (`npm run build`)

If any required gate fails, the change is **No-Go**.

## Golden Regression

`full-regression` includes the deterministic golden suite:

- `npm run test:golden`

If intentional planning/composition output changes are made, refresh baseline:

```bash
npm run test:golden:update
```

## Commands

```bash
npm run ci         # Full required CI gates (local parity with GitHub Actions)
npm run ci:core    # Core tests
npm run ci:smoke   # Build smoke test
npm test           # Full regression suite
```
