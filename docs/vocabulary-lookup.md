# Favorite vocabulary: internet dictionary lookup

Clicking a star saves the word immediately without a dialog and shows a notification in the top-right corner. `FavoriteVocabularyService` then calls `POST /api/vocabulary/enrich`. The server's `lookupVocabulary` searches internet dictionary data rather than generating a card. No API key, paid model or credential file is required.

In English study text, double-click a word on desktop or hold it for one second on mobile to open a small confirmation. Choose “Thêm từ vựng” to save or “Không” to dismiss. A single click does not save. Moving the touch, scrolling, navigating away or pressing Escape cancels the interaction. The selection action for phrases also asks for confirmation.

Click a saved word to hear English browser speech synthesis. The device must support an English voice; playback errors are displayed. Clicking a word only plays pronunciation and does not save or retry enrichment. Use “Thử bổ sung lại” explicitly for missing dictionary information. Legacy cards marked complete but missing fields are eligible for retry. When Wiktionary lacks IPA, the server checks [Free Dictionary API](https://dictionaryapi.dev/) for that exact term, including phrase components where necessary. Secondary IPA is attributed separately. Existing IPA and example text are retained if a retry does not return those fields.

## Sources and selection

- [FreeDictionaryAPI.com](https://freedictionaryapi.com/) returns Wiktionary entries, IPA, meanings, examples and translations. The service requests the whole term, including multiword expressions, and uses a current sense with an example where available. US IPA is preferred, with another available IPA accepted if necessary. Source data is cached for one hour in a bounded 200-entry server cache.
- Vietnamese meanings supplied by the local study library are preserved. Otherwise, a Vietnamese translation from the dictionary sense is used. If absent, the service queries the [MyMemory translation service](https://mymemory.translated.net/) for the term. It checks response status and quota flags; service error text is never treated as a translation.
- If translation is unavailable, the original English definition is kept and explicitly labeled English. No invented Vietnamese meaning is inserted.
- Examples come from the selected dictionary sense. A learner's original context can be retained if it has sentence punctuation and contains the selected term; fragments such as `track a shipment` are not substituted for sentences.
- If a phrase has no IPA, the service retrieves component-word IPA for phrases of up to eight words. The saved page explicitly labels this as **word-by-word pronunciation**, not connected speech. Missing component data leaves IPA absent.

Cards display attribution to FreeDictionaryAPI.com, the original Wiktionary page and CC BY-SA 4.0. MyMemory translations are labeled separately. The APIs have their own availability, coverage and rate limits. FreeDictionaryAPI.com documents 1,000 requests per hour per IP; phrase component lookups consume multiple requests. Some words or phrases will lack translations, IPA or examples. The card stays saved, shows what is missing, and offers a retry or explicit manual editing. Existing complete cards are reused without another request.

## Running locally

Use the pinned Node/pnpm versions. Start Angular and the dictionary server together:

```powershell
pnpm start
```

For separate processes, use `pnpm run start:api` in one terminal and Angular in another:

```powershell
pnpm exec ng serve
```

Open `http://localhost:4200`. The backend binds to `127.0.0.1:8788` and accepts that browser origin. No environment variables or credentials are necessary.

Angular's default development configuration now includes the vocabulary proxy. The normal `pnpm start` command manages both processes together. Missing API routes, non-JSON hosting responses, dictionary outages, unknown terms and rate limits produce explicit saved-card error messages. “Đang tra” is displayed while lookup is pending; missing fields are not presented as a successful lookup. Use “Thử bổ sung lại” for earlier failed cards. A primary dictionary miss or failure now tries the secondary dictionary for definitions, examples and IPA too, with its own attribution.

## Production and persistence

The existing Sites worker routes the endpoint to `scripts/vocabulary-api.mjs`. `prepare-sites-build.mjs` copies both the API handler and `vocabulary-lookup.mjs` into server output. Other hosts must provide the same endpoint; a static-only deployment cannot run the dictionary proxy. No deployment is performed by this feature.

The endpoint accepts same-origin JSON POSTs, caps request size, uses fixed provider hosts and applies a 25-second shared lookup timeout. It forwards only the term to public dictionary/translation sources, not the learner's exam context, saved history or certificate identity. Backend response caching is disabled; dictionary-source cache is independent of learner-supplied meanings and contexts. Requests are limited to 10 per client and 60 total per minute per server instance.

IndexedDB remains certificate-isolated. Pending/failed/partial cards are preserved. Background updates are transactional so deleted words are not resurrected and manual edits are not overwritten. Stored source and language metadata remain alongside the card. The legacy `source: ai` value is accepted for existing records only; no code calls a model or requires its key. Saved vocabulary remains independent of exam progress export/import/reset. Already saved cards can be read offline; internet lookup requires connectivity.
