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

Saved vocabulary is available at `/certificates/<id>/saved-vocabulary` through the “Từ vựng yêu thích” submenu. `FavoriteVocabularyRepository` stores learner-authored definitions, IPA and sentence examples in the separate IndexedDB database `certificate-vocabulary:<id>`. Normalized terms prevent duplicate saves within a certificate. These records are independent of exam progress and are not included in progress export/import/reset. The certificate shell offers desktop double-click and mobile one-second hold in English text/content blocks, plus a selection action for phrases. These actions show a confirmation before saving; interactive answer controls keep their existing behavior. Vocabulary-card stars save immediately. Saving shows a top-right notification. The server-side internet dictionary lookup adds meanings, IPA and example sentences in the background; failed/pending/partial records remain saved and offer a retry. Explicit editing remains available. See [vocabulary dictionary lookup](vocabulary-lookup.md) for sources, local development and production requirements.

TOEIC vocabulary lives at `/certificates/toeic/vocabulary`, with separate collection routes such as `/certificates/toeic/vocabulary/hacker-3`. Add collection metadata in `src/app/features/vocabulary/vocabulary-data.ts`; do not add vocabulary to the scored question bank. The Hacker 3 selection contains 180 word entries organized around 30 topics and all 120 expressions from the supplied supplementary vocabulary PDFs, rather than a transcription of the entire book. Meanings and examples/combinations are authored separately from raw OCR. The supplementary book is Hackers TOEIC Vocabulary and is grouped with Hacker 3 for this local study library; the label does not claim it is exclusively a Hacker 3 test-book glossary.

Private reviewed input is `content/toeic-hacker-vocabulary-reviewed.json`; source scans remain in `resources/toeic/hacker3/notes/` and temporary OCR in `tmp/`. All three locations and the extracted output `public/data/toeic/vocabulary/hacker-3.json` stay out of Git. `scripts/build-toeic-vocabulary.mjs` runs within `content:build`/`content:check`, checks PDF hashes, keeps exact PDF page references and matches original terms against Hacker questions, choices, shared content and transcripts. Matching is literal with word boundaries; it does not count inflections or infer correct answers from vocabulary occurrences. Missing private inputs are skipped on other checkouts, and the UI explains unavailable local data. Search supports Vietnamese without accents; topic/type filters and meaning reveal do not alter exam progress or saved sessions. Add future collections as separate data packs with their own provenance and review, retaining the collection index.

Hacker 3 grammar coverage and source question references are recorded in [the grammar review](toeic-hacker-grammar-review.md). The additions use original explanations and self-checks.

TOEIC has a separate grammar library under `/certificates/toeic/grammar` with 19 authored lessons, original examples and two local self-check questions per lesson. It is independent of the question bank and IndexedDB progress. Lesson links to practice use `?part=part-5` or `?part=part-6` to preselect a Reading Part; the learner can still change the filter before starting. Grammar lessons and diagrams live in `src/app/features/grammar/`, not in the generated TOEIC bank.

The Jimmy TOEIC bank contains 977 private user-provided Reading questions with printed answer keys: 400 Part 5, 120 Part 6 and 457 Part 7. Tests 1–9 have 100 Reading questions each; Test 10 has 77. Questions 178–200 of Test 10 are missing from the supplied Reading PDF even though their keys are present. Jimmy has no Listening material. Test fixtures remain synthetic and are never copied into the bank.

This is the book's legacy 40/12/48 Reading structure, not the current 30/16/54 structure below. The imported forms are practice-only and cannot enable a full mock exam. All 977 question stems and 3,908 A–D choices are separate text fields. Part 5 preserves one blank per sentence; Part 6 has 40 shared text passages with numbered blanks. Each question has a cropped source image of its question and choices for evidence; Part 6 crops show the local blank and choices alongside its shared text passage. Question evidence appears after checking in practice and in results because some source pages contain answer markings. Part 7 also uses 125 cropped source passages, excluding the question/choice panels; those passages still require visual reading. No full question-page screenshots are used. Images use the existing lazy `/pdf-evidence/` cache, so unseen evidence is not guaranteed offline.

`content/toeic-jimmy-source.json` holds stable test/question numbers, source pages, printed answer rows and source anomalies. `content/toeic-jimmy-items.json` contains the editable transcriptions, shared passages and exact passage crop coordinates at 160 DPI. `content/toeic-jimmy-question-crops.json` holds one `[PDF page, left, top, right, bottom]` rectangle per question at 160 DPI. Edit these authored files rather than generated JSON. `scripts/import-toeic-jimmy.py` checks source PDF hashes, coverage, separate choices, numbered blanks and question crops, then regenerates the Jimmy source pack and evidence images. Correct option IDs come only from the printed answer rows, indexed by Test and question number. The importer excludes duplicated scans and embedded answer sheets. Jimmy question revision 3 and stable IDs remain unchanged; saved sessions keep their original snapshots. To reproduce locally (Python with `pdfplumber` and Pillow, as for the CTFL PDF importer):

```sh
python scripts/import-toeic-jimmy.py --source-dir resources/toeic/jimmy
python scripts/import-toeic-jimmy.py --source-dir resources/toeic/jimmy --check
pnpm run content:build
pnpm run content:check
pnpm run test:content
```

The importer writes `content/toeic-jimmy-generated.json`; `scripts/build-toeic.mjs` publishes separate Jimmy and Hacker banks plus a combined compatibility bank during `content:build`. The practice and mock-exam setup pages expose the separate banks, so learners can choose the source before starting. Normal content builds do not require private PDFs or Python. Keep original PDFs and temporary OCR outside commits. Imported material is marked `privateUserProvided` and `sourcePrinted`; neither redistribution clearance nor independent answer verification is claimed. The source contains answer letters only, so explanations truthfully say no rationale was provided.

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

The question stem and A–D choices are text. Part 6–7 stimuli include source passage text and ordered image crops, including continuation pages. The extractor restores Part 5 blanks omitted by the PDF text layer from word spacing plus reviewed overrides, and the importer requires exactly one textual blank in every Part 5 question. All questions retain a source image for review after checking or in results. Hacker Part 5 questions are revision 2 after this extraction correction; stable `hacker-3-test-XX-qNNN` IDs and `sourcePrinted` answer status remain unchanged. Private source scans and extracted content must not be committed or deployed without an appropriate publication decision.

### Hacker 3 Listening

The user-provided Hacker 3 LC PDF, transcript PDF and ten full-test MP3 files supply Listening Parts 1–4. `scripts/extract-toeic-hacker-lc.py` records source hashes, Test/question/page mapping, printed answers, transcriptions, image boxes and reviewed audio cues in `content/toeic-hacker-lc-{source,items,audio-cues}.json`. Targeted text corrections live in `content/toeic-hacker-lc-overrides.json`, separate from generated extraction. `scripts/import-toeic-hacker-lc.py` produces `content/toeic-hacker-lc-generated.json`, 532 local clips and bounded image evidence. Pass explicit `--ffmpeg` and `--ffprobe` paths for the locally installed tools; run both scripts with `--check` after importing.

The Hacker bank combines 980 Listening questions with the existing 1,000 Reading questions. Tests 1–3 and 5–10 contain all 200 questions and can be selected for a mock exam. The supplied LC scan lacks printed book pages 64–65 and 72–73 for Test 4, so Test 4 contains only Listening questions 3–64 and 83–100 plus its 100 Reading questions. Its 180 questions remain available for practice but do not qualify as a complete mock form. The omitted Listening IDs are reserved and may be added when those pages are supplied. Do not reconstruct them from the answer key.

Part 1 photographs and Part 3–4 graphics appear while answering. Part 1–2 use one clip per question; Part 3–4 share one clip per three-question group. Answer-revealing transcripts appear only in solutions after checking or submission. Local source files, generated transcriptions and public media are for private practice; keep them out of commits and deployment unless publication is separately authorized. The [`toeic-extract-import`](../.agents/skills/toeic-extract-import/SKILL.md) skill covers source review.

The build writes these combined compatibility files together:

- `public/data/toeic/manifest.json`
- `public/data/toeic/questions.json`
- `public/data/toeic/solutions.json`

It also writes the selectable source banks as `jimmy-{manifest,questions,solutions}.json` and `hacker-{manifest,questions,solutions}.json` in the same directory. Registry entries point to the source-specific manifests; do not hand-edit generated bank files.

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

Set `catalogGroup` (`language` or `professional`) and concise `catalogHighlights` for the certificate catalog. Add `learningResources` only for real lesson routes; each entry supplies its sidebar label, route segment and overview description. The certificate workspace shows shared practice, mock-exam, progress and methodology links automatically. The home page remembers only the last visited certificate in optional local UI preferences; attempts and active sessions remain in each certificate's separate database.

IELTS and AWS are not enabled yet. The current engine supports selected-answer questions and threshold/raw scoring; IELTS writing/speaking, assessed rubrics, band conversion and other exam-specific scoring require additional interaction/scoring adapters. Do not configure these as CTFL-style pass/fail exams.

Sources: [ETS test structure](https://www.ets.org/toeic/about/listening-reading.html), [ETS examinee handbook](https://www.ets.org/content/dam/ets-org/fr/pdfs/toeic/toeic-listening-reading-test-examinee-handbook.pdf).
