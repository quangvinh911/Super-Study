export const MEDIA_ROOTS = [
  'audio',
  'pdf-evidence',
  'media',
  'images',
  'documents',
  'video',
  'videos',
];
export const MEDIA_TYPES = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export function mediaType(key) {
  const segments = key.split('/');
  if (
    !MEDIA_ROOTS.includes(segments[0]) ||
    segments.length < 2 ||
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    /[\\\u0000-\u001f]/.test(key)
  )
    return null;
  const extension = key.split('.').at(-1).toLowerCase();
  return Object.hasOwn(MEDIA_TYPES, extension) ? MEDIA_TYPES[extension] : null;
}
