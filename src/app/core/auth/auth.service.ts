import { Injectable, OnDestroy, signal } from '@angular/core';

export interface AccountUser {
  readonly id: string;
  readonly username: string;
  readonly email: string | null;
  readonly role: 'admin' | 'user';
  readonly deletedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export class AccountApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}
export function parseUser(value: unknown): AccountUser {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid account response');
  const user = value as Record<string, unknown>;
  if (
    typeof user['id'] !== 'string' ||
    typeof user['username'] !== 'string' ||
    !(user['email'] === null || typeof user['email'] === 'string') ||
    !['admin', 'user'].includes(String(user['role'])) ||
    !(user['deletedAt'] === null || typeof user['deletedAt'] === 'string') ||
    typeof user['createdAt'] !== 'string' ||
    typeof user['updatedAt'] !== 'string'
  ) {
    throw new Error('Invalid account response');
  }
  return {
    id: user['id'],
    username: user['username'],
    email: user['email'],
    role: user['role'] === 'admin' ? 'admin' : 'user',
    deletedAt: user['deletedAt'],
    createdAt: user['createdAt'],
    updatedAt: user['updatedAt'],
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  readonly user = signal<AccountUser | null>(null);
  readonly error = signal('');
  private token: string | null = null;
  private refreshPromise?: Promise<void>;
  private initialized?: Promise<void>;
  private readonly beforeChange = new Set<() => Promise<void>>();
  private readonly controllers = new Set<AbortController>();
  private readonly channel =
    typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined'
      ? null
      : new window.BroadcastChannel('certificate-account');
  private epoch = 0;

  constructor() {
    if (this.channel)
      this.channel.onmessage = () => {
        void this.externalChange().catch(() =>
          this.error.set('Không thể cập nhật tài khoản. Hãy tải lại trang.'),
        );
      };
  }
  ngOnDestroy(): void {
    this.channel?.close();
    for (const controller of this.controllers) controller.abort();
  }
  initialize(): Promise<void> {
    this.initialized ??= this.refresh().catch((error: unknown) => {
      if (error instanceof AccountApiError && [401, 404].includes(error.status)) return;
      // Existing guests remain usable; never replace an authenticated account on a network failure.
      this.error.set('Dịch vụ tài khoản chưa khả dụng. Bạn vẫn có thể học ở chế độ khách.');
    });
    return this.initialized;
  }
  registerBeforeChange(callback: () => Promise<void>): () => void {
    this.beforeChange.add(callback);
    return () => this.beforeChange.delete(callback);
  }
  private async detach(): Promise<void> {
    for (const callback of this.beforeChange) await callback();
    this.epoch++;
    for (const controller of this.controllers) controller.abort();
  }
  private async externalChange(): Promise<void> {
    await this.detach();
    this.token = null;
    this.user.set(null);
    try {
      await this.refresh();
    } catch (error) {
      if (!(error instanceof AccountApiError && error.status === 401)) throw error;
    }
    // Recreate route-scoped stores and component data, without transferring guest data.
    globalThis.location?.reload();
  }
  async login(username: string, password: string): Promise<void> {
    const value = await this.raw('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (typeof value !== 'object' || value === null || !('user' in value))
      throw new Error('Invalid login response');
    const nextUser = parseUser(value.user);
    // A fresh token for the same account lets pending saves recover after revocation.
    // Changing accounts still flushes the previous account before installing the new identity.
    if (this.user()?.id === nextUser.id) this.install(value);
    await this.detach();
    this.install(value);
    this.error.set('');
    this.channel?.postMessage('changed');
  }
  async logout(): Promise<void> {
    await this.detach();
    await this.request('/api/auth/logout', { method: 'POST', body: '{}' });
    this.token = null;
    this.user.set(null);
    this.channel?.postMessage('changed');
  }
  private install(value: unknown): void {
    if (typeof value !== 'object' || value === null) throw new Error('Invalid login response');
    const response = value as Record<string, unknown>;
    if (typeof response['accessToken'] !== 'string') throw new Error('Invalid access token');
    const user = parseUser(response['user']);
    this.token = response['accessToken'];
    this.user.set(user);
  }
  private refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    const run = async () => {
      const epoch = this.epoch;
      const previous = this.user()?.id;
      const value = await this.raw('/api/auth/refresh', { method: 'POST', body: '{}' });
      const parsed =
        typeof value === 'object' && value !== null
          ? parseUser((value as Record<string, unknown>)['user'])
          : null;
      if (!parsed || epoch !== this.epoch || (previous && previous !== parsed.id))
        throw new AccountApiError('account_changed', 401);
      this.install(value);
    };
    this.refreshPromise = (
      typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request('certificate-refresh', run)
        : run()
    ).finally(() => {
      this.refreshPromise = undefined;
    });
    return this.refreshPromise;
  }
  async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const owner = this.user()?.id;
    const epoch = this.epoch;
    if (!owner || !this.token) throw new AccountApiError('login_required', 401);
    const send = () =>
      this.raw(path, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${this.token}` },
      });
    let value: unknown;
    try {
      value = await send();
    } catch (error) {
      if (!(error instanceof AccountApiError && error.status === 401)) throw error;
      try {
        await this.refresh();
      } catch (refreshError) {
        if (refreshError instanceof AccountApiError && refreshError.status === 401) {
          // Do not redirect failed account writes into IndexedDB.
          this.token = null;
          this.error.set('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
        }
        throw refreshError;
      }
      if (epoch !== this.epoch || owner !== this.user()?.id)
        throw new AccountApiError('account_changed', 409);
      value = await send();
    }
    if (epoch !== this.epoch || owner !== this.user()?.id)
      throw new AccountApiError('account_changed', 409);
    return value;
  }
  private async raw(path: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init.headers },
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.headers.get('Content-Type')?.includes('application/json'))
        throw new AccountApiError('service_unavailable', response.status);
      const value: unknown = await response.json();
      if (!response.ok) {
        const code =
          typeof value === 'object' &&
          value !== null &&
          'error' in value &&
          typeof value.error === 'string'
            ? value.error
            : 'request_failed';
        throw new AccountApiError(code, response.status);
      }
      return value;
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }
}
