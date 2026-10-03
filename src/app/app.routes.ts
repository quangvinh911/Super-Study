import { ResolveFn, Routes } from '@angular/router';
import { CERTIFICATES } from './certificates/registry';
import { CERTIFICATE, CertificateContext } from './certificates/certificate-context';
import { CertificateShell } from './certificates/certificate-shell';
import { PROGRESS_DATABASE_NAME, ProgressRepository } from './core/persistence/progress.repository';
import { QuizSessionStore } from './core/state';

const learningRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/home/certificate-page').then((m) => m.CertificatePage),
  },
  {
    path: 'practice',
    title: 'Luyện tập - CTFL Practice',
    loadComponent: () =>
      import('./features/practice/practice-setup-page').then((m) => m.PracticeSetupPage),
  },
  {
    path: 'practice/:sessionId',
    title: 'Phiên luyện tập - CTFL Practice',
    data: { layout: 'focus' },
    loadComponent: () =>
      import('./features/practice/practice-session-page').then((m) => m.PracticeSessionPage),
  },
  {
    path: 'mock-exam',
    title: 'Thi thử - CTFL Practice',
    loadComponent: () =>
      import('./features/mock-exam/mock-exam-setup-page').then((m) => m.MockExamSetupPage),
  },
  {
    path: 'mock-exam/:sessionId',
    title: 'Bài thi thử - CTFL Practice',
    data: { layout: 'focus' },
    loadComponent: () =>
      import('./features/mock-exam/mock-exam-session-page').then((m) => m.MockExamSessionPage),
  },
  {
    path: 'results/:sessionId',
    title: 'Kết quả - CTFL Practice',
    loadComponent: () => import('./features/results/results-page').then((m) => m.ResultsPage),
  },
  {
    path: 'progress',
    title: 'Tiến độ - CTFL Practice',
    loadComponent: () => import('./features/progress/progress-page').then((m) => m.ProgressPage),
  },
  {
    path: 'methodology',
    title: 'Phương pháp và nguồn - CTFL Practice',
    loadComponent: () =>
      import('./features/methodology/methodology-page').then((m) => m.MethodologyPage),
  },
];

const toeicKnowledgeRoutes: Routes = [
  {
    path: 'vocabulary',
    loadComponent: () =>
      import('./features/vocabulary/vocabulary-overview-page').then(
        (m) => m.VocabularyOverviewPage,
      ),
  },
  {
    path: 'vocabulary/:collectionId',
    resolve: {
      breadcrumb: (async (route) => {
        const { VOCABULARY_COLLECTIONS } = await import('./features/vocabulary/vocabulary-data');
        return (
          VOCABULARY_COLLECTIONS.find(
            (collection) => collection.id === route.paramMap.get('collectionId'),
          )?.title ?? 'Bộ từ vựng'
        );
      }) satisfies ResolveFn<string>,
    },
    loadComponent: () =>
      import('./features/vocabulary/vocabulary-collection-page').then(
        (m) => m.VocabularyCollectionPage,
      ),
  },
  {
    path: 'grammar',
    loadComponent: () =>
      import('./features/grammar/grammar-overview-page').then((m) => m.GrammarOverviewPage),
  },
  {
    path: 'grammar/:slug',
    resolve: {
      breadcrumb: (async (route) => {
        const { GRAMMAR_LESSONS } = await import('./features/grammar/grammar-lessons');
        return (
          GRAMMAR_LESSONS.find((lesson) => lesson.slug === route.paramMap.get('slug'))?.title ??
          'Bài học'
        );
      }) satisfies ResolveFn<string>,
    },
    loadComponent: () =>
      import('./features/grammar/grammar-lesson-page').then((m) => m.GrammarLessonPage),
  },
];

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Certificate Practice · Chọn chứng chỉ',
    loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
  },
  ...CERTIFICATES.map((certificate) => ({
    path: `certificates/${certificate.id}`,
    component: CertificateShell,
    providers: [
      { provide: CERTIFICATE, useValue: certificate },
      {
        provide: PROGRESS_DATABASE_NAME,
        useValue:
          certificate.id === 'ctfl' ? 'ctfl-practice' : `certificate-practice:${certificate.id}`,
      },
      CertificateContext,
      ProgressRepository,
      QuizSessionStore,
    ],
    children: [...learningRoutes, ...(certificate.id === 'toeic' ? toeicKnowledgeRoutes : [])].map(
      (route) => ({
        ...route,
        title: `${certificate.name} · Certificate Practice`,
      }),
    ),
  })),
  // Preserve old CTFL bookmarks and session links.
  ...[
    'practice/:sessionId',
    'mock-exam/:sessionId',
    'results/:sessionId',
    'practice',
    'mock-exam',
    'progress',
    'methodology',
  ].map((path) => ({
    path,
    pathMatch: 'full' as const,
    redirectTo: `certificates/ctfl/${path}`,
  })),
  { path: '**', redirectTo: '' },
];
