import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en/translation.json';
import ar from './locales/ar/translation.json';
import es from './locales/es/translation.json';
import pt from './locales/pt/translation.json';
import ru from './locales/ru/translation.json';

export const SUPPORTED_LANGUAGES = ['en', 'ar', 'es', 'pt', 'ru'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANG_STORAGE_KEY = 'opdesk-lang';

declare global {
  interface Window {
    __OPDESK_DEFAULT_LOCALE__?: string;
  }
}

/** Normalize a locale tag to a supported language code, or null if unsupported. */
export function normalizeLanguage(lang: string | null | undefined): SupportedLanguage | null {
  if (!lang) return null;
  const base = lang.trim().toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base)
    ? (base as SupportedLanguage)
    : null;
}

function getStoredLanguage(): SupportedLanguage | null {
  try {
    return normalizeLanguage(localStorage.getItem(LANG_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Server-injected default from index.html (production) or undefined in Vite dev. */
function getInjectedDefaultLanguage(): SupportedLanguage | null {
  if (typeof window === 'undefined') return null;
  return normalizeLanguage(window.__OPDESK_DEFAULT_LOCALE__);
}

function applyDocumentLanguage(lang: string) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

const initialLang =
  getStoredLanguage() || getInjectedDefaultLanguage() || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
      es: { translation: es },
      pt: { translation: pt },
      ru: { translation: ru },
    },
    lng: initialLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

/** Persist language choice and update document direction */
export function setLanguage(lang: string) {
  const normalized = normalizeLanguage(lang) || 'en';
  i18n.changeLanguage(normalized);
  localStorage.setItem(LANG_STORAGE_KEY, normalized);
  applyDocumentLanguage(normalized);
}

/**
 * When the user has no saved preference, apply OPDESK_DEFAULT_LOCALE from the
 * backend. In production the value is usually already injected into index.html;
 * this fetch covers Vite dev (and any case where injection was skipped).
 * Does not write localStorage — the .env default is not a personal choice.
 */
export async function resolveInitialLanguage(): Promise<void> {
  if (getStoredLanguage()) return;
  if (getInjectedDefaultLanguage()) return;

  try {
    const res = await fetch('/api/ui/config');
    if (!res.ok) return;
    const data = (await res.json()) as { default_locale?: string };
    const lang = normalizeLanguage(data.default_locale);
    if (!lang || lang === i18n.language) return;
    await i18n.changeLanguage(lang);
    applyDocumentLanguage(lang);
  } catch {
    // Backend may be down during startup; keep current language.
  }
}

// Apply direction on load
applyDocumentLanguage(initialLang);

export default i18n;
