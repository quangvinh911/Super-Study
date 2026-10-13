import 'fake-indexeddb/auto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { ProgressRepository } from '../persistence/progress.repository';
import { QuizSessionStore } from '../state/quiz-session.store';
import { toeicFixture } from '../testing/toeic-fixture';
import { findCertificate } from '../../certificates/registry';
import { safeReturnUrl } from './login-dialog.service';

const auth = new AuthService();
afterAll(() => auth.ngOnDestroy());
const certificate = (() => {
  const value = findCertificate('toeic');
  if (!value) throw new Error('TOEIC fixture is missing');
  return value;
})();
const repositories: ProgressRepository[] = [];
const stores: QuizSessionStore[] = [];
function setup() {
  const repository = new ProgressRepository(`guest-policy-${crypto.randomUUID()}`, certificate);
  const store = new QuizSessionStore(repository, auth);
  repositories.push(repository);
  stores.push(store);
  return { repository, store };
}
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const repository of repositories.splice(0)) repository.close();
  auth.user.set(null);
});
describe('guest access policy', () => {
  it('caps each guest session at ten even when callers request more', async () => {
    const { store } = setup();
    const bank = toeicFixture('guest-bank');
    for (const questionLimit of [80, 200]) {
      const snapshot = await store.startPractice({
        certificateId: 'toeic',
        bankVersion: 'test',
        ...bank,
        config: { questionLimit },
      });
      expect(snapshot.questions).toHaveLength(10);
    }
  });
  it('denies starting/restoring exams and restoring oversized old guest sessions', async () => {
    const { store, repository } = setup();
    const bank = toeicFixture('guest-bank');
    await expect(
      store.startExam({
        certificateId: 'toeic',
        bankVersion: 'test',
        ...bank,
        examDefinition: certificate.exam,
        durationMinutes: 120,
        generation: 'blueprint',
      }),
    ).rejects.toMatchObject({ code: 'login_required' });
    const unrestricted = new QuizSessionStore(repository);
    stores.push(unrestricted);
    const snapshot = await unrestricted.startPractice({
      certificateId: 'toeic',
      bankVersion: 'test',
      ...bank,
      config: { questionLimit: 20 },
    });
    await unrestricted.close();
    await expect(store.restore(snapshot.id)).rejects.toMatchObject({
      code: 'guest_practice_limit',
    });
    expect(await repository.getActiveSession(snapshot.id)).toBeDefined();
  });
  it('does not cap logged-in learners', async () => {
    auth.user.set({
      id: 'account-test',
      username: 'learner',
      email: null,
      role: 'user',
      deletedAt: null,
      createdAt: '2026-10-04',
      updatedAt: '2026-10-04',
    });
    const { store } = setup();
    const bank = toeicFixture('account-bank');
    const snapshot = await store.startPractice({
      certificateId: 'toeic',
      bankVersion: 'test',
      ...bank,
      config: { questionLimit: 20 },
    });
    expect(snapshot.questions).toHaveLength(20);
  });
  it('keeps login redirects on safe internal paths', () => {
    for (const value of [
      '//evil.example',
      '/\\evil.example',
      'https://evil.example',
      '/login?returnUrl=/login',
      null,
    ])
      expect(safeReturnUrl(value)).toBe('/');
    expect(safeReturnUrl('/certificates/toeic/mock-exam?source=hacker')).toBe(
      '/certificates/toeic/mock-exam?source=hacker',
    );
  });
});
