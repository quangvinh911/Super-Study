import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService, AccountUser, parseUser } from '../../core/auth/auth.service';
import { accountError } from './account-errors';

@Component({
  selector: 'app-users-page',
  imports: [FormsModule],
  styleUrl: './account-page.scss',
  template: `<div class="page account-page">
    <header class="page-header">
      <h1>Quản lý user</h1>
      <p>Tạo tài khoản, phân quyền và đặt mật khẩu.</p>
    </header>
    <form class="account-toolbar" (ngSubmit)="load()">
      <div class="field">
        <label for="search-users">Tìm tên đăng nhập</label
        ><input id="search-users" name="search" maxlength="50" [(ngModel)]="search" />
      </div>
      <label
        ><input type="checkbox" name="deleted" [(ngModel)]="deleted" (change)="page = 1; load()" />
        Tài khoản đã xóa</label
      >
      <button class="button button--secondary" [disabled]="busy()">Tìm kiếm</button>
      <button class="button" type="button" (click)="create()" [disabled]="busy()">Thêm user</button>
    </form>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (message()) {
      <p role="status">{{ message() }}</p>
    }
    @if (editing()) {
      <form class="surface account-form" (ngSubmit)="save()">
        <h2>{{ targetId ? 'Sửa user' : 'Thêm user' }}</h2>
        <div class="field">
          <label for="edit-username">Tên đăng nhập</label
          ><input
            id="edit-username"
            name="username"
            required
            minlength="3"
            maxlength="50"
            [(ngModel)]="username"
          />
        </div>
        <div class="field">
          <label for="edit-email">Email (tùy chọn)</label
          ><input id="edit-email" name="email" type="email" maxlength="254" [(ngModel)]="email" />
        </div>
        <div class="field">
          <label for="edit-role">Quyền</label
          ><select id="edit-role" name="role" [(ngModel)]="role">
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        @if (!targetId) {
          <div class="field">
            <label for="new-password">Mật khẩu (11–128 ký tự)</label
            ><input
              id="new-password"
              name="password"
              type="password"
              autocomplete="new-password"
              required
              minlength="11"
              maxlength="128"
              [(ngModel)]="password"
            />
          </div>
        }
        <div class="account-actions">
          <button class="button" [disabled]="busy()">Lưu user</button
          ><button type="button" class="button button--secondary" (click)="editing.set(false)">
            Hủy
          </button>
        </div>
      </form>
    }
    @if (passwordUser(); as selected) {
      <form class="surface account-form" (ngSubmit)="resetPassword()">
        <h2>Đặt mật khẩu cho {{ selected.username }}</h2>
        <div class="field">
          <label for="reset-password">Mật khẩu mới (11–128 ký tự)</label
          ><input
            id="reset-password"
            name="password"
            type="password"
            autocomplete="new-password"
            required
            minlength="11"
            maxlength="128"
            [(ngModel)]="password"
          />
        </div>
        <p>Các phiên đăng nhập của user này sẽ bị thu hồi.</p>
        <div class="account-actions">
          <button class="button" [disabled]="busy()">Đặt mật khẩu</button
          ><button type="button" class="button button--secondary" (click)="passwordUser.set(null)">
            Hủy
          </button>
        </div>
      </form>
    }
    <div class="surface table-scroll">
      <table class="account-table">
        <caption>
          {{
            total()
          }}
          tài khoản
        </caption>
        <thead>
          <tr>
            <th scope="col">Tên đăng nhập</th>
            <th scope="col">Email</th>
            <th scope="col">Quyền</th>
            <th scope="col">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          @for (user of users(); track user.id) {
            <tr>
              <td>{{ user.username }}</td>
              <td>{{ user.email || '—' }}</td>
              <td>{{ user.role === 'admin' ? 'Admin' : 'User' }}</td>
              <td>
                <div class="account-actions">
                  @if (user.deletedAt) {
                    <button
                      class="button button--secondary"
                      (click)="restore(user)"
                      [disabled]="busy()"
                    >
                      Khôi phục
                    </button>
                  } @else {
                    <button
                      class="button button--secondary"
                      (click)="edit(user)"
                      [disabled]="busy()"
                    >
                      Sửa</button
                    ><button
                      class="button button--secondary"
                      (click)="choosePassword(user)"
                      [disabled]="busy()"
                    >
                      Đặt mật khẩu</button
                    ><button
                      class="button button--secondary"
                      (click)="remove(user)"
                      [disabled]="busy() || user.id === auth.user()?.id"
                    >
                      Xóa
                    </button>
                  }
                </div>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="4">Không có tài khoản phù hợp.</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <div class="account-actions">
      <button
        class="button button--secondary"
        [disabled]="busy() || page <= 1"
        (click)="page = page - 1; load()"
      >
        Trang trước</button
      ><span>Trang {{ page }}</span
      ><button
        class="button button--secondary"
        [disabled]="busy() || page * 25 >= total()"
        (click)="page = page + 1; load()"
      >
        Trang sau
      </button>
    </div>
  </div>`,
})
export class UsersPage {
  protected readonly auth = inject(AuthService);
  protected readonly users = signal<readonly AccountUser[]>([]);
  protected readonly total = signal(0);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly editing = signal(false);
  protected readonly passwordUser = signal<AccountUser | null>(null);
  protected search = '';
  protected deleted = false;
  protected page = 1;
  protected targetId = '';
  protected username = '';
  protected email = '';
  protected role: 'admin' | 'user' = 'user';
  protected password = '';
  constructor() {
    void this.load();
  }
  protected async load(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const value = await this.auth.request(
        `/api/admin/users?search=${encodeURIComponent(this.search)}&deleted=${this.deleted}&page=${this.page}`,
      );
      if (
        typeof value !== 'object' ||
        value === null ||
        !('users' in value) ||
        !Array.isArray(value.users) ||
        !('total' in value) ||
        typeof value.total !== 'number'
      )
        throw new Error('Invalid users response');
      this.users.set(value.users.map(parseUser));
      this.total.set(value.total);
    } catch (error) {
      this.error.set(accountError(error));
    } finally {
      this.busy.set(false);
    }
  }
  protected create(): void {
    this.targetId = '';
    this.username = '';
    this.email = '';
    this.role = 'user';
    this.password = '';
    this.editing.set(true);
    this.passwordUser.set(null);
  }
  protected edit(user: AccountUser): void {
    this.targetId = user.id;
    this.username = user.username;
    this.email = user.email || '';
    this.role = user.role;
    this.editing.set(true);
    this.passwordUser.set(null);
  }
  protected choosePassword(user: AccountUser): void {
    this.password = '';
    this.passwordUser.set(user);
    this.editing.set(false);
  }
  protected async save(): Promise<void> {
    await this.mutate(
      this.targetId ? `/api/admin/users/${this.targetId}` : '/api/admin/users',
      this.targetId ? 'PATCH' : 'POST',
      {
        username: this.username,
        email: this.email,
        role: this.role,
        ...(!this.targetId ? { password: this.password } : {}),
      },
    );
  }
  protected async resetPassword(): Promise<void> {
    const user = this.passwordUser();
    if (user)
      await this.mutate(`/api/admin/users/${user.id}/password`, 'POST', {
        password: this.password,
      });
  }
  protected async remove(user: AccountUser): Promise<void> {
    if (
      globalThis.confirm(
        `Xóa tài khoản ${user.username}? User sẽ mất quyền đăng nhập; dữ liệu học vẫn được giữ để khôi phục.`,
      )
    )
      await this.mutate(`/api/admin/users/${user.id}`, 'DELETE');
  }
  protected async restore(user: AccountUser): Promise<void> {
    await this.mutate(`/api/admin/users/${user.id}/restore`, 'POST', {});
  }
  private async mutate(path: string, method: string, body?: unknown): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await this.auth.request(path, {
        method,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      this.password = '';
      this.editing.set(false);
      this.passwordUser.set(null);
      this.message.set('Đã cập nhật tài khoản.');
    } catch (error) {
      this.error.set(accountError(error));
      return;
    } finally {
      this.busy.set(false);
    }
    await this.load();
  }
}
