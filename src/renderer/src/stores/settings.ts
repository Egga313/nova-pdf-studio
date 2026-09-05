/** مخزن الإعدادات في الواجهة: يحمّل من العملية الرئيسية ويطبّق اللغة والمظهر فورًا. */
import { create } from 'zustand'
import type { Currency, Tax } from '@shared/entities'
import { type AppSettings, DEFAULT_SETTINGS, type Language, type ThemeMode } from '@shared/settings'
import { changeLanguage } from '@modules/translations/renderer/i18n'
import { invoke } from '@renderer/lib/ipc'

interface SettingsState {
  loaded: boolean
  settings: AppSettings
  taxes: Tax[]
  currencies: Currency[]
  resolvedTheme: 'light' | 'dark'
  load: () => Promise<void>
  update: (patch: Partial<AppSettings>) => Promise<AppSettings>
  setLanguage: (language: Language) => Promise<void>
  setTheme: (theme: ThemeMode) => Promise<void>
  refreshTaxes: () => Promise<void>
  refreshCurrencies: () => Promise<void>
}

const media = window.matchMedia('(prefers-color-scheme: dark)')

function resolveTheme(theme: ThemeMode): 'light' | 'dark' {
  return theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
}

function applyTheme(theme: ThemeMode): 'light' | 'dark' {
  const resolved = resolveTheme(theme)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  return resolved
}

export const useSettings = create<SettingsState>((set, get) => ({
  loaded: false,
  settings: DEFAULT_SETTINGS,
  taxes: [],
  currencies: [],
  resolvedTheme: 'light',

  load: async () => {
    const [settings, taxes, currencies] = await Promise.all([
      invoke('settings:get'),
      invoke('taxes:list', { includeInactive: true }),
      invoke('currencies:list', { includeInactive: true })
    ])
    await changeLanguage(settings.language)
    const resolvedTheme = applyTheme(settings.theme)
    set({ settings, taxes, currencies, resolvedTheme, loaded: true })
  },

  update: async (patch) => {
    const settings = await invoke('settings:update', patch)
    set({ settings })
    if (patch.theme) set({ resolvedTheme: applyTheme(settings.theme) })
    if (patch.language) await changeLanguage(settings.language)
    return settings
  },

  setLanguage: async (language) => {
    await changeLanguage(language) // فوري، ثم نحفظ
    await get().update({ language })
  },

  setTheme: async (theme) => {
    set({ resolvedTheme: applyTheme(theme) })
    await get().update({ theme })
  },

  refreshTaxes: async () => set({ taxes: await invoke('taxes:list', { includeInactive: true }) }),
  refreshCurrencies: async () => set({ currencies: await invoke('currencies:list', { includeInactive: true }) })
}))

// متابعة تغيّر سمة النظام عند اختيار "حسب النظام"
media.addEventListener('change', () => {
  const state = useSettings.getState()
  if (state.settings.theme === 'system') useSettings.setState({ resolvedTheme: applyTheme('system') })
})

export function currentCurrency(code?: string): Currency {
  const { currencies, settings } = useSettings.getState()
  const wanted = code ?? settings.invoice.defaultCurrency
  return (
    currencies.find((c) => c.code === wanted) ?? {
      code: wanted, name: wanted, symbol: wanted, decimals: 2, position: settings.invoice.currencyPosition,
      isActive: true, createdAt: '', updatedAt: ''
    }
  )
}
