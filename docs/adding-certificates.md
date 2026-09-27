# Certificate architecture and adding content

## Ownership

- `src/app/certificates/registry.ts`: certificate metadata, bank URLs, taxonomy, exam generation, duration and scoring policy.
- `core/models`: shared structured questions, optional CTFL classification, shared stimuli/audio, session and result contracts.
- `core/domain/exam-generator.ts`: dispatches to blueprint, random-count or complete-form generation. CTFL's existing matrix adapter remains in `blueprint.ts` for compatibility.
- `core/state/quiz-session.store.ts`: shared practice/exam lifecycle, immutable question and policy snapshots, absolute deadlines and timed sections.
- Feature pages are shared. They receive a route-scoped `CertificateContext`, `ProgressRepository` and `QuizSessionStore`.

Routes are generated as distinct `/certificates/ctfl/...` and `/certificates/toeic/...` trees. Distinct provider injectors prevent stale certificate configuration when switching. The old `/practice`, `/mock-exam`, `/results/:sessionId`, `/progress`, and `/methodology` URLs redirect to CTFL, preserving query parameters and IDs.

## Data compatibility

CTFL continues using the existing `ctfl-practice` IndexedDB database. Other certificates use `certificate-practice:<id>`. Question IDs may overlap between certificates without colliding. Preferences, bookmarks, active sessions, attempts, export/import and reset are scoped to that database.

New exports use `format: certificate-practice-progress`, `schemaVersion: 2`, and `certificateId`. CTFL accepts legacy v1 exports without changing their historical scores or question snapshots. Other certificates reject them. Cross-certificate or malformed imports fail before the write transaction, including in replace mode. The active store is closed before import/reset.

New sessions snapshot the certificate and scoring policy; exams also snapshot their complete exam definition. A registry or bank update cannot change an existing session's timer/policy or a completed result.

## Adding the TOEIC bank later

The production TOEIC bank is intentionally empty. Test fixtures are synthetic and never copied into the production bank.

Edit these files together:

- `public/data/toeic/manifest.json`
- `public/data/toeic/questions.json`
- `public/data/toeic/solutions.json`

Use the same `schemaVersion` and new `bankVersion` in all three envelopes. Update the manifest counts. Every question needs `certificateId: "toeic"`, a stable `id`, `revision`, structured `stem`/`options`, `interaction`, `classification`, provenance and verification. See `content/schema/certificate-bank.schema.json`; chapter, LO and K-level are optional for other certificates. Keep CTFL's authoring files/schema unchanged.

For TOEIC:

- Set `classification.section` to `part-1` through `part-7`, and `styleTags` to the applicable tags (an empty array is valid).
- Set `shuffleOptions: false`. Use the answer's stable option ID, not its visual position.
- Optional `stimulus: { id, content }` holds the shared conversation, image or reading passage. Repeat the same stimulus ID and structured content for each question in the group; the validator checks consistency.
- Audio blocks are `{ "kind": "audio", "src": "/audio/toeic/file.mp3", "label": "Conversation 1" }`. Put actual media under `public/audio/toeic/`. Add transcripts to solutions, not the question stimulus, if they reveal the answer. Media paths must resolve to existing local public assets. Audio is cached after access, not guaranteed offline before its first download.
- Solutions use `questionId`, `correctOptionIds`, `explanation`, optional option rationales, and evidence `references`. Never mark unreviewed answers as verified.
- Partial banks can be used for practice. A mock exam requires a complete authored `formId` with unique `order` values 1–200 and the Part quotas below. Forms are selected by seed, never mixed or globally shuffled, preserving shared passages/audio.

| Section   | Part          |        Questions | Time             |
| --------- | ------------- | ---------------: | ---------------- |
| Listening | 1 / 2 / 3 / 4 | 6 / 25 / 39 / 30 | 45 minutes total |
| Reading   | 5 / 6 / 7     |     30 / 16 / 54 | 75 minutes total |

Practice reveals answers after checking. Mock exams lock future sections and completed sections, move to Reading after 45 minutes and submit after 120 minutes. Audio has learner-controlled playback; this is a practice simulation, not an official TOEIC administration. Results show raw correct counts/percentages and Part breakdowns, without an invented 10–990 conversion or pass/fail threshold.

Run `pnpm run content:check`, `pnpm run test:ci`, and `pnpm run build` after editing the bank. The normal content pipeline validates nested certificate banks using Ajv, including IDs, options, answer keys, version consistency, shared stimuli and media existence. The empty bank is valid; the UI enables start actions based on actual inventory.

## Adding another certificate

Add a `CertificateDefinition` to the registry and a validated bank under `public/data/<id>/`. Configure sources, taxonomy/topics, exam durations/count, generation strategy and scoring policy. The catalog, routes, shared pages and isolated database follow automatically. Add an adapter when the real exam requires another blueprint or scoring system.

IELTS and AWS are not enabled yet. The current engine supports selected-answer questions and threshold/raw scoring; IELTS writing/speaking, assessed rubrics, band conversion and other exam-specific scoring require additional interaction/scoring adapters. Do not configure these as CTFL-style pass/fail exams.

Sources: [ETS test structure](https://www.ets.org/toeic/about/listening-reading.html), [ETS examinee handbook](https://www.ets.org/content/dam/ets-org/fr/pdfs/toeic/toeic-listening-reading-test-examinee-handbook.pdf).
