import { ResolveFn, Routes } from '@angular/router';
import { CERTIFICATES } from './certificates/registry';
import { CERTIFICATE, CertificateContext } from './certificates/certificate-context';
import { CertificateShell } from './certificates/certificate-shell';
import { PROGRESS_DATABASE_NAME, ProgressRepository } from './core/persistence/progress.repository';
import { QuizSessionStore } from './core/state';
import { FavoriteVocabularyRepository } from './core/persistence/favorite-vocabulary.repository';
import { FavoriteVocabularyService } from './features/vocabulary/favorite-vocabulary.service';
import { accountGuard, adminGuard, loginDialogGuard } from './core/auth/auth.guards';
import { notesLeaveGuard } from './features/notes/notes-dialog.service';

const learningRoutes: Routes = [
  {
    path: 'notes',
    loadComponent: () => import('./features/notes/notes-page').then((m) => m.NotesPage),
  },
  {
    path: 'saved-vocabulary',
    loadComponent: () =>
      import('./features/vocabulary/saved-vocabulary-page').then((m) => m.SavedVocabularyPage),
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/home/certificate-page').then((m) => m.CertificatePage),
  },
  {
    path: 'practice',
    title: 'Luyện tập - Certiva',
    loadComponent: () =>
      import('./features/practice/practice-setup-page').then((m) => m.PracticeSetupPage),
  },
  {
    path: 'practice/:sessionId',
    title: 'Phiên luyện tập - Certiva',
    data: { layout: 'focus' },
    loadComponent: () =>
      import('./features/practice/practice-session-page').then((m) => m.PracticeSessionPage),
  },
  {
    path: 'mock-exam',
    title: 'Thi thử - Certiva',
    loadComponent: () =>
      import('./features/mock-exam/mock-exam-setup-page').then((m) => m.MockExamSetupPage),
  },
  {
    path: 'mock-exam/:sessionId',
    canActivate: [accountGuard],
    title: 'Bài thi thử - Certiva',
    data: { layout: 'focus' },
    loadComponent: () =>
      import('./features/mock-exam/mock-exam-session-page').then((m) => m.MockExamSessionPage),
  },
  {
    path: 'results/:sessionId',
    title: 'Kết quả - Certiva',
    loadComponent: () => import('./features/results/results-page').then((m) => m.ResultsPage),
  },
  {
    path: 'progress',
    title: 'Tiến độ - Certiva',
    loadComponent: () => import('./features/progress/progress-page').then((m) => m.ProgressPage),
  },
  {
    path: 'methodology',
    title: 'Phương pháp và nguồn - Certiva',
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
    path: 'login',
    title: 'Đăng nhập · Certiva',
    canActivate: [loginDialogGuard],
    children: [],
  },
  {
    path: 'admin/users',
    title: 'Quản lý user · Certiva',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/account/users-page').then((m) => m.UsersPage),
  },
  {
    path: '',
    pathMatch: 'full',
    title: 'Certiva · Chọn chứng chỉ',
    loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
  },
  ...CERTIFICATES.map((certificate) => ({
    path: `certificates/${certificate.id}`,
    component: CertificateShell,
    canDeactivate: [notesLeaveGuard],
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
      FavoriteVocabularyRepository,
      FavoriteVocabularyService,
    ],
    children: [...learningRoutes, ...(certificate.id === 'toeic' ? toeicKnowledgeRoutes : [])].map(
      (route) => ({
        ...route,
        canDeactivate: [...(route.canDeactivate ?? []), notesLeaveGuard],
        title: `${certificate.name} · Certiva`,
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
