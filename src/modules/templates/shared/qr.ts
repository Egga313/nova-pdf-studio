/**
 * مولّد QR مستقل (بلا اعتماديات): وضع البايتات، تصحيح أخطاء M، الإصدارات 1–10 (حتى ~270 بايت).
 * يكفي لرقم الفاتورة والمبلغ والمؤسسة أو رابط دفع. الناتج SVG قابل للتضمين في HTML/PDF.
 */

const EC_CODEWORDS_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26] // لكل كتلة
const BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346]
const ALIGN_POS: number[][] = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]]

function gfMul(a: number, b: number): number {
  let r = 0
  while (b) {
    if (b & 1) r ^= a
    a <<= 1
    if (a & 0x100) a ^= 0x11d
    b >>= 1
  }
  return r
}

function rsGenerator(degree: number): number[] {
  let poly = [1]
  let root = 1
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], root)
      next[j + 1] ^= poly[j]
    }
    poly = next
    root = gfMul(root, 2)
  }
  return poly
}

function rsEncode(data: number[], degree: number): number[] {
  const gen = rsGenerator(degree)
  const result = new Array(degree).fill(0)
  for (const byte of data) {
    const factor = byte ^ result.shift()!
    result.push(0)
    for (let i = 0; i < degree; i++) result[i] ^= gfMul(gen[i + 1], factor)
  }
  return result
}

function chooseVersion(byteLength: number): number {
  for (let v = 1; v <= 10; v++) {
    const dataCodewords = TOTAL_CODEWORDS[v] - EC_CODEWORDS_M[v] * BLOCKS_M[v]
    const headerBits = 4 + (v <= 9 ? 8 : 16)
    if (Math.ceil((headerBits + byteLength * 8) / 8) <= dataCodewords) return v
  }
  throw new Error('QR payload too long')
}

/** يعيد مصفوفة الوحدات (true = أسود). */
export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text))
  const version = chooseVersion(bytes.length)
  const size = version * 4 + 17
  const dataCodewords = TOTAL_CODEWORDS[version] - EC_CODEWORDS_M[version] * BLOCKS_M[version]

  // ---- بيانات البتات
  const bits: number[] = []
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1)
  }
  push(0b0100, 4)
  push(bytes.length, version <= 9 ? 8 : 16)
  bytes.forEach((b) => push(b, 8))
  push(0, Math.min(4, dataCodewords * 8 - bits.length))
  while (bits.length % 8) bits.push(0)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  for (let pad = 0xec; data.length < dataCodewords; pad ^= 0xec ^ 0x11) data.push(pad)

  // ---- الكتل وتصحيح الأخطاء
  const blocks = BLOCKS_M[version]
  const shortLen = Math.floor(dataCodewords / blocks)
  const longBlocks = dataCodewords % blocks
  const dataBlocks: number[][] = []
  const ecBlocks: number[][] = []
  let offset = 0
  for (let b = 0; b < blocks; b++) {
    const len = shortLen + (b >= blocks - longBlocks ? 1 : 0)
    const chunk = data.slice(offset, offset + len)
    offset += len
    dataBlocks.push(chunk)
    ecBlocks.push(rsEncode(chunk, EC_CODEWORDS_M[version]))
  }
  const interleaved: number[] = []
  for (let i = 0; i < shortLen + 1; i++) for (const blk of dataBlocks) if (i < blk.length) interleaved.push(blk[i])
  for (let i = 0; i < EC_CODEWORDS_M[version]; i++) for (const blk of ecBlocks) interleaved.push(blk[i])

  // ---- المصفوفة والأنماط الثابتة
  const m: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null))
  const setFinder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr
      const cc = c + dc
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue
      const inner = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6
      const ring = dr === 0 || dr === 6 || dc === 0 || dc === 6
      const core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4
      m[rr][cc] = inner ? ring || core : false
    }
  }
  setFinder(0, 0)
  setFinder(0, size - 7)
  setFinder(size - 7, 0)
  for (let i = 8; i < size - 8; i++) {
    m[6][i] = i % 2 === 0
    m[i][6] = i % 2 === 0
  }
  for (const r of ALIGN_POS[version]) for (const c of ALIGN_POS[version]) {
    if (m[r][c] !== null) continue
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) m[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1
  }
  m[size - 8][8] = true
  // حجز مناطق معلومات التنسيق والإصدار
  for (let i = 0; i < 8; i++) {
    m[8][i] = m[8][i] ?? false
    m[i][8] = m[i][8] ?? false
    m[8][size - 1 - i] = m[8][size - 1 - i] ?? false
    m[size - 1 - i][8] = m[size - 1 - i][8] ?? false
  }
  m[8][8] = m[8][8] ?? false
  if (version >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
    m[i][size - 11 + j] = false
    m[size - 11 + j][i] = false
  }

  // ---- وضع البيانات (متعرج) مع قناع 0 (checkerboard)
  let bitIndex = 0
  const totalBits = interleaved.length * 8
  const bitAt = (i: number) => (interleaved[i >> 3] >> (7 - (i & 7))) & 1
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (let k = 0; k < size; k++) {
      const row = ((col + 1) & 2) === 0 ? size - 1 - k : k
      for (const c of [col, col - 1]) {
        if (m[row][c] !== null) continue
        const bit = bitIndex < totalBits ? bitAt(bitIndex) : 0
        bitIndex++
        m[row][c] = (bit ^ ((row + c) % 2 === 0 ? 1 : 0)) === 1
      }
    }
  }

  // ---- معلومات التنسيق (ECC M = 00, mask 0 = 000) → 15 بت مع BCH
  const formatData = (0b00 << 3) | 0
  let fmt = formatData << 10
  const g = 0b10100110111
  for (let i = 14; i >= 10; i--) if ((fmt >> i) & 1) fmt ^= g << (i - 10)
  const formatBits = ((formatData << 10) | fmt) ^ 0b101010000010010
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >> i) & 1) === 1
    // حول الزاوية العلوية اليسرى
    if (i < 6) m[8][i] = bit
    else if (i < 8) m[8][i + 1] = bit
    else m[8][size - 15 + i] = bit
    if (i < 8) m[size - 1 - i][8] = bit
    else if (i < 9) m[7][8] = bit
    else m[14 - i][8] = bit
  }
  // معلومات الإصدار للإصدارات ≥ 7
  if (version >= 7) {
    let ver = version << 12
    const gv = 0b1111100100101
    for (let i = 17; i >= 12; i--) if ((ver >> i) & 1) ver ^= gv << (i - 12)
    const verBits = (version << 12) | ver
    for (let i = 0; i < 18; i++) {
      const bit = ((verBits >> i) & 1) === 1
      m[Math.floor(i / 3)][size - 11 + (i % 3)] = bit
      m[size - 11 + (i % 3)][Math.floor(i / 3)] = bit
    }
  }
  return m.map((row) => row.map((v) => v === true))
}

export function qrSvg(text: string, sizePx = 96, dark = '#111111'): string {
  const matrix = qrMatrix(text)
  const n = matrix.length
  const quiet = 2
  const cells = n + quiet * 2
  let path = ''
  matrix.forEach((row, r) => row.forEach((on, c) => {
    if (on) path += `M${c + quiet} ${r + quiet}h1v1h-1z`
  }))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cells} ${cells}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges"><rect width="${cells}" height="${cells}" fill="#fff"/><path d="${path}" fill="${dark}"/></svg>`
}
