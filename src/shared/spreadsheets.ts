/** أنواع جداول البيانات المشتركة بين الواجهة والعملية الرئيسية. المصنّف نفسه يُخزَّن JSON في عمود data. */
export interface SpreadsheetRecord {
  id: number
  title: string
  path: string | null
  sheetCount: number
  isDemo: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface SpreadsheetDetail extends SpreadsheetRecord {
  data: string // JSON لـ Workbook
}

export interface SpreadsheetSaveInput {
  id?: number
  title: string
  path?: string | null
  data: string
  sheetCount: number
}

export interface SpreadsheetListFilters {
  query?: string
  includeDeleted?: boolean
  limit?: number
}

export type SpreadsheetExportType = 'xlsx' | 'csv'
