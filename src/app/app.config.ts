import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  isDevMode,
  inject,
  provideAppInitializer,
} from '@angular/core';
import { AuthService } from './core/auth/auth.service';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAppInitializer(() => inject(AuthService).initialize()),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
