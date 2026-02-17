export type KvkSearchItem = {
  kvkNumber: string
  name: string
  city?: string
  type?: string
  active?: boolean
}

export type KvkSignatory = {
  name: string
  role?: string
}

export type KvkProfile = {
  kvkNumber: string
  legalName: string
  tradeName?: string
  legalForm?: string
  address: {
    street: string
    houseNumber: string
    houseNumberAddition?: string
    postcode: string
    city: string
  }
  signatories: KvkSignatory[]
}
