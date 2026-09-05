import { describe, expect, it } from 'vitest'
import { formatDocumentNumber, sequenceScope, validatePattern } from './numbering'

const date = new Date(2026, 8, 5) // 5 سبتمبر 2026

describe('formatDocumentNumber', () => {
  it('formats the default invoice pattern', () => {
    expect(formatDocumentNumber('INV-{YYYY}-{SEQ:5}', { date, sequence: 1 })).toBe('INV-2026-00001')
    expect(formatDocumentNumber('INV-{YYYY}-{SEQ:5}', { date, sequence: 12345 })).toBe('INV-2026-12345')
    expect(formatDocumentNumber('INV-{YYYY}-{SEQ:3}', { date, sequence: 12345 })).toBe('INV-2026-12345')
  })
  it('supports all tokens', () => {
    expect(formatDocumentNumber('{PREFIX}{YY}{MM}{DD}-{SEQ}', { date, sequence: 7, prefix: 'F' })).toBe('F260905-7')
    expect(formatDocumentNumber('{PREFIX}-{SEQ:2}', { date, sequence: 7 })).toBe('-07')
  })
})

describe('sequenceScope', () => {
  it('resets yearly when the pattern has a year', () => {
    expect(sequenceScope('INV-{YYYY}-{SEQ:5}', date)).toBe('2026')
    expect(sequenceScope('INV-{YY}{MM}-{SEQ:4}', date)).toBe('2026-09')
    expect(sequenceScope('INV-{SEQ:6}', date)).toBe('global')
  })
})

describe('validatePattern', () => {
  it('requires a SEQ token and rejects unknown tokens', () => {
    expect(validatePattern('INV-{YYYY}-{SEQ:5}')).toEqual({ ok: true })
    expect(validatePattern('')).toEqual({ ok: false, reason: 'empty' })
    expect(validatePattern('INV-{YYYY}')).toEqual({ ok: false, reason: 'missing_seq' })
    expect(validatePattern('INV-{FOO}-{SEQ}')).toEqual({ ok: false, reason: 'unknown_token' })
  })
})
