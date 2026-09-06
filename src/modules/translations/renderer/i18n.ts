/**
 * تهيئة الترجمة: ثلاث لغات مضمّنة (ar/fr/en) مع تبديل فوري للاتجاه (RTL/LTR) بلا إعادة تشغيل.
 * لإضافة لغة: أضف ملف JSON في locales وسجّله في RESOURCES وفي LANGUAGES بملف الإعدادات.
 */
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { intlLocaleOf, languageDirection, type Language } from '@shared/settings'
import ar from './locales/ar.json'
import en from './locales/en.json'
import fr from './locales/fr.json'
import zh from './locales/zh.json'
import tr from './locales/tr.json'
import es from './locales/es.json'
import de from './locales/de.json'
import pt from './locales/pt.json'
import ru from './locales/ru.json'
import hi from './locales/hi.json'
import id from './locales/id.json'
import ja from './locales/ja.json'
import it from './locales/it.json'
import fa from './locales/fa.json'

const RESOURCES: Record<Language, Record<string, unknown>> = { ar, fr, en, zh, tr, es, de, pt, ru, hi, id, ja, it, fa }

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
  return languageDirection(language)
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
  return intlLocaleOf(language)
}

export default i18next
