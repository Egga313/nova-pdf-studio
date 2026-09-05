/** قفل التطبيق برمز PIN: يُخزَّن كتجزئة scrypt مع ملح عشوائي، ولا يُخزَّن الرمز نفسه أبدًا. */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { audit } from '@modules/database/main/audit'
import { AppError } from '@shared/errors'
import { getInternalValue, getSettings, setInternalValue, updateSettings } from './repository'

interface PinRecord {
  salt: string       // hex
  hash: string       // hex
  keyLen: number
  cost: number
}

const KEY = 'security.pin'
const KEY_LEN = 64
const COST = 16384

function hashPin(pin: string, salt: Buffer, cost = COST, keyLen = KEY_LEN): Buffer {
  return scryptSync(pin.normalize('NFKC'), salt, keyLen, { N: cost })
}

export function pinStatus(): { enabled: boolean } {
  return { enabled: getInternalValue<PinRecord>(KEY) !== null }
}

export function verifyPin(pin: string): boolean {
  const record = getInternalValue<PinRecord>(KEY)
  if (!record) return true // لا يوجد قفل
  const expected = Buffer.from(record.hash, 'hex')
  const actual = hashPin(pin, Buffer.from(record.salt, 'hex'), record.cost, record.keyLen)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function setPin(pin: string, currentPin?: string): void {
  if (!/^\d{4,12}$/.test(pin)) throw new AppError('VALIDATION', 'errors.validation.pin_format')
  const existing = getInternalValue<PinRecord>(KEY)
  if (existing && !verifyPin(currentPin ?? '')) throw new AppError('LOCKED', 'errors.security.wrong_pin')
  const salt = randomBytes(16)
  const record: PinRecord = { salt: salt.toString('hex'), hash: hashPin(pin, salt).toString('hex'), keyLen: KEY_LEN, cost: COST }
  setInternalValue(KEY, record)
  updateSettings({ security: { ...getSettings().security, appLockEnabled: true } })
  audit('security.pin_set')
}

export function removePin(currentPin: string): void {
  if (!verifyPin(currentPin)) throw new AppError('LOCKED', 'errors.security.wrong_pin')
  setInternalValue(KEY, null)
  updateSettings({ security: { ...getSettings().security, appLockEnabled: false } })
  audit('security.pin_removed')
}
