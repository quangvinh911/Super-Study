import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

const user = {
  id: 'u1',
  username: 'learner',
  email: null,
  role: 'user',
  deletedAt: null,
  createdAt: '2026-10-04',
  updatedAt: '2026-10-04',
};
const services: AuthService[] = [];
function service() {
  const value = new AuthService();
  services.push(value);
  return value;
}
const reply = (body: unknown, status = 200) => Response.json(body, { status });
afterEach(() => {
  for (const value of services.splice(0)) value.ngOnDestroy();
  vi.unstubAllGlobals();
});
describe('AuthService', () => {
  it('reauthenticates the same account before flushing a save that needs a fresh token', async () => {
    let logins = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init: RequestInit) => {
        if (path.endsWith('/login'))
          return reply({ user, accessToken: ++logins === 1 ? 'expired' : 'fresh' });
        if ((init.headers as Record<string, string>)['Authorization'] === 'Bearer fresh')
          return reply({ ok: true });
        return reply({ error: 'invalid_session' }, 401);
      }),
    );
    const auth = service();
    await auth.login('learner', 'example-password');
    const flush = vi.fn(() => auth.request('/api/pending').then(() => undefined));
    auth.registerBeforeChange(flush);
    await auth.login('learner', 'replacement-password');
    expect(flush).toHaveBeenCalledOnce();
    expect(auth.user()?.id).toBe(user.id);
  });
  it('refreshes once for concurrent expired requests', async () => {
    let refreshCalls = 0;
    let expiredCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init: RequestInit) => {
        if (path.endsWith('/login')) return reply({ user, accessToken: 'expired' });
        if (path.endsWith('/refresh')) {
          refreshCalls++;
          await Promise.resolve();
          return reply({ user, accessToken: 'renewed' });
        }
        if ((init.headers as Record<string, string>)['Authorization'] === 'Bearer expired') {
          expiredCalls++;
          return reply({ error: 'invalid_session' }, 401);
        }
        return reply({ ok: true });
      }),
    );
    const auth = service();
    await auth.login('learner', 'example-password');
    await Promise.all([auth.request('/api/example'), auth.request('/api/example')]);
    expect(expiredCalls).toBe(2);
    expect(refreshCalls).toBe(1);
  });
  it('rejects a response arriving after logout and clears account state', async () => {
    let finish: ((value: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path.endsWith('/login')) return reply({ user, accessToken: 'token' });
        if (path.endsWith('/logout')) return reply({ ok: true });
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }),
    );
    const auth = service();
    await auth.login('learner', 'example-password');
    const pending = auth.request('/api/slow');
    const rejection = expect(pending).rejects.toMatchObject({ code: 'account_changed' });
    await auth.logout();
    finish?.(reply({ private: 'old-account' }));
    await rejection;
    expect(auth.user()).toBeNull();
  });
  it('retains account identity on network failure instead of falling back to guests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path.endsWith('/login')) return reply({ user, accessToken: 'token' });
        throw new TypeError('offline');
      }),
    );
    const auth = service();
    await auth.login('learner', 'example-password');
    await expect(
      auth.request('/api/learning/ctfl', { method: 'POST', body: '{}' }),
    ).rejects.toThrow('offline');
    expect(auth.user()?.id).toBe('u1');
  });
});
