export type KvkSearchItem = {
  kvkNumber: string
  vestigingsNumber?: string
  name: string
  city?: string
  type?: string
  active?: 'active' | 'inactive' | 'unknown'
  legalForm?: string
  matchConfidence?: number
}

export type KvkSignatory = {
  name: string
  role?: string
}

export type KvkAddress = {
  street: string
  houseNumber: string
  addition?: string
  postcode: string
  city: string
  country?: string
}

export type KvkEstablishment = {
  name: string
  vestigingsNumber: string
  address?: KvkAddress
}

export type KvkProfile = {
  kvkNumber: string
  legalName: string
  tradeName?: string
  tradeNames?: string[]
  legalForm?: string
  companyActive?: 'active' | 'inactive' | 'unknown'
  mainVisitingAddress?: KvkAddress
  postalAddress?: KvkAddress
  signatories: KvkSignatory[]
  establishments?: KvkEstablishment[]
  warnings?: string[]
  contactEmail?: string
  contactPhone?: string
  website?: string
  invoiceEmail?: string
  vatNumber?: string
}
