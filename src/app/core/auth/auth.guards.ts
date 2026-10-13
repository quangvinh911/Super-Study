import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { LoginDialogService } from './login-dialog.service';

export const accountGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const loginDialog = inject(LoginDialogService);
  await auth.initialize();
  if (auth.user()) return true;
  loginDialog.open(state.url);
  return false;
};
export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const loginDialog = inject(LoginDialogService);
  await auth.initialize();
  if (!auth.user()) {
    loginDialog.open(state.url);
    return false;
  }
  return auth.user()?.role === 'admin' ? true : router.createUrlTree(['/']);
};

export const loginDialogGuard: CanActivateFn = (route) => {
  inject(LoginDialogService).open(route.queryParamMap.get('returnUrl') ?? '/');
  return inject(Router).createUrlTree(['/']);
};
