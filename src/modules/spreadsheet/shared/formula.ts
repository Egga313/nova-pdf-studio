/**
 * محرّك صيغ الجداول: محلّل نحوي ومقيّم لتعابير مثل =SUM(B2:B20)*1.19، =IF(A1>10,"كبير","صغير")، =ROUND(C3/3,2).
 * الدوال: SUM, AVERAGE, MIN, MAX, COUNT, IF, ROUND, ABS, AND, OR, NOT, LEN, CONCAT (و & للدمج).
 * العمليات: + - * / ^ % (نسبة) & ومقارنات = <> < <= > >=. مراجع A1 و$A$1 ونطاقات A1:B5.
 * الأخطاء تُعاد كقيم نصية بأسلوب Excel: #DIV/0! #VALUE! #REF! #NAME? #CYCLE!
 */

export type CellValue = number | string | boolean | null
export type CellRef = { col: number; row: number } // صفرية

export type Node =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'ref'; ref: CellRef; raw: string }
  | { type: 'range'; from: CellRef; to: CellRef; raw: string }
  | { type: 'unary'; op: '-' | '+'; arg: Node }
  | { type: 'postfix'; op: '%'; arg: Node }
  | { type: 'binary'; op: string; left: Node; right: Node }
  | { type: 'call'; name: string; args: Node[] }

export class FormulaError extends Error {
  constructor(readonly code: '#DIV/0!' | '#VALUE!' | '#REF!' | '#NAME?' | '#CYCLE!' | '#N/A') {
    super(code)
  }
}

// ------------------------------------------------------------------ مراجع الخلايا
export function colToLetters(col: number): string {
  let s = ''
  let n = col + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function lettersToCol(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export function refToA1(ref: CellRef): string {
  return `${colToLetters(ref.col)}${ref.row + 1}`
}

export function parseA1(text: string): CellRef | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(text.trim())
  if (!m) return null
  return { col: lettersToCol(m[1]), row: Number(m[2]) - 1 }
}

export function refKey(ref: CellRef): string {
  return `${ref.col}:${ref.row}`
}

// ------------------------------------------------------------------ التحليل اللفظي
type Token =
  | { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string } | { t: '('; v: '(' } | { t: ')'; v: ')' } | { t: ','; v: ',' } | { t: ':'; v: ':' } | { t: 'end'; v: '' }

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  const s = src.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/؛/g, ';')
  while (i < s.length) {
    const ch = s[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?|^\d+\.?/.exec(s.slice(i))!
      out.push({ t: 'num', v: Number(m[0]) })
      i += m[0].length
      continue
    }
    if (ch === '"') {
      let j = i + 1
      let str = ''
      while (j < s.length) {
        if (s[j] === '"') {
          if (s[j + 1] === '"') {
            str += '"'
            j += 2
            continue
          }
          break
        }
        str += s[j++]
      }
      out.push({ t: 'str', v: str })
      i = j + 1
      continue
    }
    if (/[A-Za-z_$؀-ۿ]/.test(ch)) {
      const m = /^[$A-Za-z_؀-ۿ][$A-Za-z0-9_.؀-ۿ]*/.exec(s.slice(i))!
      out.push({ t: 'id', v: m[0] })
      i += m[0].length
      continue
    }
    if (ch === '#') {
      // قيمة خطأ حرفية داخل الصيغة (مثل =#REF!+A2 بعد حذف صف) تنتشر كما في Excel
      const m = new RegExp('^#(REF!|DIV/0!|VALUE!|NAME[?]|CYCLE!|N/A)').exec(s.slice(i))
      throw new FormulaError((m ? m[0] : '#VALUE!') as FormulaError['code'])
    }
    if (ch === '(' || ch === ')' || ch === ':') {
      out.push({ t: ch, v: ch } as Token)
      i++
      continue
    }
    if (ch === ',' || ch === ';') {
      out.push({ t: ',', v: ',' })
      i++
      continue
    }
    const two = s.slice(i, i + 2)
    if (two === '<=' || two === '>=' || two === '<>') {
      out.push({ t: 'op', v: two })
      i += 2
      continue
    }
    if ('+-*/^%&=<>'.includes(ch)) {
      out.push({ t: 'op', v: ch })
      i++
      continue
    }
    throw new FormulaError('#VALUE!')
  }
  out.push({ t: 'end', v: '' })
  return out
}

// ------------------------------------------------------------------ المحلّل النحوي (أسبقية قياسية)
export function parseFormula(src: string): Node {
  const tokens = tokenize(src.startsWith('=') ? src.slice(1) : src)
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]
  const expect = (t: Token['t']) => {
    const tk = next()
    if (tk.t !== t) throw new FormulaError('#VALUE!')
    return tk
  }

  const parseComparison = (): Node => {
    let left = parseConcat()
    while (peek().t === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(peek().v as string)) {
      const op = next().v as string
      left = { type: 'binary', op, left, right: parseConcat() }
    }
    return left
  }
  const parseConcat = (): Node => {
    let left = parseAdditive()
    while (peek().t === 'op' && peek().v === '&') {
      next()
      left = { type: 'binary', op: '&', left, right: parseAdditive() }
    }
    return left
  }
  const parseAdditive = (): Node => {
    let left = parseMultiplicative()
    while (peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = next().v as string
      left = { type: 'binary', op, left, right: parseMultiplicative() }
    }
    return left
  }
  const parseMultiplicative = (): Node => {
    let left = parsePower()
    while (peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = next().v as string
      left = { type: 'binary', op, left, right: parsePower() }
    }
    return left
  }
  const parsePower = (): Node => {
    const base = parseUnary()
    if (peek().t === 'op' && peek().v === '^') {
      next()
      return { type: 'binary', op: '^', left: base, right: parsePower() }
    }
    return base
  }
  const parseUnary = (): Node => {
    if (peek().t === 'op' && (peek().v === '-' || peek().v === '+')) {
      const op = next().v as '-' | '+'
      return { type: 'unary', op, arg: parseUnary() }
    }
    return parsePostfix()
  }
  const parsePostfix = (): Node => {
    let node = parsePrimary()
    while (peek().t === 'op' && peek().v === '%') {
      next()
      node = { type: 'postfix', op: '%', arg: node }
    }
    return node
  }
  const parsePrimary = (): Node => {
    const tk = next()
    if (tk.t === 'num') return { type: 'num', value: tk.v }
    if (tk.t === 'str') return { type: 'str', value: tk.v }
    if (tk.t === '(') {
      const inner = parseComparison()
      expect(')')
      return inner
    }
    if (tk.t === 'id') {
      const upper = tk.v.toUpperCase()
      if (upper === 'TRUE') return { type: 'bool', value: true }
      if (upper === 'FALSE') return { type: 'bool', value: false }
      if (peek().t === '(') {
        next()
        const args: Node[] = []
        if (peek().t !== ')') {
          args.push(parseComparison())
          while (peek().t === ',') {
            next()
            args.push(parseComparison())
          }
        }
        expect(')')
        return { type: 'call', name: upper, args }
      }
      const ref = parseA1(tk.v)
      if (!ref) throw new FormulaError('#NAME?')
      if (peek().t === ':') {
        next()
        const to = next()
        const toRef = to.t === 'id' ? parseA1(to.v) : null
        if (!toRef) throw new FormulaError('#REF!')
        return { type: 'range', from: { col: Math.min(ref.col, toRef.col), row: Math.min(ref.row, toRef.row) }, to: { col: Math.max(ref.col, toRef.col), row: Math.max(ref.row, toRef.row) }, raw: `${tk.v}:${to.v}` }
      }
      return { type: 'ref', ref, raw: tk.v }
    }
    throw new FormulaError('#VALUE!')
  }

  const node = parseComparison()
  if (peek().t !== 'end') throw new FormulaError('#VALUE!')
  return node
}

/** كل الخلايا المرجعية في الصيغة (لبناء رسم التبعيات). */
export function referencedCells(node: Node, out: CellRef[] = []): CellRef[] {
  switch (node.type) {
    case 'ref':
      out.push(node.ref)
      break
    case 'range':
      for (let c = node.from.col; c <= node.to.col; c++) for (let r = node.from.row; r <= node.to.row; r++) out.push({ col: c, row: r })
      break
    case 'unary':
    case 'postfix':
      referencedCells(node.arg, out)
      break
    case 'binary':
      referencedCells(node.left, out)
      referencedCells(node.right, out)
      break
    case 'call':
      node.args.forEach((a) => referencedCells(a, out))
      break
  }
  return out
}

// ------------------------------------------------------------------ التقييم
export type Resolver = (ref: CellRef) => CellValue

function toNumber(v: CellValue): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v === null || v === '') return 0
  const n = Number(String(v).replace(/[\s,]/g, (m) => (m === ',' ? '.' : '')))
  if (Number.isNaN(n)) throw new FormulaError('#VALUE!')
  return n
}

function truthy(v: CellValue): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (v === null) return false
  const s = String(v).toUpperCase()
  if (s === 'TRUE') return true
  if (s === 'FALSE' || s === '') return false
  return true
}

type Arg = { kind: 'value'; value: CellValue } | { kind: 'range'; values: CellValue[] }

function flatten(args: Arg[]): CellValue[] {
  return args.flatMap((a) => (a.kind === 'range' ? a.values : [a.value]))
}
function numbers(args: Arg[]): number[] {
  // في النطاقات تُهمل النصوص والفراغات (كسلوك Excel)؛ في الوسائط المباشرة تُحوَّل
  const out: number[] = []
  for (const a of args) {
    if (a.kind === 'range') {
      for (const v of a.values) if (typeof v === 'number') out.push(v)
    } else if (a.value !== null && a.value !== '') out.push(toNumber(a.value))
  }
  return out
}

function round(n: number, digits: number): number {
  const f = 10 ** digits
  return Math.round((n + Number.EPSILON) * f) / f
}

const FUNCTIONS: Record<string, (args: Arg[]) => CellValue> = {
  SUM: (a) => numbers(a).reduce((s, n) => s + n, 0),
  AVERAGE: (a) => {
    const ns = numbers(a)
    if (!ns.length) throw new FormulaError('#DIV/0!')
    return ns.reduce((s, n) => s + n, 0) / ns.length
  },
  MIN: (a) => {
    const ns = numbers(a)
    return ns.length ? Math.min(...ns) : 0
  },
  MAX: (a) => {
    const ns = numbers(a)
    return ns.length ? Math.max(...ns) : 0
  },
  COUNT: (a) => numbers(a).length,
  COUNTA: (a) => flatten(a).filter((v) => v !== null && v !== '').length,
  IF: (a) => {
    if (a.length < 2) throw new FormulaError('#VALUE!')
    const cond = a[0].kind === 'value' ? a[0].value : a[0].values[0] ?? null
    const pick = truthy(cond) ? a[1] : a[2] ?? { kind: 'value', value: false }
    return pick.kind === 'value' ? pick.value : pick.values[0] ?? null
  },
  ROUND: (a) => round(toNumber(single(a, 0)), a[1] ? toNumber(single(a, 1)) : 0),
  ABS: (a) => Math.abs(toNumber(single(a, 0))),
  AND: (a) => flatten(a).every(truthy),
  OR: (a) => flatten(a).some(truthy),
  NOT: (a) => !truthy(single(a, 0)),
  LEN: (a) => String(single(a, 0) ?? '').length,
  CONCAT: (a) => flatten(a).map((v) => (v === null ? '' : String(v))).join(''),
  CONCATENATE: (a) => flatten(a).map((v) => (v === null ? '' : String(v))).join(''),
  TODAY: () => new Date().toISOString().slice(0, 10),
  PI: () => Math.PI
}

function single(args: Arg[], i: number): CellValue {
  const a = args[i]
  if (!a) throw new FormulaError('#VALUE!')
  return a.kind === 'value' ? a.value : a.values[0] ?? null
}

export function evaluate(node: Node, resolve: Resolver): CellValue {
  const evalArg = (n: Node): Arg => {
    if (n.type === 'range') {
      const values: CellValue[] = []
      for (let c = n.from.col; c <= n.to.col; c++) for (let r = n.from.row; r <= n.to.row; r++) values.push(resolve({ col: c, row: r }))
      return { kind: 'range', values }
    }
    return { kind: 'value', value: evaluate(n, resolve) }
  }
  switch (node.type) {
    case 'num':
      return node.value
    case 'str':
      return node.value
    case 'bool':
      return node.value
    case 'ref':
      return resolve(node.ref)
    case 'range':
      throw new FormulaError('#VALUE!')
    case 'unary': {
      const v = toNumber(evaluate(node.arg, resolve))
      return node.op === '-' ? -v : v
    }
    case 'postfix':
      return toNumber(evaluate(node.arg, resolve)) / 100
    case 'binary': {
      const l = evaluate(node.left, resolve)
      const r = evaluate(node.right, resolve)
      switch (node.op) {
        case '+': return toNumber(l) + toNumber(r)
        case '-': return toNumber(l) - toNumber(r)
        case '*': return toNumber(l) * toNumber(r)
        case '/': {
          const d = toNumber(r)
          if (d === 0) throw new FormulaError('#DIV/0!')
          return toNumber(l) / d
        }
        case '^': return toNumber(l) ** toNumber(r)
        case '&': return `${l ?? ''}${r ?? ''}`
        case '=': return compare(l, r) === 0
        case '<>': return compare(l, r) !== 0
        case '<': return compare(l, r) < 0
        case '<=': return compare(l, r) <= 0
        case '>': return compare(l, r) > 0
        case '>=': return compare(l, r) >= 0
      }
      throw new FormulaError('#VALUE!')
    }
    case 'call': {
      const fn = FUNCTIONS[node.name]
      if (!fn) throw new FormulaError('#NAME?')
      return fn(node.args.map(evalArg))
    }
  }
}

function compare(a: CellValue, b: CellValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if ((typeof a === 'number' || a === null) && (typeof b === 'number' || b === null)) return toNumber(a) - toNumber(b)
  const sa = String(a ?? '').toLowerCase()
  const sb = String(b ?? '').toLowerCase()
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

/** يقيّم نص صيغة كاملًا ويعيد القيمة أو رمز الخطأ كنص. */
export function evaluateFormula(src: string, resolve: Resolver): CellValue {
  try {
    return evaluate(parseFormula(src), resolve)
  } catch (e) {
    if (e instanceof FormulaError) return e.code
    return '#VALUE!'
  }
}

export function isFormula(input: string | null | undefined): boolean {
  return typeof input === 'string' && input.startsWith('=') && input.length > 1
}

export function isErrorValue(v: CellValue): boolean {
  return typeof v === 'string' && /^#(DIV\/0!|VALUE!|REF!|NAME\?|CYCLE!|N\/A)$/.test(v)
}

export const FUNCTION_NAMES = Object.keys(FUNCTIONS)
