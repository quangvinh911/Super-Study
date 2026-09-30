import { Injectable } from '@angular/core';
import { UiPreferences } from '../models';

const STORAGE_KEY = 'ctfl-practice:ui-preferences';
const DEFAULT_PREFERENCES: UiPreferences = {
  theme: 'system',
  reducedMotion: false,
};

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

@Injectable({ providedIn: 'root' })
export class UiPreferencesRepository {
  load(): UiPreferences {
    const value = storage()?.getItem(STORAGE_KEY);
    if (!value) {
      return DEFAULT_PREFERENCES;
    }
    try {
      const parsed = JSON.parse(value) as Partial<UiPreferences>;
      return {
        theme:
          parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
            ? parsed.theme
            : DEFAULT_PREFERENCES.theme,
        reducedMotion:
          typeof parsed.reducedMotion === 'boolean'
            ? parsed.reducedMotion
            : DEFAULT_PREFERENCES.reducedMotion,
        recentCertificateId:
          typeof parsed.recentCertificateId === 'string' ? parsed.recentCertificateId : undefined,
      };
    } catch {
      return DEFAULT_PREFERENCES;
    }
  }

  save(preferences: UiPreferences): void {
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Remembering a recent certificate is optional when browser storage is unavailable.
    }
  }

  clear(): void {
    storage()?.removeItem(STORAGE_KEY);
  }
}
