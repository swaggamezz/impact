export const CONNECTION_PRODUCTS = [
  'Elektra',
  'Gas',
  'Water',
  'Warmte',
  'Onbekend',
] as const
export type ConnectionProduct = (typeof CONNECTION_PRODUCTS)[number]

export const MARKET_SEGMENTS = ['KV', 'GV', 'Onbekend'] as const
export type MarketSegment = (typeof MARKET_SEGMENTS)[number]

export const TELEMETRY_OPTIONS = [
  'Onbekend',
  'Slimme meter',
  'Maandbemeten',
  'Jaarbemeten',
  'Continu (kwartierwaarden)',
] as const
export type TelemetryOption = (typeof TELEMETRY_OPTIONS)[number]
export const TELEMETRY_CODE_UNKNOWN = 'ONBEKEND' as const

export const COMPANY_ACTIVE_OPTIONS = ['active', 'inactive', 'unknown'] as const
export type CompanyActive = (typeof COMPANY_ACTIVE_OPTIONS)[number]

export const CONNECTION_SOURCES = [
  'OCR_PHOTO',
  'OCR_PDF',
  'EXCEL',
  'MANUAL',
] as const
export type ConnectionSource = (typeof CONNECTION_SOURCES)[number]

export interface Connection {
  id: string
  eanCode: string
  product: ConnectionProduct
  tenaamstelling: string
  legalName?: string
  tradeName?: string
  companyActive?: CompanyActive
  kvkNumber: string
  iban: string
  authorizedSignatory: string
  authorizedSignatoryRole?: string
  legalForm?: string
  contactEmail?: string
  contactPhone?: string
  website?: string
  invoiceEmail?: string
  vatNumber?: string
  telemetryCode: string
  telemetryType?: TelemetryOption | string
  department?: string
  deliveryStreet: string
  deliveryHouseNumber: string
  deliveryHouseNumberAddition?: string
  deliveryPostcode: string
  deliveryCity: string
  invoiceSameAsDelivery?: boolean
  invoiceStreet?: string
  invoiceHouseNumber?: string
  invoiceHouseNumberAddition?: string
  invoicePostcode?: string
  invoiceCity?: string
  gridOperator?: string
  supplier?: string
  marketSegment: MarketSegment
  meterNumber?: string
  annualUsageNormal?: string
  annualUsageLow?: string
  status?: string
  notes?: string
  addressWarning?: string
  createdAt: string
  source: ConnectionSource
}

export type ConnectionDraft = Partial<Connection> &
  Pick<Connection, 'id' | 'createdAt' | 'source'>

export const REQUIRED_FIELDS: Array<keyof Connection> = [
  'eanCode',
  'product',
  'tenaamstelling',
  'kvkNumber',
  'iban',
  'authorizedSignatory',
  'telemetryCode',
  'deliveryStreet',
  'deliveryHouseNumber',
  'deliveryPostcode',
  'deliveryCity',
  'marketSegment',
]

const generateId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `conn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export const createDraftConnection = (
  source: ConnectionSource = 'MANUAL',
): ConnectionDraft => ({
  id: generateId(),
  createdAt: new Date().toISOString(),
  source,
  telemetryCode: TELEMETRY_CODE_UNKNOWN,
  invoiceSameAsDelivery: true,
})
