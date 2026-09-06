import { describe, expect, it } from 'vitest'
import { amountInWords, numberToWordsAr, numberToWordsEn, numberToWordsFr } from './amountInWords'

describe('numberToWords', () => {
  it('english', () => {
    expect(numberToWordsEn(0)).toBe('zero')
    expect(numberToWordsEn(21)).toBe('twenty-one')
    expect(numberToWordsEn(105)).toBe('one hundred five')
    expect(numberToWordsEn(25000)).toBe('twenty-five thousand')
    expect(numberToWordsEn(1_234_567)).toBe('one million two hundred thirty-four thousand five hundred sixty-seven')
  })
  it('french', () => {
    expect(numberToWordsFr(0)).toBe('zéro')
    expect(numberToWordsFr(71)).toBe('soixante-et-onze')
    expect(numberToWordsFr(80)).toBe('quatre-vingts')
    expect(numberToWordsFr(91)).toBe('quatre-vingt-onze')
    expect(numberToWordsFr(200)).toBe('deux cents')
    expect(numberToWordsFr(1000)).toBe('mille')
    expect(numberToWordsFr(25000)).toBe('vingt-cinq mille')
    expect(numberToWordsFr(2_000_000)).toBe('deux millions')
  })
  it('arabic', () => {
    expect(numberToWordsAr(0)).toBe('صفر')
    expect(numberToWordsAr(1)).toBe('واحد')
    expect(numberToWordsAr(11)).toBe('أحد عشر')
    expect(numberToWordsAr(25)).toBe('خمسة وعشرون')
    expect(numberToWordsAr(200)).toBe('مائتان')
    expect(numberToWordsAr(1000)).toBe('ألف')
    expect(numberToWordsAr(2000)).toBe('ألفان')
    expect(numberToWordsAr(3000)).toBe('ثلاثة آلاف')
    expect(numberToWordsAr(25000)).toBe('خمسة وعشرون ألفًا')
    expect(numberToWordsAr(1_250_000)).toBe('مليون ومائتان وخمسون ألفًا')
  })
})

describe('amountInWords', () => {
  it('arabic dinars, the spec example', () => {
    expect(amountInWords(2_500_000, 'DZD', 'ar')).toBe('خمسة وعشرون ألف دينار جزائري فقط لا غير')
  })
  it('arabic with centimes and plural forms', () => {
    expect(amountInWords(105050, 'DZD', 'ar')).toBe('ألف وخمسون دينارًا جزائريًا وخمسون سنتيمًا فقط لا غير')
    expect(amountInWords(300, 'DZD', 'ar')).toBe('ثلاثة دنانير جزائرية فقط لا غير')
    expect(amountInWords(200, 'DZD', 'ar')).toBe('ديناران جزائريان فقط لا غير')
    expect(amountInWords(100, 'DZD', 'ar')).toBe('دينار جزائري فقط لا غير')
    expect(amountInWords(1_100_000_00, 'DZD', 'ar')).toBe('مليون ومائة ألف دينار جزائري فقط لا غير')
    expect(amountInWords(1_15, 'DZD', 'ar')).toBe('دينار جزائري وخمسة عشر سنتيمًا فقط لا غير')
  })
  it('french and english with cents', () => {
    expect(amountInWords(125_050, 'EUR', 'fr')).toBe('Mille deux cent cinquante euros et cinquante centimes')
    expect(amountInWords(100, 'EUR', 'fr')).toBe('Un euro')
    expect(amountInWords(125_050, 'USD', 'en')).toBe('One thousand two hundred fifty US dollars and fifty cents only')
    expect(amountInWords(1, 'GBP', 'en')).toBe('Zero pounds sterling and one penny only')
  })
  it('unknown currency falls back to its code', () => {
    expect(amountInWords(5000, 'XYZ', 'en')).toBe('Fifty XYZ only')
  })
  it('three-decimal currency (TND)', () => {
    expect(amountInWords(1_500, 'TND', 'fr')).toBe('Un dinar tunisien et cinq cents millimes')
  })
  it('rejects non-integers', () => {
    expect(() => amountInWords(1.5, 'DZD', 'ar')).toThrow()
  })
})
