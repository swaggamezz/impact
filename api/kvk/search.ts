type KvkSearchItem = {
  kvkNumber: string
  name: string
  city?: string
  type?: string
  active?: boolean
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

export default async function handler(request: Request) {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: JSON_HEADERS })
    }

    if (request.method !== 'GET') {
      return json(405, { error: 'Method not allowed' })
    }

    const url = new URL(request.url, 'http://localhost')
    const query = url.searchParams.get('q')?.trim() ?? ''
    if (!query) {
      return json(400, { error: 'Query ontbreekt.' })
    }
    const limit = Math.min(
      10,
      Math.max(1, Number(url.searchParams.get('limit') ?? 10)),
    )

    const apiKey = getApiKey()
    if (!apiKey) {
      return json(500, { error: 'KVK_API_KEY ontbreekt op de server.' })
    }

    const isKvkNumber = /^\d{8}$/.test(query)
    const params = new URLSearchParams()
    if (isKvkNumber) {
      params.set('kvkNummer', query)
    } else {
      params.set('naam', query)
    }
    params.set('resultatenPerPagina', String(limit))
    params.set('pagina', '1')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(
        `${getBaseUrl()}/v2/zoeken?${params.toString()}`,
        {
          headers: { apikey: apiKey },
          signal: controller.signal,
        },
      )
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') {
        return json(504, { error: 'KVK zoeken duurde te lang.' })
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }

    if (response.status === 404) {
      return json(200, { items: [] })
    }

    if (!response.ok) {
      const details = await response.text()
      return json(response.status, {
        error: 'KVK zoeken mislukt.',
        details: details.slice(0, 800),
      })
    }

    const data = (await response.json()) as {
      resultaten?: Array<{
        kvkNummer?: string
        naam?: string
        type?: string
        actief?: boolean
        adres?: { binnenlandsAdres?: { plaats?: string } }
      }>
    }

    const items: KvkSearchItem[] = (data.resultaten ?? []).slice(0, limit).map(
      (item) => ({
        kvkNumber: item.kvkNummer ?? '',
        name: item.naam ?? '',
        city: item.adres?.binnenlandsAdres?.plaats ?? '',
        type: item.type ?? '',
        active: item.actief ?? true,
      }),
    )

    return json(200, { items })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout'
    return json(500, { error: 'KVK zoeken crashed.', details: message })
  }
}
