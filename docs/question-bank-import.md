# Import question banks into D1

CTFL Practice stores question-bank versions in the existing `DB` binding. Media stays in
`MEDIA` under its existing paths. The files in `public/data/` remain available for authoring,
import and offline fallback. Importing a bank does not rewrite the JSON or any learner record.

| Certificate | Bank ID    | Manifest                                             |
| ----------- | ---------- | ---------------------------------------------------- |
| CTFL        | `original` | `public/data/manifest.json`                          |
| CTFL        | `pdf`      | `public/data/pdf-manifest.json`                      |
| TOEIC       | `jimmy`    | `public/data/toeic/jimmy-manifest.json`              |
| TOEIC       | `hacker`   | `public/data/toeic/hacker-manifest.json`             |
| TOEIC       | `hacker2`  | `public/data/toeic/hacker2-manifest.json` (optional) |

The default import uses these source manifests. The combined TOEIC manifest duplicates Jimmy
and Hacker 3. For another bank, add its ID and labels to the certificate registry and pass
`--certificate ID --bank ID --manifest PATH`. Mark a registry bank optional when it may be
missing from the static fallback. New certificates also need their exam and progress configuration.

## Validate and import

1. Start the local account runtime with `pnpm start`, or use the Site after its question-bank
   migration is deployed. The local and hosted databases are separate.
2. Run `node scripts/import-question-bank.mjs --dry-run --certificate ctfl --bank original`.
   A dry run checks the envelopes, question/answer IDs, shared stimuli and local media.
   Add `--remote` to check media on the destination using its existing R2 binding. A hosted
   check can pass when private media is present in R2 and absent from the checkout.
3. Run `node scripts/import-question-bank.mjs --remote --certificate ctfl --bank original`.
   Supply a JSON object on stdin with `siteUrl` and the `accessToken` from the existing
   Admin login. For a restricted Site, also supply its raw `bypassToken`. Pipe the JSON from
   a secure source. Credentials belong in stdin and out of command arguments and history.
4. Verify the catalog and start a new practice session or mock exam. Repeat for CTFL PDF,
   Jimmy and Hacker 3. The importer checks media before writing each batch. Run a remote
   dry run first when you want a full report of missing files.

The first verified version becomes active by default. Use `--stage-only` to verify a version
without activating it. Each import validates the full bank, writes bounded batches to a
draft, and verifies the stored order, counts and checksum before it becomes eligible for
activation. Rerun with the same files to resume an interrupted import. Use a new
`bankVersion` when any of the three files changes. Preserve existing question and option
IDs, and increment the question revision when its content changes.

## Activate or roll back

Run the command below with the same Admin stdin input. Replace `VERSION` with the verified
version to use, or with `json` to switch that bank to its static files.

```sh
node scripts/import-question-bank.mjs --remote --certificate ctfl --bank original --activate VERSION
```

After a bank has an active version, importing another version verifies and stages it.
Activation changes a single pointer and checks that it still points to the expected previous
version. An active exam or a saved result uses the question and solution snapshots recorded
when the session started. The service worker caches the active catalog and previously opened
versions for offline use. If a bank has no cached copy, Angular can use the original static
JSON. Audio and images still depend on their existing media cache.

The standard Sites build regenerates content from its authoring inputs. In a checkout that
has the retained JSON and lacks the ignored Hacker 3 source packs, build from the retained
data with `pnpm exec ng build --output-path dist/cloudflare` followed by
`node scripts/prepare-sites-build.mjs`.
