---
name: certificate-coding-standards
description: Write, refactor or review readable, maintainable code in this Angular/TypeScript certificate-practice project. Apply to application code, SCSS, Node content scripts and tests; favor simple solutions, clear boundaries and the existing stack over unnecessary abstractions. Use alongside the relevant feature skill, not for content-only classification or deployment.
---

# Coding standards

All repository paths below are relative to the project root. Inspect nearby code, `package.json`, relevant TypeScript configuration and `.prettierrc` before editing. Read `docs/adding-certificates.md` when a change spans certificates. Apply relevant sections, not a mandatory redesign of every touched file.

## Keep the solution understandable

Start with the concrete behavior requested. Prefer one direct implementation with clear names over extra factories, base classes, wrappers or extension points. Extract a function/module when it names a meaningful responsibility, removes repeated business logic or isolates side effects. Small duplication is acceptable when a shared abstraction would obscure different rules.

Use domain names such as `selectedOptionIds`, `examDeadline` and `submitExam`. Keep booleans readable (`isExpired`, `canSubmit`). Prefer guard clauses and explicit intermediate values when they clarify branching. Avoid nested ternaries, boolean mode arguments with unclear meaning and dense chains that mix filtering, mutation and persistence. Choose loops or array methods by readability, not ideology.

Keep functions focused on one outcome. Split by responsibility and cognitive load rather than arbitrary line-count limits. Comments explain why, invariants or external constraints; they should not paraphrase the code. Name constants for meaningful policies, with the registry remaining the source of certificate-specific quotas and timing.

## Respect the existing architecture

Components present UI and dispatch actions; domain functions implement scoring, generation and filtering; the session store coordinates lifecycle; repositories perform persistence. Keep domain functions independent of Angular and browser APIs where practical. Follow `certificate-angular` for route-scoped services, certificate boundaries and snapshots.

Prefer registry configuration for actual certificate differences. Add an adapter only where behavior differs. Avoid broad interfaces covering speculative IELTS/AWS features or a service whose only purpose is forwarding calls. Make a local change before proposing a wider refactor, and preserve observable behavior during refactoring.

## TypeScript and data boundaries

Preserve existing compiler checks and aim for strongly typed new code; check inherited app/spec configurations before assuming strictness. Use inference for obvious local values and explicit types for exported contracts or ambiguous results. Use `unknown` for untrusted input, then validate/narrow it. Type assertions do not validate imported JSON.

Model distinct states with existing discriminated unions when this prevents impossible combinations. Handle meaningful variants explicitly. Use `readonly` for values that should not be reassigned and avoid mutating caller-owned arrays or historical session data. Do not bypass errors with `any`, non-null assertions or suppression comments without a concrete, documented reason.

Keep optional values intentional. Use defaults only when absence is valid; missing solutions, malformed banks or storage failures must not become fabricated successful results. Dates and durations must state units in names or types. Reuse stable IDs and existing models rather than introducing near-duplicate shapes.

## Angular and reactive state

Use the project's standalone and zoneless patterns. Keep dependencies and template APIs easy to find. Prefer `inject`, readonly signal/input/output references and limited visibility for implementation details. Keep changes consistent with nearby code instead of renaming unrelated members.

Use `computed` for derived values. Reserve effects for actual side effects; avoid copying derived state between signals. Use RxJS when stream composition/cancellation helps; use `async`/`await` for straightforward one-shot operations. Clean up subscriptions, listeners and timers using the existing lifecycle pattern, with `takeUntilDestroyed`/`DestroyRef` where appropriate.

Keep templates readable with simple expressions and named actions. Use stable IDs for list tracking and scoped class/style bindings. Extract substantial calculations from templates. Do not add manual change-detection workarounds before finding why the zoneless UI fails to update.

## Async work and storage

Make ownership and completion explicit: await required operations, handle rejected promises and prevent duplicate submission where relevant. Use parallel work only for independent operations. Keep lifecycle and transactional writes ordered. Do not swallow failures in empty catches or display internal exceptions directly to learners; preserve useful diagnostic context without exposing private data.

Keep IndexedDB operations in repositories, migrations explicit and imports validated before replacement. Preserve atomic completion and absolute deadlines. Avoid global mutable state that can leak across certificates or tests. Test concurrency/cleanup behavior when changing it rather than adding locks everywhere by default.

## SCSS, markup and scripts

Use semantic native controls, accessible labels and visible focus. Keep styles near their feature, reuse existing tokens and keep selector nesting shallow. Avoid broad global selectors, specificity battles and `!important` fixes unless an integration requires them. Keep responsive behavior and reduced motion intact.

For Node `.mjs` scripts, use the existing ESM/pipeline conventions. Separate parsing, semantic validation and output generation enough to make errors traceable. Identify the file/question/field in validation errors. Keep generated files reproducible and edit the authored source. Do not generalize a one-off script into a new framework.

## Review and finish

Format only touched files with the existing Prettier configuration; avoid repository-wide churn. A formatter checks layout, not correctness or maintainability. Do not introduce ESLint, stricter project-wide flags or new packages incidentally; these are separate tooling changes when requested or justified by the task.

Use `certificate-quality` to select relevant verification for behavioral changes. Tests should assert public behavior and meaningful edge cases, not private method names or implementation wording. Before handoff, check whether the diff introduces duplicate state, hidden side effects, unnecessary dependencies, unclear naming or unrelated changes. Report actual checks and any remaining limitation.

## Official references

Consult these for uncertain API behavior; the installed version and project conventions determine applicable usage:

- [Angular style guide](https://angular.dev/style-guide)
- [Angular signals](https://angular.dev/guide/signals)
- [TypeScript narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)

The preference for minimal abstractions and proportionate refactoring is a project rule, not a claim that these sources mandate every convention above.
