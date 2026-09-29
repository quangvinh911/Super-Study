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

## TOEIC bank and further imports

The TOEIC bank contains 977 private user-provided Jimmy Reading questions with printed answer keys: 400 Part 5, 120 Part 6 and 457 Part 7. Tests 1–9 have 100 Reading questions each; Test 10 has 77. Questions 178–200 of Test 10 are missing from the supplied Reading PDF even though their keys are present. No Listening material is included. Test fixtures remain synthetic and are never copied into the bank.

This is the book's legacy 40/12/48 Reading structure, not the current 30/16/54 structure below. The imported forms are practice-only and cannot enable a full mock exam. All 977 question stems and 3,908 A–D choices are separate text fields. Part 5 preserves one blank per sentence; Part 6 has 40 shared text passages with numbered blanks. Each question has a cropped source image of its question and choices for evidence; Part 6 crops show the local blank and choices alongside its shared text passage. Question evidence appears after checking in practice and in results because some source pages contain answer markings. Part 7 also uses 125 cropped source passages, excluding the question/choice panels; those passages still require visual reading. No full question-page screenshots are used. Images use the existing lazy `/pdf-evidence/` cache, so unseen evidence is not guaranteed offline.

`content/toeic-jimmy-source.json` holds stable test/question numbers, source pages, printed answer rows and source anomalies. `content/toeic-jimmy-items.json` contains the editable transcriptions, shared passages and exact passage crop coordinates at 160 DPI. `content/toeic-jimmy-question-crops.json` holds one `[PDF page, left, top, right, bottom]` rectangle per question at 160 DPI. Edit these authored files rather than generated JSON. `scripts/import-toeic-jimmy.py` checks source PDF hashes, coverage, separate choices, numbered blanks and question crops, then regenerates the Jimmy source pack and evidence images. Correct option IDs come only from the printed answer rows, indexed by Test and question number. The importer excludes duplicated scans and embedded answer sheets. Jimmy question revision 3 and stable IDs remain unchanged; saved sessions keep their original snapshots. To reproduce locally (Python with `pdfplumber` and Pillow, as for the CTFL PDF importer):

```sh
python scripts/import-toeic-jimmy.py --source-dir resources/toeic/jimmy
python scripts/import-toeic-jimmy.py --source-dir resources/toeic/jimmy --check
pnpm run content:build
pnpm run content:check
pnpm run test:content
```

The importer writes `content/toeic-jimmy-generated.json`; `scripts/build-toeic.mjs` merges source packs into the three TOEIC envelopes during `content:build`. Normal content builds do not require private PDFs or Python. Keep original PDFs and temporary OCR outside commits. Imported material is marked `privateUserProvided` and `sourcePrinted`; neither redistribution clearance nor independent answer verification is claimed. The source contains answer letters only, so explanations truthfully say no rationale was provided.

### Hacker 3 Reading

The user-provided Hacker 3 RC PDF contains ten 29-page Reading tests. Each test has 30 Part 5, 16 Part 6 and 54 Part 7 questions. Printed keys are ten separate numbered PNGs. `content/toeic-hacker-answers.json` stores the Test/question key mapping and source hashes; `content/toeic-hacker-items.json` stores extracted text, question boxes, passage groups and crop coordinates; `content/toeic-hacker-overrides.json` records visual corrections to the PDF text layer. The generated source pack is `content/toeic-hacker-generated.json`. Edit the authored files, then rebuild.

```sh
python scripts/extract-toeic-hacker-answers.py --output content/toeic-hacker-answers.json
python scripts/extract-toeic-hacker.py
python scripts/import-toeic-hacker.py
python scripts/import-toeic-hacker.py --check
pnpm run content:build
pnpm run content:check
pnpm run test:content
```

The question stem and A–D choices are text. Part 6–7 stimuli include source passage text and ordered image crops, including continuation pages. Part 5 questions whose blank is absent from the PDF text layer show the question crop while answering. All questions retain a source image for review after checking or in results. Hacker questions use `hacker-3-test-XX-qNNN` IDs and `sourcePrinted` answer status; Reading-only forms cannot enable a complete 200-question mock exam. Private source scans and extracted content must not be committed or deployed without an appropriate publication decision. The [`toeic-extract-import`](../.agents/skills/toeic-extract-import/SKILL.md) skill covers later Listening imports and the source review process.

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

Run `pnpm run content:check`, `pnpm run test:ci`, and `pnpm run build` after editing the bank. The normal content pipeline validates nested certificate banks using Ajv, including IDs, options, answer keys, version consistency, shared stimuli and media existence. An empty bank is also valid; the UI enables start actions based on actual inventory.

## Adding another certificate

Add a `CertificateDefinition` to the registry and a validated bank under `public/data/<id>/`. Configure sources, taxonomy/topics, exam durations/count, generation strategy and scoring policy. The catalog, routes, shared pages and isolated database follow automatically. Add an adapter when the real exam requires another blueprint or scoring system.

IELTS and AWS are not enabled yet. The current engine supports selected-answer questions and threshold/raw scoring; IELTS writing/speaking, assessed rubrics, band conversion and other exam-specific scoring require additional interaction/scoring adapters. Do not configure these as CTFL-style pass/fail exams.

Sources: [ETS test structure](https://www.ets.org/toeic/about/listening-reading.html), [ETS examinee handbook](https://www.ets.org/content/dam/ets-org/fr/pdfs/toeic/toeic-listening-reading-test-examinee-handbook.pdf).
