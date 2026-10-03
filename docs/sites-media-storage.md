# Sites media storage

Sites uses the `MEDIA` R2 binding declared in `.openai/hosting.json`. Angular,
styles, fonts, icons and question-bank JSON remain in the application archive.
The build excludes `public/audio`, `public/pdf-evidence`, `public/media`,
`public/images`, `public/documents`, `public/video` and `public/videos` from that
archive. Only existing public media is synchronized; source scans in `resources`
are never uploaded by the sync script.

`scripts/sites-media-worker.mjs` serves these paths from R2 on the same origin,
preserving existing bank URLs and saved-session snapshots. It supports GET,
HEAD, ETag revalidation and single byte ranges for audio/video seeking. Missing
media returns 404 rather than the Angular index page. Visitors remain subject to
the Site's existing private access gate; responses use private caching, and no
public bucket URL is introduced.

`pnpm run build:sites` regenerates the service-worker manifest after excluding
media. Media groups use runtime URL patterns with lazy caching instead of build
hashes. Previously opened media can be cached offline; unseen media still needs
a connection. The ordinary Cloudflare build keeps its existing local assets and
service-worker configuration.

## Publishing and synchronization

1. Use the Sites workflow to build, package, push and publish the application.
   The Sites runtime provisions the declared `MEDIA` bucket binding.
2. Configure a random `MEDIA_UPLOAD_SECRET` as a Sites secret, never in source,
   shell arguments or a file. Existing runtime variables must be preserved.
3. Run `node scripts/sync-sites-media.mjs` from the main checkout. At its stdin
   prompt, provide one JSON object containing the verified `siteUrl`,
   `uploadSecret` and existing `bypassToken` from the native Site read response.
   Keep these values in session memory and stdin; do not paste credentials into
   docs, Git or terminal history.
4. The sync script inventories public media, uploads bounded batches and checks
   SHA-256 and byte counts against R2 metadata for every object. Unchanged files
   are skipped, transient failures are retried, and rerunning resumes safely.
   Source media bytes are preserved without audio transcoding. Current sync
   batches accept individual files up to 5 MiB; larger future videos need a
   streaming/multipart uploader before publishing them.
5. Verify media responses and byte-range behavior. Remove the upload secret when
   synchronization finishes and redeploy the same saved version to apply that
   environment revision. The administrative route is then disabled. Neither
   synchronization nor disabling writes deletes existing R2 objects.

`POST /api/site-media` returns bounded checksum metadata and `PUT /api/site-media`
accepts multipart batches. Both require the separate upload secret and the Site
access gate. The Worker validates allowed paths, file sizes and all checksums
before writing a batch. Invalid data never becomes a fabricated successful
upload. Secrets and raw source-document paths are not included in runtime
responses or the deployment archive.

Validation: `pnpm exec vitest run scripts/sites-media-worker.test.mjs`, a Sites
build, and inspection of the generated service-worker hashes and media URL
patterns. Runtime synchronization must report all files verified before declaring
the migration complete.
