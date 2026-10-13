# Favorite vocabulary: internet dictionary lookup

Clicking a star saves the word immediately without a dialog and shows a notification in the top-right corner. `FavoriteVocabularyService` then calls `POST /api/vocabulary/enrich`. The server's `lookupVocabulary` searches internet dictionary data rather than generating a card. No API key, paid model or credential file is required.

Adding a term manually on the saved-vocabulary page uses the same automatic enrichment. Learners only need to enter the English word or phrase. If the primary dictionary has a definition but no example, the server also searches Free Dictionary API for a sentence for the whole term, without replacing the primary meaning or IPA. The secondary response is reused when IPA is also missing, and its example attribution is preserved in guest and account storage. Legacy saved cards with a missing example offer “Thử bổ sung lại”, even if they were previously marked complete. A failed example lookup keeps the available primary details and leaves the card eligible for retry.

If dictionary examples and the learner's sentence context are both absent, the server searches the [Tatoeba sentence API](https://api.tatoeba.org/openapi) for English sentences containing the whole word or phrase. It validates exact word boundaries and phrase order, language, sentence length, approval status and attribution, and only accepts CC BY 2.0 FR sentences with an author and a valid sentence ID. Cards and lookup previews link to that sentence and show its author and license; these fields survive guest/account storage and editing. Successful sentence results share the bounded one-hour server cache. Secondary dictionary calls have a five-second limit and corpus searches a six-second limit within the existing total request deadline. Dictionary sense selection keeps the first current sense rather than switching to an unrelated slang meaning for its example.

In English study text, double-click a word on desktop or hold it for one second on mobile to show a dictionary icon near the text. Highlight a phrase to show the same icon, or use “Tra từ / cụm từ đang bôi đen” with a keyboard selection. Click the icon to open a modal with the meaning, IPA and a sentence example. Lookup alone never saves a favorite. “Thêm vào từ vựng yêu thích” saves the previewed data without another dictionary request and preserves an existing favorite, including manual edits. Missing fields and lookup failures are explicit; retry is available, and a failed lookup can still be saved for later enrichment. Moving the touch, scrolling or clicking outside dismisses the icon. Close the popup with its close button or Escape; navigation and closing cancel pending lookups. The native modal keeps keyboard focus inside it and closing restores focus to the trigger.

Click the word or phrase in the popup heading, or a saved word, to hear English browser speech synthesis. The popup heading includes a speaker icon and works with keyboard activation. Closing the popup stops its playback. The device must support an English voice; playback errors are displayed. Clicking a word only plays pronunciation and does not save or retry enrichment. Use “Thử bổ sung lại” explicitly for missing dictionary information. Legacy cards marked complete but missing fields are eligible for retry. When Wiktionary lacks IPA, the server checks [Free Dictionary API](https://dictionaryapi.dev/) for that exact term, including phrase components where necessary. Secondary IPA is attributed separately. Existing IPA and example text are retained if a retry does not return those fields.

## Sources and selection

Vietnamese translation starts alongside pronunciation lookup and has a six-second timeout. Successful term translations are cached for one hour. When the hosted lookup falls back to English, the client retries MyMemory directly using its CORS-enabled endpoint, avoiding a shared hosting IP's exhausted quota. `public/_headers` allows `https://api.mymemory.translated.net` in CSP `connect-src` so the production browser can make this fallback request. Other hosts must preserve that allowance in their response headers. That request sends only the selected term with credentials omitted and no referrer; successful browser translations are cached in memory for one hour. Cancellation closes both requests, and quota/error responses never become Vietnamese meanings.

The popup shows Vietnamese meaning first. The original English definition is retained as optional `englishMeaning` and displayed in a native “Nghĩa tiếng Anh” disclosure, collapsed by default. Existing records and API responses without this field remain supported. If translation is unavailable, the popup explicitly reports missing Vietnamese meaning, offers “Thử dịch lại” and keeps the English definition inside the disclosure. Saving retains both meanings when available.

- [FreeDictionaryAPI.com](https://freedictionaryapi.com/) returns Wiktionary entries, IPA, meanings, examples and translations. The service requests the whole term, including multiword expressions, and uses a current sense with an example where available. US IPA is preferred, with another available IPA accepted if necessary. Source data is cached for one hour in a bounded 200-entry server cache.
- Vietnamese meanings supplied by the local study library are preserved. Otherwise, a Vietnamese translation from the dictionary sense is used. If absent, the service queries the [MyMemory translation service](https://mymemory.translated.net/) for the term. It checks response status and quota flags; service error text is never treated as a translation.
- If translation is unavailable, the original English definition is kept and explicitly labeled English. No invented Vietnamese meaning is inserted.
- Examples come from the selected dictionary sense, including quotation text when ordinary examples are absent. If neither is available, the server searches the secondary dictionary for an example of the whole word or phrase. A learner's original context can be retained if it has sentence punctuation and contains the selected term; fragments such as `track a shipment` are not substituted for sentences.
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

When checking a translation fix, verify the dialog in the running application, including the browser fallback when server translation fails. A successful direct call to MyMemory does not verify the browser's CSP or its compiled code. Servers serving `dist/client` and `dist/server` need a fresh `pnpm run build:sites` after source changes; editing `public/_headers` does not update an existing build or the hosted Site. The hosted Site also needs an explicitly requested deployment of the rebuilt version.

## Production and persistence

The existing Sites worker routes the endpoint to `scripts/vocabulary-api.mjs`. `prepare-sites-build.mjs` copies both the API handler and `vocabulary-lookup.mjs` into server output. Other hosts must provide the same endpoint; a static-only deployment cannot run the dictionary proxy. No deployment is performed by this feature.

The endpoint accepts same-origin JSON POSTs, caps request size, uses fixed provider hosts and applies a 25-second shared lookup timeout. It forwards only the term to public dictionary/translation sources, not the learner's exam context, saved history or certificate identity. Backend response caching is disabled; dictionary-source cache is independent of learner-supplied meanings and contexts. Requests are limited to 10 per client and 60 total per minute per server instance.

IndexedDB remains certificate-isolated. Pending/failed/partial cards are preserved. Background updates are transactional so deleted words are not resurrected and manual edits are not overwritten. Stored source and language metadata remain alongside the card. The legacy `source: ai` value is accepted for existing records only; no code calls a model or requires its key. Saved vocabulary remains independent of exam progress export/import/reset. Already saved cards can be read offline; internet lookup requires connectivity.
