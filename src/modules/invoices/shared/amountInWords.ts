/**
 * تحويل المبالغ إلى كلمات بالعربية والفرنسية والإنجليزية، مع اسم العملة والكسور.
 * مثال: 25000.00 DZD → "خمسة وعشرون ألف دينار جزائري فقط لا غير".
 * يعمل على وحدات صغرى صحيحة؛ لا أعداد عشرية.
 */
import type { Language } from '@shared/settings'

export interface CurrencyWords {
  major: { singular: string; dual?: string; plural: string; pluralBig?: string }   // دينار / ديناران / دنانير / دينارًا
  minor: { singular: string; dual?: string; plural: string; pluralBig?: string }
  decimals: number
  gender?: 'm' | 'f'   // للعربية: جنس العملة (دينار مذكر، ليرة مؤنثة)
}

/** اللغات التي تملك صياغة رقمية-لفظية خاصة؛ البقية تعود إلى الإنجليزية. */
export type WordsLanguage = 'ar' | 'fr' | 'en'

export const CURRENCY_WORDS: Record<WordsLanguage, Record<string, CurrencyWords>> = {
  ar: {
    DZD: { major: { singular: 'دينار جزائري', dual: 'ديناران جزائريان', plural: 'دنانير جزائرية', pluralBig: 'دينارًا جزائريًا' }, minor: { singular: 'سنتيم', dual: 'سنتيمان', plural: 'سنتيمات', pluralBig: 'سنتيمًا' }, decimals: 2, gender: 'm' },
    EUR: { major: { singular: 'يورو', plural: 'يورو', pluralBig: 'يورو' }, minor: { singular: 'سنت', dual: 'سنتان', plural: 'سنتات', pluralBig: 'سنتًا' }, decimals: 2, gender: 'm' },
    USD: { major: { singular: 'دولار أمريكي', dual: 'دولاران أمريكيان', plural: 'دولارات أمريكية', pluralBig: 'دولارًا أمريكيًا' }, minor: { singular: 'سنت', dual: 'سنتان', plural: 'سنتات', pluralBig: 'سنتًا' }, decimals: 2, gender: 'm' },
    GBP: { major: { singular: 'جنيه إسترليني', dual: 'جنيهان إسترلينيان', plural: 'جنيهات إسترلينية', pluralBig: 'جنيهًا إسترلينيًا' }, minor: { singular: 'بنس', dual: 'بنسان', plural: 'بنسات', pluralBig: 'بنسًا' }, decimals: 2, gender: 'm' },
    MAD: { major: { singular: 'درهم مغربي', dual: 'درهمان مغربيان', plural: 'دراهم مغربية', pluralBig: 'درهمًا مغربيًا' }, minor: { singular: 'سنتيم', dual: 'سنتيمان', plural: 'سنتيمات', pluralBig: 'سنتيمًا' }, decimals: 2, gender: 'm' },
    TND: { major: { singular: 'دينار تونسي', dual: 'ديناران تونسيان', plural: 'دنانير تونسية', pluralBig: 'دينارًا تونسيًا' }, minor: { singular: 'مليم', dual: 'مليمان', plural: 'مليمات', pluralBig: 'مليمًا' }, decimals: 3, gender: 'm' },
    SAR: { major: { singular: 'ريال سعودي', dual: 'ريالان سعوديان', plural: 'ريالات سعودية', pluralBig: 'ريالًا سعوديًا' }, minor: { singular: 'هللة', dual: 'هللتان', plural: 'هللات', pluralBig: 'هللة' }, decimals: 2, gender: 'm' }
  },
  fr: {
    DZD: { major: { singular: 'dinar algérien', plural: 'dinars algériens' }, minor: { singular: 'centime', plural: 'centimes' }, decimals: 2 },
    EUR: { major: { singular: 'euro', plural: 'euros' }, minor: { singular: 'centime', plural: 'centimes' }, decimals: 2 },
    USD: { major: { singular: 'dollar américain', plural: 'dollars américains' }, minor: { singular: 'cent', plural: 'cents' }, decimals: 2 },
    GBP: { major: { singular: 'livre sterling', plural: 'livres sterling' }, minor: { singular: 'penny', plural: 'pence' }, decimals: 2 },
    MAD: { major: { singular: 'dirham marocain', plural: 'dirhams marocains' }, minor: { singular: 'centime', plural: 'centimes' }, decimals: 2 },
    TND: { major: { singular: 'dinar tunisien', plural: 'dinars tunisiens' }, minor: { singular: 'millime', plural: 'millimes' }, decimals: 3 }
  },
  en: {
    DZD: { major: { singular: 'Algerian dinar', plural: 'Algerian dinars' }, minor: { singular: 'centime', plural: 'centimes' }, decimals: 2 },
    EUR: { major: { singular: 'euro', plural: 'euros' }, minor: { singular: 'cent', plural: 'cents' }, decimals: 2 },
    USD: { major: { singular: 'US dollar', plural: 'US dollars' }, minor: { singular: 'cent', plural: 'cents' }, decimals: 2 },
    GBP: { major: { singular: 'pound sterling', plural: 'pounds sterling' }, minor: { singular: 'penny', plural: 'pence' }, decimals: 2 },
    MAD: { major: { singular: 'Moroccan dirham', plural: 'Moroccan dirhams' }, minor: { singular: 'centime', plural: 'centimes' }, decimals: 2 },
    TND: { major: { singular: 'Tunisian dinar', plural: 'Tunisian dinars' }, minor: { singular: 'millime', plural: 'millimes' }, decimals: 3 }
  }
}

// ------------------------------------------------------------------ English
const EN_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const EN_SCALE = ['', 'thousand', 'million', 'billion', 'trillion']

function enBelowThousand(n: number): string {
  const parts: string[] = []
  if (n >= 100) {
    parts.push(`${EN_ONES[Math.floor(n / 100)]} hundred`)
    n %= 100
  }
  if (n >= 20) {
    parts.push(EN_ONES[n % 10] ? `${EN_TENS[Math.floor(n / 10)]}-${EN_ONES[n % 10]}` : EN_TENS[Math.floor(n / 10)])
  } else if (n > 0) parts.push(EN_ONES[n])
  return parts.join(' ')
}

export function numberToWordsEn(n: number): string {
  if (n === 0) return 'zero'
  const groups: string[] = []
  let scale = 0
  while (n > 0) {
    const chunk = n % 1000
    if (chunk) groups.unshift(`${enBelowThousand(chunk)}${EN_SCALE[scale] ? ` ${EN_SCALE[scale]}` : ''}`)
    n = Math.floor(n / 1000)
    scale++
  }
  return groups.join(' ')
}

// ------------------------------------------------------------------ Français
const FR_ONES = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
const FR_TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']

function frBelowHundred(n: number): string {
  if (n < 20) return FR_ONES[n]
  const t = Math.floor(n / 10)
  const u = n % 10
  if (t === 7 || t === 9) {
    const base = t === 7 ? 'soixante' : 'quatre-vingt'
    const rest = FR_ONES[10 + u]
    return t === 7 && u === 1 ? 'soixante-et-onze' : `${base}-${rest}`
  }
  if (t === 8) return u === 0 ? 'quatre-vingts' : `quatre-vingt-${FR_ONES[u]}`
  if (u === 0) return FR_TENS[t]
  if (u === 1) return `${FR_TENS[t]}-et-un`
  return `${FR_TENS[t]}-${FR_ONES[u]}`
}

function frBelowThousand(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  const parts: string[] = []
  if (h === 1) parts.push('cent')
  else if (h > 1) parts.push(`${FR_ONES[h]} cent${r === 0 ? 's' : ''}`)
  if (r) parts.push(frBelowHundred(r))
  return parts.join(' ')
}

export function numberToWordsFr(n: number): string {
  if (n === 0) return 'zéro'
  const parts: string[] = []
  const scales: [number, string, string][] = [[1_000_000_000, 'milliard', 'milliards'], [1_000_000, 'million', 'millions'], [1000, 'mille', 'mille']]
  for (const [value, sing, plur] of scales) {
    const q = Math.floor(n / value)
    if (q) {
      parts.push(value === 1000 && q === 1 ? 'mille' : `${frBelowThousand(q)} ${q > 1 ? plur : sing}`)
      n %= value
    }
  }
  if (n) parts.push(frBelowThousand(n))
  return parts.join(' ')
}

// ------------------------------------------------------------------ العربية
const AR_ONES_M = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']
const AR_ONES_F = ['', 'واحدة', 'اثنتان', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثماني', 'تسع', 'عشر', 'إحدى عشرة', 'اثنتا عشرة', 'ثلاث عشرة', 'أربع عشرة', 'خمس عشرة', 'ست عشرة', 'سبع عشرة', 'ثماني عشرة', 'تسع عشرة']
const AR_TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
const AR_HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة']

function arBelowThousand(n: number, gender: 'm' | 'f'): string {
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const r = n % 100
  if (h) parts.push(AR_HUNDREDS[h])
  if (r) {
    const ones = gender === 'f' ? AR_ONES_F : AR_ONES_M
    if (r < 20) parts.push(ones[r])
    else {
      const u = r % 10
      const t = Math.floor(r / 10)
      parts.push(u ? `${ones[u]} و${AR_TENS[t]}` : AR_TENS[t])
    }
  }
  return parts.join(' و')
}

/** اسم المجموعة (ألف/مليون/مليار) بصيغته الصحيحة حسب العدد. */
function arScale(q: number, scale: 1 | 2 | 3): string {
  const forms: Record<number, [string, string, string, string]> = {
    1: ['ألف', 'ألفان', 'آلاف', 'ألفًا'],
    2: ['مليون', 'مليونان', 'ملايين', 'مليونًا'],
    3: ['مليار', 'ملياران', 'مليارات', 'مليارًا']
  }
  const [one, two, few, many] = forms[scale]
  if (q === 1) return one
  if (q === 2) return two
  const last = q % 100
  if (last >= 3 && last <= 10) return `${arBelowThousand(q, 'm')} ${few}`
  return `${arBelowThousand(q, 'm')} ${many}`
}

export function numberToWordsAr(n: number, gender: 'm' | 'f' = 'm'): string {
  if (n === 0) return 'صفر'
  const parts: string[] = []
  const billions = Math.floor(n / 1_000_000_000)
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000
  if (billions) parts.push(arScale(billions, 3))
  if (millions) parts.push(arScale(millions, 2))
  if (thousands) parts.push(arScale(thousands, 1))
  if (rest) parts.push(arBelowThousand(rest, gender))
  return parts.join(' و')
}

/** صيغة اسم العملة العربية حسب العدد: 1 مفرد، 2 مثنى، 3-10 جمع، 11+ مفرد منصوب (دينارًا). */
function arUnit(count: number, unit: CurrencyWords['major']): string {
  if (count === 1) return unit.singular
  if (count === 2) return unit.dual ?? `${unit.singular}ان`
  const last = count % 100
  if (last >= 3 && last <= 10) return unit.plural
  if (last === 0 && count >= 100) return unit.singular
  return unit.pluralBig ?? unit.plural
}

function frenUnit(count: number, unit: CurrencyWords['major']): string {
  return count === 1 ? unit.singular : unit.plural
}

export function amountInWords(minor: number, currencyCode: string, language: Language, decimals = 2): string {
  if (!Number.isInteger(minor)) throw new TypeError('minor must be an integer')
  // اللغات التي لا تملك جداول كلمات (zh/tr/es/…) تستخدم الصياغة الإنجليزية، وهي المقبولة دوليًا في الفواتير
  const wordsLanguage: WordsLanguage = language === 'ar' || language === 'fr' ? language : 'en'
  const table = CURRENCY_WORDS[wordsLanguage][currencyCode.toUpperCase()]
  const dec = table?.decimals ?? decimals
  const scale = 10 ** dec
  const negative = minor < 0
  const abs = Math.abs(minor)
  const major = Math.floor(abs / scale)
  const fraction = abs - major * scale
  const majorUnit = table?.major ?? { singular: currencyCode, plural: currencyCode }
  const minorUnit = table?.minor ?? { singular: '', plural: '' }

  if (language === 'ar') {
    const arPart = (count: number, unit: CurrencyWords['major']): string => {
      if (count === 0) return `صفر ${unit.singular}`
      if (count === 1) return unit.singular                       // "دينار جزائري" (بلا "واحد")
      if (count === 2) return unit.dual ?? `${unit.singular}ان`    // "ديناران جزائريان"
      const words = numberToWordsAr(count, table?.gender ?? 'm')
      // إذا انتهى العدد بمجموعة كاملة (25000 = خمسة وعشرون ألف) تأتي العملة مفردة مضافًا إليها: "ألف دينار"
      const endsWithScale = count % 1000 === 0
      if (endsWithScale) return `${words.replace(/ًا$/, '').replace(/آلاف$/, 'آلاف').replace(/ألفًا$/, 'ألف').replace(/مليونًا$/, 'مليون').replace(/مليارًا$/, 'مليار')} ${unit.singular}`
      return `${words} ${arUnit(count, unit)}`
    }
    let text = arPart(major, majorUnit)
    if (fraction) text += ` و${arPart(fraction, minorUnit)}`
    text += ' فقط لا غير'
    return negative ? `ناقص ${text}` : text
  }
  if (language === 'fr') {
    let text = `${numberToWordsFr(major)} ${frenUnit(major, majorUnit)}`
    if (fraction) text += ` et ${numberToWordsFr(fraction)} ${frenUnit(fraction, minorUnit)}`
    return capitalize(negative ? `moins ${text}` : text)
  }
  let text = `${numberToWordsEn(major)} ${frenUnit(major, majorUnit)}`
  if (fraction) text += ` and ${numberToWordsEn(fraction)} ${frenUnit(fraction, minorUnit)}`
  text += ' only'
  return capitalize(negative ? `minus ${text}` : text)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
