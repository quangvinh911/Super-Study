---
name: certificate-quality
description: Test changes to this Angular certificate-practice app with Vitest, Playwright, accessibility and production PWA checks. Use for scoring/generation regressions, certificate isolation, session reload/timers, progress import/export, offline behavior and pre-release verification. Select checks proportionate to the change rather than always running every suite.
---

# Certificate quality checks

All paths below are relative to the repository root. Read `package.json`, relevant test files and Playwright configurations before selecting commands. Use pinned Node/pnpm versions; report environment failures separately from application assertions.

## Select checks by risk

| Change | Checks |
| --- | --- |
| Skills or documentation only | Validate skill metadata, links and diff; no application build needed |
| Bank/schema/compiler | `pnpm run content:check`, `pnpm run test:content`; build content first when generated output must change |
| Domain/state/persistence | `pnpm run test:ci`; add regression cases next to the changed module |
| Components/routes/learner flows | Unit tests plus relevant specs via `pnpm exec playwright test <spec-path>` |
| Service worker/cache/update/media loading | `pnpm run test:pwa` against production output, not `ng serve` |
| Broad release | Content checks, `pnpm run test:ci`, `pnpm run test:content`, `pnpm run test:e2e`, `pnpm run test:pwa` and target build |

Read `e2e/learning-flows.spec.ts`, `e2e/multi-certificate.spec.ts` and `e2e/pwa-offline.spec.ts` as applicable. Do not assume browser support from Chromium alone. If a browser cannot start on the host, report it as unverified; do not silently remove it from CI.

## Required invariants for affected flows

- CTFL: exactly 40 unique questions matching the registry blueprint; deterministic seeded generation; 25/40 fails and 26/40 passes; 60/75-minute deadlines survive reload.
- Grading: option order never changes correctness; multi-select must match the exact set; practice reveals answers only after checking, exams only after submission.
- TOEIC: incomplete inventory prevents mocks but allows available practice; select one complete ordered 200-question form; preserve shared stimuli; transition at 45 minutes and finish at 120; prohibit access to locked sections; present raw totals/Part results without invented pass/fail or scaled scores.
- Persistence: certificate-isolated stats/bookmarks/history even with duplicate IDs across banks; legacy CTFL import remains supported; malformed/cross-certificate imports leave existing data intact; snapshots retain results after bank revisions.
- Lifecycle: quick certificate switching does not restore another certificate's session; leases prevent concurrent exam editing; submission is atomic/idempotent; expired restored sessions advance/submit correctly.
- Offline: prime the production service worker first, then exercise reload and restored sessions offline; verify nested certificate JSON caching. Test audio both cached and not-yet-cached without claiming all media works offline. Updates must not disrupt an active exam.

## UI and security checks

Use native fieldsets/legends and radio/checkbox semantics; check keyboard selection, visible focus, route focus restoration, non-color-only feedback, narrow 320px layout, 200% zoom and reduced motion where affected. Run axe with no serious/critical violations for changed flows; automated checks do not replace manual keyboard/screen-reader verification. Avoid arbitrary HTML rendering, answer leakage in mock UI and external analytics. Check hosting headers on actual deployment only when deployment verification is in scope.

## Handoff

Report commands actually run, pass/fail results, unsupported environments and manual checks not performed. Do not claim Lighthouse, screen-reader, browser or production checks based only on unit tests. Do not publish or push merely to run a local regression suite.
