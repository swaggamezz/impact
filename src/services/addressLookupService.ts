export interface AddressLookupResult {
  street: string
  city: string
}

export const normalizePostcode = (value: string) =>
  value.replace(/\s+/g, '').toUpperCase()

export const isValidNlPostcode = (value: string) =>
  /^\d{4}[A-Z]{2}$/.test(normalizePostcode(value))

export const extractHouseNumber = (value: string) => {
  const match = value.match(/\d+/)
  return match?.[0] ?? ''
}

export const lookupAddress = async (
  postcode: string,
  houseNumber: string,
  signal?: AbortSignal,
): Promise<AddressLookupResult | null> => {
  const url = new URL(
    'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free',
  )
  url.searchParams.set(
    'q',
    `postcode:${normalizePostcode(postcode)} AND huisnummer:${houseNumber}`,
  )
  url.searchParams.set('rows', '1')

  const response = await fetch(url.toString(), { signal })
  if (!response.ok) {
    throw new Error('Adres lookup mislukt')
  }

  const data = (await response.json()) as {
    response?: {
      docs?: Array<{
        straatnaam?: string
        woonplaatsnaam?: string
      }>
    }
  }

  const doc = data.response?.docs?.[0]
  if (!doc?.straatnaam || !doc?.woonplaatsnaam) {
    return null
  }

  return {
    street: doc.straatnaam,
    city: doc.woonplaatsnaam,
  }
}
