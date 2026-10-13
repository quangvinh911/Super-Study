import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { accountError } from './account-errors';
import { LoginDialogService } from '../../core/auth/login-dialog.service';

@Component({
  selector: 'app-login-dialog',
  imports: [FormsModule],
  styleUrls: ['./account-page.scss', './login-dialog.scss'],
  template: `<dialog
    #dialog
    aria-labelledby="login-title"
    aria-describedby="login-description"
    (cancel)="cancel($event)"
  >
    <header class="page-header">
      <h2 id="login-title">Đăng nhập</h2>
      <button
        class="close-button"
        type="button"
        aria-label="Đóng đăng nhập"
        [disabled]="busy()"
        (click)="close()"
      >
        ×
      </button>
      <p id="login-description">Đăng nhập để thi thử và lưu dữ liệu học theo tài khoản.</p>
    </header>
    <form class="surface account-form" (ngSubmit)="login()">
      <div class="field">
        <label for="username">Tên đăng nhập</label
        ><input
          id="username"
          name="username"
          autocomplete="username"
          autofocus
          [disabled]="busy()"
          required
          maxlength="50"
          [(ngModel)]="username"
        />
      </div>
      <div class="field">
        <label for="password">Mật khẩu</label
        ><input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          [disabled]="busy()"
          required
          maxlength="128"
          [(ngModel)]="password"
        />
      </div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <button class="button" [disabled]="busy() || !username.trim() || !password">
        {{ busy() ? 'Đang đăng nhập…' : 'Đăng nhập' }}
      </button>
      <p>Tài khoản do Admin cấp. Liên hệ Admin nếu bạn cần đặt lại mật khẩu.</p>
      <button class="button button--secondary" type="button" [disabled]="busy()" (click)="close()">
        Tiếp tục học ở chế độ khách
      </button>
    </form>
  </dialog>`,
})
export class LoginDialog {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  protected username = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  constructor() {
    effect(() => {
      const element = this.dialog()?.nativeElement;
      if (!element) return;
      if (this.loginDialog.visible()) {
        if (!element.open) element.showModal();
      } else {
        if (element.open) element.close();
        this.username = '';
        this.password = '';
        this.error.set('');
      }
    });
  }
  protected cancel(event: Event): void {
    event.preventDefault();
    this.close();
  }
  protected close(): void {
    if (!this.busy()) this.loginDialog.close();
  }
  protected async login(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.username, this.password);
      this.password = '';
      const destination = this.loginDialog.returnUrl(this.router.url);
      this.loginDialog.close();
      // Reload route-owned data for the new account; guest data remains separate.
      globalThis.location.assign(destination);
    } catch (error) {
      this.error.set(accountError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
