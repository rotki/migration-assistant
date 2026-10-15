import { createI18n, type I18n } from 'vue-i18n';
import en from './locales/en.json';

/** The app's i18n instance: composition mode, so `global` is a `Composer`, not a legacy `VueI18n`. */
export type AppI18n = I18n<{ en: typeof en }, Record<string, never>, Record<string, never>, 'en', false>;

/**
 * One instance per app: vite-ssg renders each route with a fresh app, and a shared
 * instance would carry state from one render into the next.
 */
export function createAppI18n(): AppI18n {
  return createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages: { en },
  });
}
