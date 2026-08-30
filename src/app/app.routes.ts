import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'CTFL Practice - Trang chủ',
    loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
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
    loadComponent: () =>
      import('./features/mock-exam/mock-exam-session-page').then(
        (m) => m.MockExamSessionPage,
      ),
  },
  {
    path: 'results/:sessionId',
    title: 'Kết quả - CTFL Practice',
    loadComponent: () =>
      import('./features/results/results-page').then((m) => m.ResultsPage),
  },
  {
    path: 'progress',
    title: 'Tiến độ - CTFL Practice',
    loadComponent: () =>
      import('./features/progress/progress-page').then((m) => m.ProgressPage),
  },
  {
    path: 'methodology',
    title: 'Phương pháp và nguồn - CTFL Practice',
    loadComponent: () =>
      import('./features/methodology/methodology-page').then((m) => m.MethodologyPage),
  },
  { path: '**', redirectTo: '' },
];
