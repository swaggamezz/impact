type KvkAddress = {
  street: string
  houseNumber: string
  addition?: string
  postcode: string
  city: string
  country?: string
}

type KvkEstablishment = {
  name: string
  vestigingsNumber: string
  address?: KvkAddress
}

type KvkProfile = {
  kvkNumber: string
  legalName: string
  tradeName?: string
  tradeNames?: string[]
  legalForm?: string
  companyActive?: 'active' | 'inactive' | 'unknown'
  mainVisitingAddress?: KvkAddress
  postalAddress?: KvkAddress
  signatories: Array<{ name: string; role?: string }>
  establishments?: KvkEstablishment[]
  warnings?: string[]
  contactEmail?: string
  contactPhone?: string
  website?: string
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
} as const

const FETCH_TIMEOUT_MS = 8000

export const config = {
  runtime: 'edge',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  })

const FORCED_BASE_URL = 'https://api.kvk.nl/test/api'
const FORCED_API_KEY = 'l7xx1f2691f2520d487b902f4e0b57a0b197'

const getBaseUrl = () => FORCED_BASE_URL
const getApiKey = () => FORCED_API_KEY

const toCleanString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

const pickFirstString = (...values: Array<unknown>) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    if (Array.isArray(value)) {
      const first = value.find(
        (entry) => typeof entry === 'string' && entry.trim(),
      )
      if (typeof first === 'string') return first.trim()
    }
  }
  return undefined
}

const mapAddress = (address?: {
  type?: string
  straatnaam?: string
  huisnummer?: number | string
  huisnummerToevoeging?: string
  toevoegingAdres?: string
  huisletter?: string
  postcode?: string
  plaats?: string
  land?: string
  postbusnummer?: number | string
}) => {
  if (!address) return undefined
  const postbus = address.postbusnummer
    ? String(address.postbusnummer)
    : ''
  const street = address.straatnaam ?? (postbus ? 'Postbus' : '')
  const houseNumber =
    address.huisnummer !== undefined
      ? String(address.huisnummer)
      : postbus
  const addition =
    address.huisnummerToevoeging ??
    address.toevoegingAdres ??
    address.huisletter ??
    undefined

  const postcode = address.postcode ?? ''
  const city = address.plaats ?? ''
  if (!street && !houseNumber && !postcode && !city) return undefined
  return {
    street: street ?? '',
    houseNumber: houseNumber ?? '',
    addition,
    postcode,
    city,
    country: address.land ?? '',
  }
}

const findAddressByType = (
  addresses: Array<{ type?: string }>,
  type: string,
) =>
  addresses.find(
    (address) => (address.type ?? '').toLowerCase() === type,
  )

const extractAddresses = (
  addresses: Array<{
    type?: string
    straatnaam?: string
    huisnummer?: number | string
    huisnummerToevoeging?: string
    toevoegingAdres?: string
    huisletter?: string
    postcode?: string
    plaats?: string
    land?: string
    postbusnummer?: number | string
  }>,
) => {
  const postal =
    findAddressByType(addresses, 'correspondentieadres') ??
    findAddressByType(addresses, 'postadres') ??
    findAddressByType(addresses, 'postbusadres')
  const visiting = findAddressByType(addresses, 'bezoekadres')

  return {
    postalAddress: mapAddress(postal) ?? undefined,
    visitingAddress:
      mapAddress(visiting) ??
      mapAddress(addresses[0]) ??
      undefined,
  }
}

const parseCompanyActive = (data: {
  materieleRegistratie?: { datumEinde?: string; datumAanvang?: string }
  formeleRegistratiedatum?: string
}) => {
  const endDate = data.materieleRegistratie?.datumEinde
  if (endDate) return 'inactive' as const
  if (
    data.materieleRegistratie?.datumAanvang ||
    data.formeleRegistratiedatum
  ) {
    return 'active' as const
  }
  return 'unknown' as const
}

const parseFullAddress = (value: string): KvkAddress | undefined => {
  const cleaned = value.trim()
  const match = cleaned.match(
    /^(.+?)\s+(\d{1,6})\s*([A-Za-z0-9\-\/]*)?\s+(\d{4}\s?[A-Z]{2})\s+(.+)$/,
  )
  if (!match) return undefined
  return {
    street: match[1].trim(),
    houseNumber: match[2].trim(),
    addition: match[3]?.trim() || undefined,
    postcode: match[4].replace(/\s+/g, '').toUpperCase(),
    city: match[5].trim(),
    country: 'Nederland',
  }
}

const fetchWithTimeout = async (url: string, apiKey: string) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { apikey: apiKey },
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeout)
  }
}

export default async function handler(request: Request) {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: JSON_HEADERS })
    }

    if (request.method !== 'GET') {
      return json(405, { error: 'Method not allowed' })
    }

    const url = new URL(request.url, 'http://localhost')
    const kvkNumber = url.searchParams.get('kvkNumber')?.trim() ?? ''
    const vestigingsNumber = url.searchParams.get('vestigingsNumber')?.trim() ?? ''
    if (!/^\d{8}$/.test(kvkNumber)) {
      return json(400, { error: 'KvK-nummer is ongeldig.' })
    }

    const apiKey = getApiKey()
    if (!apiKey) {
      return json(500, { error: 'KVK_API_KEY ontbreekt op de server.' })
    }

    let basisResponse: Response
    try {
      basisResponse = await fetchWithTimeout(
        `${getBaseUrl()}/v1/basisprofielen/${kvkNumber}`,
        apiKey,
      )
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') {
        return json(504, { error: 'KVK profiel duurde te lang.' })
      }
      throw error
    }

    if (basisResponse.status === 404) {
      return json(404, { error: 'Geen KVK-profiel gevonden.' })
    }

    if (!basisResponse.ok) {
      const details = await basisResponse.text()
      return json(basisResponse.status, {
        error: 'KVK-profiel ophalen mislukt.',
        details: details.slice(0, 800),
      })
    }

    const data = (await basisResponse.json()) as {
      kvkNummer?: string
      naam?: string
      statutaireNaam?: string
      formeleRegistratiedatum?: string
      materieleRegistratie?: { datumAanvang?: string; datumEinde?: string }
      handelsnamen?: Array<{ naam?: string }>
      communicatiegegevens?: {
        emailadres?: string
        emailadressen?: string[]
        telefoonnummer?: string
        telefoonnummers?: string[]
        website?: string
        websites?: string[]
      }
      _embedded?: {
        hoofdvestiging?: {
          adressen?: Array<{
            type?: string
            straatnaam?: string
            huisnummer?: number
            huisnummerToevoeging?: string
            toevoegingAdres?: string
            huisletter?: string
            postcode?: string
            plaats?: string
            land?: string
            postbusnummer?: number
          }>
          communicatiegegevens?: {
            emailadres?: string
            emailadressen?: string[]
            telefoonnummer?: string
            telefoonnummers?: string[]
            website?: string
            websites?: string[]
          }
        }
        eigenaar?: {
          rechtsvorm?: string
          uitgebreideRechtsvorm?: string
        }
      }
    }

    let addresses = data._embedded?.hoofdvestiging?.adressen ?? []
    let vestigingContact: {
      emailadres?: string
      emailadressen?: string[]
      telefoonnummer?: string
      telefoonnummers?: string[]
      website?: string
      websites?: string[]
    } | undefined

    if (/^\d{12}$/.test(vestigingsNumber)) {
      try {
        const vestResponse = await fetchWithTimeout(
          `${getBaseUrl()}/v1/vestigingsprofielen/${vestigingsNumber}`,
          apiKey,
        )
        if (vestResponse.ok) {
          const vestData = (await vestResponse.json()) as {
            adressen?: Array<{
              type?: string
              straatnaam?: string
              huisnummer?: number
              huisnummerToevoeging?: string
              toevoegingAdres?: string
              huisletter?: string
              postcode?: string
              plaats?: string
              land?: string
              postbusnummer?: number
            }>
            communicatiegegevens?: {
              emailadres?: string
              emailadressen?: string[]
              telefoonnummer?: string
              telefoonnummers?: string[]
              website?: string
              websites?: string[]
            }
          }
          if (vestData.adressen?.length) {
            addresses = vestData.adressen
          }
          vestigingContact = vestData.communicatiegegevens
        }
      } catch {
        // ignore vestigingsprofiel errors
      }
    }

    let establishments: KvkEstablishment[] = []
    try {
      const vestigingenResponse = await fetchWithTimeout(
        `${getBaseUrl()}/v1/basisprofielen/${kvkNumber}/vestigingen`,
        apiKey,
      )
      if (vestigingenResponse.ok) {
        const vestigingenData = (await vestigingenResponse.json()) as {
          vestigingen?: Array<{
            vestigingsnummer?: string
            eersteHandelsnaam?: string
            naam?: string
            volledigAdres?: string
          }>
        }
        establishments = (vestigingenData.vestigingen ?? [])
          .map((entry) => {
            const address = entry.volledigAdres
              ? parseFullAddress(entry.volledigAdres)
              : undefined
            return {
              name: entry.eersteHandelsnaam ?? entry.naam ?? '',
              vestigingsNumber: entry.vestigingsnummer ?? '',
              address,
            }
          })
          .filter((entry) => entry.name || entry.vestigingsNumber)
      }
    } catch {
      // ignore vestigingen list errors
    }

    const { postalAddress, visitingAddress } = extractAddresses(addresses)
    const tradeNames = (data.handelsnamen ?? [])
      .map((entry) => toCleanString(entry.naam))
      .filter(Boolean)

    const companyActive = parseCompanyActive(data)
    const warnings: string[] = []
    if (establishments.length > 1 && !/^\d{12}$/.test(vestigingsNumber)) {
      warnings.push('Meerdere vestigingen: hoofdvestiging gekozen.')
    }
    if (companyActive === 'inactive') {
      warnings.push('Bedrijf niet actief.')
    }
    warnings.push('Geen tekenbevoegde gegevens beschikbaar.')

    const contactSource =
      vestigingContact ??
      data._embedded?.hoofdvestiging?.communicatiegegevens ??
      data.communicatiegegevens

    const profile: KvkProfile = {
      kvkNumber: data.kvkNummer ?? kvkNumber,
      legalName: data.statutaireNaam ?? data.naam ?? '',
      tradeName: tradeNames[0] ?? data.naam ?? '',
      tradeNames,
      legalForm:
        data._embedded?.eigenaar?.rechtsvorm ??
        data._embedded?.eigenaar?.uitgebreideRechtsvorm ??
        '',
      companyActive,
      mainVisitingAddress: visitingAddress,
      postalAddress: postalAddress,
      signatories: [],
      establishments,
      warnings,
      contactEmail: pickFirstString(
        contactSource?.emailadres,
        contactSource?.emailadressen,
      ),
      contactPhone: pickFirstString(
        contactSource?.telefoonnummer,
        contactSource?.telefoonnummers,
      ),
      website: pickFirstString(
        contactSource?.website,
        contactSource?.websites,
      ),
    }

    return json(200, profile)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout'
    return json(500, { error: 'KVK profiel crashed.', details: message })
  }
}
