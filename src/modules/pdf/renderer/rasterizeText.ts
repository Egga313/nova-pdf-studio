/**
 * رسم كائن نص إلى PNG عبر Canvas (للنص العربي وغير اللاتيني الذي لا تشكّله pdf-lib).
 * المحرك يستخدم خطوط النظام نفسها التي يعرضها المستخدم، فيطابق الناتج ما يراه في المحرّر.
 */
import type { TextObject } from '../shared/editModel'
import type { RasterizedText } from '../shared/applyEdits'

const FAMILIES: Record<TextObject['fontFamily'], string> = {
  sans: '"Segoe UI", "Noto Sans Arabic", "Noto Naskh Arabic", Tahoma, Arial, sans-serif',
  serif: '"Times New Roman", "Noto Naskh Arabic", "Amiri", serif',
  mono: 'Consolas, "Courier New", monospace'
}

export function cssFont(o: TextObject, scale = 1): string {
  return `${o.italic ? 'italic ' : ''}${o.bold ? '700 ' : '400 '}${o.fontSize * scale}px ${FAMILIES[o.fontFamily]}`
}

export function resolveDirection(o: TextObject): 'ltr' | 'rtl' {
  if (o.direction !== 'auto') return o.direction
  const rtl = (o.text.match(/[֐-ࣿיִ-﷿ﹰ-﻿]/g) ?? []).length
  const latin = (o.text.match(/[A-Za-z]/g) ?? []).length
  return rtl > 0 && rtl >= latin ? 'rtl' : 'ltr'
}

/** يلفّ النص على أسطر ضمن عرض معيّن بالبكسل باستخدام قياسات Canvas. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate
      else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

export async function rasterizeText(o: TextObject, scale = 3): Promise<RasterizedText> {
  const lineHeight = o.fontSize * 1.25
  const widthPx = Math.max(1, Math.ceil(o.width * scale))
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = cssFont(o, scale)
  const lines = wrapLines(measure, o.text, widthPx)
  const heightPt = Math.max(o.height, lines.length * lineHeight)
  const heightPx = Math.ceil(heightPt * scale)

  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')!
  if (o.background) {
    ctx.fillStyle = o.background
    ctx.fillRect(0, 0, widthPx, heightPx)
  }
  ctx.font = cssFont(o, scale)
  ctx.fillStyle = o.color
  ctx.textBaseline = 'alphabetic'
  const dir = resolveDirection(o)
  ctx.direction = dir
  const align = o.align
  ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'
  const x = align === 'center' ? widthPx / 2 : align === 'right' ? widthPx : 0

  lines.forEach((line, i) => {
    const baseline = (o.fontSize + i * lineHeight) * scale
    ctx.fillText(line, x, baseline)
    if (o.underline) {
      const w = ctx.measureText(line).width
      const startX = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
      ctx.fillRect(startX, baseline + 2 * scale, w, Math.max(1, (o.fontSize / 14) * scale))
    }
  })

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('rasterizeText: toBlob failed')
  return { png: new Uint8Array(await blob.arrayBuffer()), widthPt: o.width, heightPt }
}
