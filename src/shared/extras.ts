/** أنواع الملحقات: ملاحظات داخلية، مرفقات، حقول مخصصة، ومسودات الاسترجاع التلقائي. */
export type OwnerType = 'customer' | 'invoice' | 'product'

export interface Note {
  id: number
  ownerType: OwnerType
  ownerId: number
  body: string
  createdAt: string
  updatedAt: string
}

export interface Attachment {
  id: number
  ownerType: OwnerType
  ownerId: number
  name: string
  path: string
  mime: string
  sizeBytes: number | null
  createdAt: string
}

export type CustomFieldEntity = 'customer' | 'invoice' | 'product' | 'company'
export type CustomFieldType = 'text' | 'number' | 'date' | 'bool'
export const CUSTOM_FIELD_ENTITIES: CustomFieldEntity[] = ['invoice', 'customer', 'product', 'company']
export const CUSTOM_FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'date', 'bool']

export interface CustomField {
  id: number
  entity: CustomFieldEntity
  key: string
  label: string
  fieldType: CustomFieldType
  showOnInvoice: boolean
  position: number
}

export interface CustomFieldInput {
  id?: number
  entity: CustomFieldEntity
  key?: string
  label: string
  fieldType: CustomFieldType
  showOnInvoice?: boolean
  position?: number
}

export interface CustomFieldValue {
  fieldId: number
  entityId: number
  value: string | null
}

export type DraftKind = 'invoice' | 'spreadsheet' | 'customer'

export interface DraftRecord {
  id: string
  kind: DraftKind
  title: string
  payload: string
  updatedAt: string
}
