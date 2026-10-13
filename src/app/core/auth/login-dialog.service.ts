import { Injectable, signal } from '@angular/core';
export function safeReturnUrl(value: string | null): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\r\n]/.test(value) ||
    value.startsWith('/login')
  )
    return '/';
  return value;
}
@Injectable({ providedIn: 'root' })
export class LoginDialogService {
  readonly visible = signal(false);
  private destination: string | null = null;
  open(returnUrl: string | null = null): void {
    this.destination = returnUrl === null ? null : safeReturnUrl(returnUrl);
    this.visible.set(true);
  }
  returnUrl(currentUrl: string): string {
    return this.destination ?? safeReturnUrl(currentUrl);
  }
  close(): void {
    this.visible.set(false);
    this.destination = null;
  }
}
