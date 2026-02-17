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

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  })

const getBaseUrl = () => {
  const override = (process.env.KVK_BASE_URL ?? '').trim()
  if (override) {
    return override.replace(/\/$/, '')
  }
  const env = (process.env.KVK_ENV ?? 'test').toLowerCase()
  return env === 'prod'
    ? 'https://api.kvk.nl/api'
    : 'https://api.kvk.nl/test/api'
}

const getApiKey = () => {
  const env = (process.env.KVK_ENV ?? 'test').toLowerCase()
  if (process.env.KVK_API_KEY) return process.env.KVK_API_KEY
  if (env === 'test') return 'l7xx1f2691f2520d487b902f4e0b57a0b197'
  return undefined
}

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
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: JSON_HEADERS })
  }

  if (request.method !== 'GET') {
    return json(405, { error: 'Method not allowed' })
  }

  const url = new URL(request.url)
  const kvkNumber = url.searchParams.get('kvkNumber')?.trim() ?? ''
  if (!/^\d{8}$/.test(kvkNumber)) {
    return json(400, { error: 'KvK-nummer is ongeldig.' })
  }

  const apiKey = getApiKey()
  if (!apiKey) {
    return json(500, { error: 'KVK_API_KEY ontbreekt op de server.' })
  }

  const response = await fetch(
    `${getBaseUrl()}/v1/basisprofielen/${kvkNumber}`,
    {
      headers: { apikey: apiKey },
    },
  )

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
}
