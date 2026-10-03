import { CertificateDefinition } from '../core/models/certificate.models';

/** Adding a certificate does not require new practice, results or persistence pages. */
export const CERTIFICATES: readonly CertificateDefinition[] = [
  {
    id: 'ctfl',
    name: 'CTFL',
    subtitle: 'ISTQB Foundation Level · v4.0.1',
    description: 'Luyện kiến thức kiểm thử theo chapter, Learning Objective và K-level.',
    catalogGroup: 'professional',
    catalogHighlights: ['Luyện theo Chapter', 'Thi thử CTFL'],
    taxonomy: 'syllabus',
    banks: [
      {
        id: 'original',
        label: 'Câu viết mới',
        description: 'Câu hỏi theo syllabus CTFL',
        manifestUrl: '/data/manifest.json',
      },
      {
        id: 'pdf',
        label: 'Nguồn PDF',
        description: 'Câu hỏi kèm ảnh bằng chứng từ tài liệu',
        manifestUrl: '/data/pdf-manifest.json',
      },
    ],
    exam: {
      id: 'ctfl-foundation',
      label: 'CTFL Foundation',
      questionCount: 40,
      durations: [60, 75],
      generation: 'ctflBlueprint',
      scoring: { kind: 'threshold', passPercent: 65 },
    },
    references: [
      {
        title: 'ISTQB CTFL',
        url: 'https://istqb.org/certifications/certified-tester-foundation-level-ctfl-v4-0/',
      },
    ],
  },
  {
    id: 'toeic',
    name: 'TOEIC',
    subtitle: 'Listening & Reading',
    description: 'Luyện TOEIC Listening và Reading theo từng Part với ngân hàng Hacker 3.',
    catalogGroup: 'language',
    catalogHighlights: ['Ngữ pháp', 'Luyện Listening & Reading', 'Thi thử TOEIC'],
    learningResources: [
      {
        label: 'Ngữ pháp',
        path: 'grammar',
        description: '16 bài học, ví dụ công việc và câu tự kiểm tra cho Part 5–6.',
      },
      {
        label: 'Từ vựng',
        path: 'vocabulary',
        description: 'Từ vựng, thành ngữ và cụm từ theo từng bộ tài liệu TOEIC.',
      },
    ],
    taxonomy: 'sections',
    banks: [
      {
        id: 'hacker',
        label: 'Hacker TOEIC',
        description: '1.980 câu · 9 đề đủ Listening & Reading; Test 4 luyện tập 180 câu',
        manifestUrl: '/data/toeic/hacker-manifest.json',
      },
      {
        id: 'jimmy',
        label: 'Jim’s TOEIC (Jimmy)',
        description: '977 câu Reading · Part 5–7',
        manifestUrl: '/data/toeic/jimmy-manifest.json',
      },
    ],
    exam: {
      id: 'toeic-listening-reading',
      label: 'TOEIC Listening & Reading',
      questionCount: 200,
      durations: [120],
      generation: 'sections',
      scoring: { kind: 'raw' },
      sections: [
        {
          id: 'listening',
          label: 'Listening',
          durationMinutes: 45,
          parts: [
            { id: 'part-1', label: 'Part 1 · Photographs', count: 6 },
            { id: 'part-2', label: 'Part 2 · Question–Response', count: 25 },
            { id: 'part-3', label: 'Part 3 · Conversations', count: 39 },
            { id: 'part-4', label: 'Part 4 · Talks', count: 30 },
          ],
        },
        {
          id: 'reading',
          label: 'Reading',
          durationMinutes: 75,
          parts: [
            { id: 'part-5', label: 'Part 5 · Incomplete Sentences', count: 30 },
            { id: 'part-6', label: 'Part 6 · Text Completion', count: 16 },
            { id: 'part-7', label: 'Part 7 · Reading Comprehension', count: 54 },
          ],
        },
      ],
    },
    references: [
      {
        title: 'ETS · TOEIC Listening & Reading',
        url: 'https://www.ets.org/toeic/about/listening-reading.html',
      },
      {
        title: 'ETS · Examinee handbook',
        url: 'https://www.ets.org/content/dam/ets-org/fr/pdfs/toeic/toeic-listening-reading-test-examinee-handbook.pdf',
      },
    ],
  },
];

export function findCertificate(id: string): CertificateDefinition | undefined {
  return CERTIFICATES.find((certificate) => certificate.id === id);
}

export const CTFL = CERTIFICATES[0]!;
