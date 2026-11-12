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
        if (new Headers(init.headers).get('Authorization') === 'Bearer fresh')
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
        if (new Headers(init.headers).get('Authorization') === 'Bearer expired') {
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
  it('refreshes authentication for binary requests and returns the response bytes', async () => {
    const fetch = vi.fn(async (path: string, init: RequestInit) => {
      if (path.endsWith('/login')) return reply({ user, accessToken: 'expired' });
      if (path.endsWith('/refresh')) return reply({ user, accessToken: 'renewed' });
      const token = new Headers(init.headers).get('Authorization');
      if (token === 'Bearer expired') return reply({ error: 'invalid_session' }, 401);
      expect(token).toBe('Bearer renewed');
      expect(init.cache).toBe('no-store');
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'video/mp4' } });
    });
    vi.stubGlobal('fetch', fetch);
    const auth = service();
    await auth.login('learner', 'example-password');
    const blob = await auth.requestBlob('/api/notes/media/file');
    expect(blob.type).toBe('video/mp4');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetch.mock.calls.filter(([path]) => path.endsWith('/refresh'))).toHaveLength(1);
  });
  it('propagates cancellation from the caller to the attachment fetch', async () => {
    const fetch = vi.fn(async (path: string, init: RequestInit) => {
      if (path.endsWith('/login')) return reply({ user, accessToken: 'token' });
      const signal = init.signal;
      if (!signal) throw new Error('Missing request signal');
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    vi.stubGlobal('fetch', fetch);
    const auth = service();
    await auth.login('learner', 'example-password');
    const cancel = new AbortController();
    const pending = auth.requestBlob('/api/notes/media/file', { signal: cancel.signal });
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    cancel.abort();
    await rejection;
    expect(auth.user()?.id).toBe(user.id);
  });
});
