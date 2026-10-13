const dictionaryRoot = 'https://freedictionaryapi.com/api/v1/entries/en/';
function text(value, maximum = 4000) {
  return typeof value === 'string' && value.trim().length <= maximum ? value.trim() : '';
}
function englishEntries(value) {
  if (!value || !Array.isArray(value.entries)) throw new Error('Invalid dictionary response');
  return value.entries.filter((entry) => entry?.language?.code === 'en');
}
function pronunciation(entries) {
  const variants = entries
    .flatMap((entry) => (Array.isArray(entry.pronunciations) ? entry.pronunciations : []))
    .filter((variant) => variant?.type === 'ipa' && text(variant.text, 200));
  return text(
    variants.find((variant) => Array.isArray(variant.tags) && variant.tags.includes('US'))?.text ??
      variants[0]?.text,
    200,
  );
}
function senses(entries) {
  const result = [];
  function visit(items, depth = 0) {
    if (!Array.isArray(items) || depth > 5) return;
    for (const sense of items.slice(0, 30)) {
      if (!sense || typeof sense !== 'object') continue;
      const outdated =
        Array.isArray(sense.tags) &&
        sense.tags.some((tag) => ['obsolete', 'archaic'].includes(tag));
      if (text(sense.definition, 2000) && !outdated) result.push(sense);
      visit(sense.subsenses, depth + 1);
    }
  }
  for (const entry of entries.slice(0, 10)) visit(entry.senses);
  return result;
}
function example(sense) {
  const examples = Array.isArray(sense.examples) ? sense.examples : [];
  const quotes = Array.isArray(sense.quotes) ? sense.quotes.map((quote) => quote?.text) : [];
  return [...examples, ...quotes].map((value) => text(value, 500)).find(Boolean) ?? '';
}
async function dictionary(term, signal, cache) {
  const key = term.toLowerCase();
  const cached = cache?.get(key);
  if (cached && Date.now() - cached.at < 3600000) return cached.value;
  const response = await fetch(`${dictionaryRoot}${encodeURIComponent(key)}?translations=true`, {
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Dictionary HTTP ${response.status}`);
  const value = await response.json();
  englishEntries(value);
  if (cache) {
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), value });
  }
  return value;
}
async function translateTerm(term, signal, cache) {
  const key = `translation:${term.toLowerCase()}`;
  const cached = cache?.get(key);
  if (cached && Date.now() - cached.at < 3600000) return cached.value;
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', term);
  url.searchParams.set('langpair', 'en|vi');
  const timeout = AbortSignal.timeout(6000);
  const response = await fetch(url, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error(`Translation HTTP ${response.status}`);
  const value = await response.json();
  if (Number(value?.responseStatus) !== 200 || value.quotaFinished)
    throw new Error(
      `Translation unavailable: status ${value?.responseStatus}, quota exhausted ${!!value?.quotaFinished}`,
    );
  const translated = text(value.responseData?.translatedText, 2000);
  if (!translated || translated.toLowerCase() === term.toLowerCase())
    throw new Error('Translation not found');
  if (cache) {
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), value: translated });
  }
  return translated;
}
async function lookupPronunciation(term, entries, signal, secondaryEntries) {
  const ipa = pronunciation(entries);
  if (ipa) return { ipa, source: '' };
  if (secondaryEntries !== undefined) {
    const secondaryIpa = pronunciation(secondaryEntries);
    return { ipa: secondaryIpa, source: secondaryIpa ? 'Free Dictionary API' : '' };
  }
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term.toLowerCase())}`,
      { signal },
    );
    if (response.status === 404) return { ipa: '', source: '' };
    if (!response.ok) throw new Error(`Pronunciation HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Invalid pronunciation response');
    for (const entry of data) {
      const variants = Array.isArray(entry?.phonetics) ? entry.phonetics : [];
      const found =
        text(entry?.phonetic, 200) ||
        variants.map((variant) => text(variant?.text, 200)).find(Boolean);
      if (found) return { ipa: found, source: 'Free Dictionary API' };
    }
  } catch (error) {
    console.warn(
      'Pronunciation lookup incomplete',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
  return { ipa: '', source: '' };
}
async function secondaryDictionary(term, signal) {
  const timeout = AbortSignal.timeout(5000);
  const response = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term.toLowerCase())}`,
    { signal: signal ? AbortSignal.any([signal, timeout]) : timeout },
  );
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Secondary dictionary HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Invalid secondary dictionary response');
  return data.map((entry) => ({
    language: { code: 'en' },
    pronunciations: [
      entry?.phonetic,
      ...(Array.isArray(entry?.phonetics) ? entry.phonetics.map((item) => item?.text) : []),
    ].map((ipa) => ({ type: 'ipa', text: text(ipa, 200) })),
    senses: (Array.isArray(entry?.meanings) ? entry.meanings : []).flatMap((meaning) =>
      (Array.isArray(meaning?.definitions) ? meaning.definitions : []).map((definition) => ({
        definition: text(definition?.definition, 2000),
        examples: [text(definition?.example, 500)],
      })),
    ),
  }));
}
async function sentenceExample(term, signal, cache) {
  const key = `sentence:${term.toLowerCase()}`;
  const cached = cache?.get(key);
  if (cached && Date.now() - cached.at < 3600000) return cached.value;
  const url = new URL('https://api.tatoeba.org/v1/sentences');
  url.searchParams.set('lang', 'eng');
  url.searchParams.set('q', `"${term}"`);
  url.searchParams.set('sort', 'relevance');
  url.searchParams.set('limit', '20');
  url.searchParams.set('word_count', '4-20');
  url.searchParams.set('is_unapproved', 'no');
  url.searchParams.set('is_orphan', 'no');
  url.searchParams.set('license', 'CC BY 2.0 FR');
  const timeout = AbortSignal.timeout(6000);
  const response = await fetch(url, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error(`Sentence search HTTP ${response.status}`);
  const value = await response.json();
  if (!Array.isArray(value?.data)) throw new Error('Invalid sentence search response');
  const escapedTerm = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const termPattern = new RegExp(`(^|[^a-z])${escapedTerm}($|[^a-z])`);
  for (const candidate of value.data.slice(0, 20)) {
    const sentence = text(candidate?.text, 500);
    const author = text(candidate?.owner, 100);
    const normalizedSentence = sentence.toLowerCase().replace(/\s+/g, ' ');
    if (
      candidate?.lang !== 'eng' ||
      candidate?.is_unapproved !== false ||
      candidate?.license !== 'CC BY 2.0 FR' ||
      !Number.isSafeInteger(candidate?.id) ||
      candidate.id <= 0 ||
      !author ||
      sentence.split(/\s+/).length < 4 ||
      !/[.!?]["'”’)]*$/.test(sentence) ||
      !termPattern.test(normalizedSentence)
    )
      continue;
    const result = {
      example: sentence,
      exampleSource: 'Tatoeba',
      exampleSourceUrl: `https://tatoeba.org/en/sentences/show/${candidate.id}`,
      exampleAuthor: author,
    };
    if (cache) {
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(key, { at: Date.now(), value: result });
    }
    return result;
  }
  return null;
}
export async function lookupVocabulary(input, { signal, cache } = {}) {
  const term = input.term.trim().replace(/\s+/g, ' ');
  let entries = [];
  let secondaryEntries;
  let primaryError;
  let secondary = false;
  try {
    const data = await dictionary(term, signal, cache);
    if (data) entries = englishEntries(data);
  } catch (error) {
    primaryError = error;
  }
  if (!senses(entries).length) {
    secondaryEntries = await secondaryDictionary(term, signal);
    entries = secondaryEntries;
    secondary = true;
    if (!senses(entries).length && primaryError) throw primaryError;
  }
  const availableSenses = senses(entries);
  // Keep the primary sense instead of switching to a slang meaning just to obtain an example.
  const sense = availableSenses[0];
  if (!sense) return null;
  let sentence = example(sense);
  let exampleSource = '';
  if (!sentence && !secondary) {
    try {
      secondaryEntries = await secondaryDictionary(term, signal);
      const secondarySense = senses(secondaryEntries)[0];
      sentence = secondarySense ? example(secondarySense) : '';
      if (sentence) exampleSource = 'Free Dictionary API';
    } catch (error) {
      // Keep the primary definition and IPA when only example lookup fails.
      console.warn(
        'Example lookup incomplete',
        error instanceof Error ? error.message : 'Unknown dictionary error',
      );
    }
  }
  const vietnamese = Array.isArray(sense.translations)
    ? sense.translations
        .filter((translation) => translation?.language?.code === 'vi')
        .map((translation) => text(translation.word, 2000))
        .filter(Boolean)
        .join('; ')
    : '';
  let meaning = text(input.meaning, 2000) || text(vietnamese, 2000);
  let meaningLanguage = 'vi';
  let translationSource = '';
  const enrichment = [];
  if (!meaning)
    enrichment.push(
      (async () => {
        try {
          meaning = await translateTerm(term, signal, cache);
          translationSource = 'MyMemory';
        } catch (error) {
          console.warn(
            'Translation lookup incomplete',
            error instanceof Error ? error.message : 'Unknown translation error',
          );
          meaning = text(sense.definition, 2000);
          meaningLanguage = 'en';
        }
      })(),
    );
  const pronunciationResult = await lookupPronunciation(term, entries, signal, secondaryEntries);
  let ipa = pronunciationResult.ipa;
  let pronunciationSource = secondary ? 'Free Dictionary API' : pronunciationResult.source;
  let pronunciationKind = 'entry';
  const components = term.split(' ');
  if (!ipa && components.length > 1 && components.length <= 8)
    enrichment.push(
      (async () => {
        try {
          const values = await Promise.all(
            components.map(async (word) => {
              const component = await dictionary(word, signal, cache);
              return lookupPronunciation(word, component ? englishEntries(component) : [], signal);
            }),
          );
          if (values.every((value) => value.ipa)) {
            ipa = text(values.map((value) => value.ipa).join(' '), 200);
            if (values.some((value) => value.source)) pronunciationSource = 'Free Dictionary API';
            pronunciationKind = 'word-by-word';
          }
        } catch (error) {
          // Leave IPA absent rather than inventing unavailable component pronunciations.
          console.warn(
            'Phrase pronunciation lookup incomplete',
            error instanceof Error ? error.message : 'Unknown dictionary error',
          );
        }
      })(),
    );
  await Promise.all(enrichment);
  const context = text(input.context);
  const contextualExample =
    /[.!?]$/.test(context) &&
    context.split(/\s+/).length >= 4 &&
    context.toLowerCase().includes(term.toLowerCase())
      ? context
      : '';
  let corpusExample;
  if (!sentence && !contextualExample) {
    try {
      corpusExample = await sentenceExample(term, signal, cache);
    } catch (error) {
      console.warn(
        'Sentence search incomplete',
        error instanceof Error ? error.message : 'Unknown sentence search error',
      );
    }
  }
  return {
    meaning,
    englishMeaning: text(sense.definition, 2000),
    pronunciation: ipa,
    example: sentence || contextualExample,
    ...(exampleSource ? { exampleSource } : {}),
    ...(corpusExample ?? {}),
    meaningLanguage,
    pronunciationKind,
    pronunciationSource,
    translationSource,
    sourceUrl: secondary
      ? 'https://dictionaryapi.dev/'
      : `https://en.wiktionary.org/wiki/${encodeURIComponent(term.replace(/ /g, '_'))}`,
  };
}
