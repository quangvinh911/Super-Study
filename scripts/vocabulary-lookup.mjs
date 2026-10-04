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
  return Array.isArray(sense.examples)
    ? (sense.examples.map((value) => text(value, 500)).find(Boolean) ?? '')
    : '';
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
async function translateTerm(term, signal) {
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', term);
  url.searchParams.set('langpair', 'en|vi');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Translation HTTP ${response.status}`);
  const value = await response.json();
  if (Number(value?.responseStatus) !== 200 || value.quotaFinished)
    throw new Error('Translation unavailable');
  const translated = text(value.responseData?.translatedText, 2000);
  if (!translated || translated.toLowerCase() === term.toLowerCase())
    throw new Error('Translation not found');
  return translated;
}
async function lookupPronunciation(term, entries, signal) {
  const ipa = pronunciation(entries);
  if (ipa) return { ipa, source: '' };
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
  const response = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term.toLowerCase())}`,
    { signal },
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
export async function lookupVocabulary(input, { signal, cache } = {}) {
  const term = input.term.trim().replace(/\s+/g, ' ');
  let entries = [];
  let primaryError;
  let secondary = false;
  try {
    const data = await dictionary(term, signal, cache);
    if (data) entries = englishEntries(data);
  } catch (error) {
    primaryError = error;
  }
  if (!senses(entries).length) {
    entries = await secondaryDictionary(term, signal);
    secondary = true;
    if (!senses(entries).length && primaryError) throw primaryError;
  }
  const availableSenses = senses(entries);
  const sense = availableSenses.find((item) => example(item)) ?? availableSenses[0];
  if (!sense) return null;
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
  const pronunciationResult = await lookupPronunciation(term, entries, signal);
  let ipa = pronunciationResult.ipa;
  let pronunciationSource = secondary ? 'Free Dictionary API' : pronunciationResult.source;
  let pronunciationKind = 'entry';
  const components = term.split(' ');
  const enrichment = [];
  if (!meaning)
    enrichment.push(
      (async () => {
        try {
          meaning = await translateTerm(term, signal);
          translationSource = 'MyMemory';
        } catch {
          // Preserve a real English definition, labeled clearly, when translation is unavailable.
          meaning = text(sense.definition, 2000);
          meaningLanguage = 'en';
        }
      })(),
    );
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
  const sentence = example(sense);
  const context = text(input.context);
  const contextualExample =
    /[.!?]$/.test(context) &&
    context.split(/\s+/).length >= 4 &&
    context.toLowerCase().includes(term.toLowerCase())
      ? context
      : '';
  return {
    meaning,
    pronunciation: ipa,
    example: sentence || contextualExample,
    meaningLanguage,
    pronunciationKind,
    pronunciationSource,
    translationSource,
    sourceUrl: secondary
      ? 'https://dictionaryapi.dev/'
      : `https://en.wiktionary.org/wiki/${encodeURIComponent(term.replace(/ /g, '_'))}`,
  };
}
