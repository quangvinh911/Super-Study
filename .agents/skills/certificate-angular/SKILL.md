---
name: certificate-angular
description: Implement or refactor Angular features in this multi-certificate practice project, including certificate registration, shared practice/mock-exam flows, routing, scoring adapters, signals and IndexedDB persistence. Use for application code changes; pair with certificate-content for bank changes and certificate-quality for regression coverage.
---

# Certificate Angular development

All paths below are relative to the repository root.

## Locate the change

Read `docs/adding-certificates.md`, then the relevant implementation and its tests. Start with `src/app/certificates/registry.ts` and `src/app/core/models` for certificate behavior; use `src/app/core/domain` for pure scoring/generation/filtering and `src/app/core/state/quiz-session.store.ts` for session lifecycle. Inspect the existing feature before introducing abstractions.

Apply [certificate-coding-standards](../certificate-coding-standards/SKILL.md) for readability, TypeScript, reactive state and maintainability. Keep architecture rules here and coding conventions in that skill rather than duplicating them.

Keep standalone, strict Angular components, signals, lazy feature routes, native controls and SCSS. Follow the existing zoneless change-detection pattern. Do not introduce NgModules, NgRx, Angular Material, SSR, a backend or authentication without a task requiring them. Keep learner UI Vietnamese and question content in the bank's language.

## Preserve the certificate boundary

- Add certificate capabilities to registry/model/adapters instead of scattering CTFL/TOEIC branches across shared pages.
- Keep distinct static routes per certificate, each providing its own `CertificateContext`, `ProgressRepository` and `QuizSessionStore`. Do not collapse them into one parameterized route with a cached route injector that can retain the previous certificate's services.
- Preserve legacy CTFL redirects, including session IDs and query parameters.
- Preserve CTFL's database name `ctfl-practice`; isolate other certificates under `certificate-practice:<id>`. Identical question IDs across certificates must never share statistics, bookmarks or sessions.
- Keep scoring and generation pure and seedable. Snapshot questions, solutions, certificate identity and scoring policy; snapshot exam definitions too. Never reinterpret historical attempts using a newly edited bank or registry.

## Preserve session guarantees

Use absolute deadlines, not a decrementing counter as the source of truth. Restore elapsed exam/section state on reload. Serialize open/close/restore operations during certificate switching; release timers and the exam lease when leaving the certificate shell. Keep completion atomic and idempotent across attempts, statistics and active-session deletion.

Validate an import completely, including certificate identity, before any replacement transaction. Accept legacy CTFL exports only for CTFL. Close the active store before reset/import; preserve existing progress unless the user requested removal.

## Choose an honest exam adapter

CTFL uses its blueprint and pass threshold. TOEIC uses complete authored forms with ordered timed sections and raw results, not CTFL pass/fail. Do not imply IELTS writing/speaking assessment or AWS scaled scoring is supported by merely adding a catalog entry. Add explicit interaction/scoring adapters when required; leave unavailable banks with a useful empty state rather than sample content disguised as real material.

## Finish

Add regression tests for changed behavior using `certificate-quality`. Read current `package.json` scripts before running checks. Update `docs/adding-certificates.md` when the extension contract changes. Report what changed, checks actually run and any remaining unsupported behavior.
