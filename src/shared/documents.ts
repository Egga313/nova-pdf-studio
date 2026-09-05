/** أنواع مشتركة لوحدتَي المستندات والطباعة. */

export interface DocumentRecord {
  id: number
  title: string
  kind: 'pdf' | 'generated' | 'scan' | 'image'
  path: string | null
  sizeBytes: number | null
  pageCount: number
  isScanned: boolean
  ocrDone: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

export type PaperSpec = 'A4' | 'A5' | 'Letter' | { widthMicrons: number; heightMicrons: number }

export interface PrintJobRequest {
  html: string
  title?: string
  paperSize?: PaperSpec
  landscape?: boolean
  marginsMm?: number
  copies?: number
  silent?: boolean
  deviceName?: string
  scalePercent?: number
  pageRanges?: { from: number; to: number }[]
}

export interface PdfExportRequest {
  html: string
  outputPath: string
  paperSize?: PaperSpec
  landscape?: boolean
  marginsMm?: number
  printBackground?: boolean
}
