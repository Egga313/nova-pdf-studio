/**
 * تهيئة الترجمة: ثلاث لغات مضمّنة (ar/fr/en) مع تبديل فوري للاتجاه (RTL/LTR) بلا إعادة تشغيل.
 * لإضافة لغة: أضف ملف JSON في locales وسجّله في RESOURCES وفي LANGUAGES بملف الإعدادات.
 */
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { LANGUAGES, type Language } from '@shared/settings'
import ar from './locales/ar.json'
import en from './locales/en.json'
import fr from './locales/fr.json'

const RESOURCES: Record<Language, Record<string, unknown>> = { ar, fr, en }

export function initI18n(initial: Language = 'ar'): typeof i18next {
  if (!i18next.isInitialized) {
    void i18next.use(initReactI18next).init({
      resources: Object.fromEntries(Object.entries(RESOURCES).map(([code, translation]) => [code, { translation }])),
      lng: initial,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      returnNull: false
    })
    applyDirection(initial)
  }
  return i18next
}

export function directionOf(language: Language): 'rtl' | 'ltr' {
  return LANGUAGES.find((l) => l.code === language)?.dir ?? 'ltr'
}

export function applyDirection(language: Language): void {
  const dir = directionOf(language)
  document.documentElement.setAttribute('dir', dir)
  document.documentElement.setAttribute('lang', language)
}

export async function changeLanguage(language: Language): Promise<void> {
  await i18next.changeLanguage(language)
  applyDirection(language)
}

/** الإعداد المحلي لـ Intl حسب اللغة (الأرقام لاتينية دائمًا). */
export function intlLocale(language: Language): string {
  return language === 'ar' ? 'ar-DZ' : language === 'fr' ? 'fr-FR' : 'en-GB'
}

export default i18next
