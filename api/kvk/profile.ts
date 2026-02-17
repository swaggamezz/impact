type KvkProfile = {
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
  signatories: Array<{ name: string; role?: string }>
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

const pickAddress = (
  addresses: Array<{
    type?: string
    straatnaam?: string
    huisnummer?: number | string
    huisnummerToevoeging?: string
    huisletter?: string
    postcode?: string
    plaats?: string
  }>,
) => {
  const byType = (type: string) =>
    addresses.find(
      (address) => (address.type ?? '').toLowerCase() === type,
    )
  return (
    byType('correspondentieadres') ||
    byType('bezoekadres') ||
    addresses[0]
  )
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
    if (!/^\d{8}$/.test(kvkNumber)) {
      return json(400, { error: 'KvK-nummer is ongeldig.' })
    }

    const apiKey = getApiKey()
    if (!apiKey) {
      return json(500, { error: 'KVK_API_KEY ontbreekt op de server.' })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(
        `${getBaseUrl()}/v1/basisprofielen/${kvkNumber}`,
        {
          headers: { apikey: apiKey },
          signal: controller.signal,
        },
      )
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') {
        return json(504, { error: 'KVK profiel duurde te lang.' })
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }

    if (response.status === 404) {
      return json(404, { error: 'Geen KVK-profiel gevonden.' })
    }

    if (!response.ok) {
      const details = await response.text()
      return json(response.status, {
        error: 'KVK-profiel ophalen mislukt.',
        details: details.slice(0, 800),
      })
    }

    const data = (await response.json()) as {
      kvkNummer?: string
      naam?: string
      statutaireNaam?: string
      handelsnamen?: Array<{ naam?: string }>
      _embedded?: {
        hoofdvestiging?: {
          adressen?: Array<{
            type?: string
            straatnaam?: string
            huisnummer?: number
            huisnummerToevoeging?: string
            huisletter?: string
            postcode?: string
            plaats?: string
          }>
        }
        eigenaar?: {
          rechtsvorm?: string
          uitgebreideRechtsvorm?: string
        }
      }
    }

    const addresses = data._embedded?.hoofdvestiging?.adressen ?? []
    const address = pickAddress(addresses)

    const profile: KvkProfile = {
      kvkNumber: data.kvkNummer ?? kvkNumber,
      legalName: data.statutaireNaam ?? data.naam ?? '',
      tradeName: data.handelsnamen?.[0]?.naam ?? data.naam ?? '',
      legalForm:
        data._embedded?.eigenaar?.rechtsvorm ??
        data._embedded?.eigenaar?.uitgebreideRechtsvorm ??
        '',
      address: {
        street: address?.straatnaam ?? '',
        houseNumber:
          address?.huisnummer !== undefined ? String(address.huisnummer) : '',
        houseNumberAddition:
          address?.huisnummerToevoeging ?? address?.huisletter ?? '',
        postcode: address?.postcode ?? '',
        city: address?.plaats ?? '',
      },
      signatories: [],
    }

    return json(200, profile)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout'
    return json(500, { error: 'KVK profiel crashed.', details: message })
  }
}
