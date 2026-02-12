type InputType = 'text' | 'image' | 'pdf_pages'

interface ExtractOptions {
  source?: 'OCR_PHOTO' | 'OCR_PDF' | 'EXCEL' | 'MANUAL'
  allowMultiple?: boolean
  splitMode?: 'auto' | 'none'
}

interface ExtractRequestBody {
  inputType: InputType
  text?: string
  imageDataUrl?: string
  pages?: string[]
  fileName?: string
  mimeType?: string
  options?: ExtractOptions
}

type AnyRecord = Record<string, unknown>
type AiBackend = 'openai' | 'groq'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
} as const

const MAX_REQUEST_BODY_CHARS = 12_000_000
const MAX_TEXT_LENGTH = 250_000
const MAX_IMAGE_DATA_URL_CHARS = 8_000_000
const MAX_PDF_PAGES = 20
const MAX_PAGE_DATA_URL_CHARS = 6_000_000
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 300

const PRODUCT_OPTIONS = new Set(['Elektra', 'Gas', 'Water', 'Warmte', 'Onbekend'])
const MARKET_SEGMENT_OPTIONS = new Set(['KV', 'GV', 'Onbekend'])
const TELEMETRY_TYPE_OPTIONS = new Set([
  'Onbekend',
  'Slimme meter',
  'Maandbemeten',
  'Jaarbemeten',
  'Continu (kwartierwaarden)',
])

const RATE_LIMIT_STORE = new Map<string, { count: number; resetAt: number }>()

export const config = {
  runtime: 'edge',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  })

const getClientIp = (request: Request) => {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip') ?? 'unknown'
}

const isRateLimited = (ip: string, now: number) => {
  const existing = RATE_LIMIT_STORE.get(ip)
  if (!existing || now > existing.resetAt) {
    RATE_LIMIT_STORE.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    })
    return false
  }
  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true
  }
  existing.count += 1
  RATE_LIMIT_STORE.set(ip, existing)
  return false
}

const isObject = (value: unknown): value is AnyRecord =>
  typeof value === 'object' && value !== null

const isDataUrl = (value: unknown) =>
  typeof value === 'string' && value.startsWith('data:')

const getAiBackend = (): AiBackend => {
  const configured = (
    process.env.AI_BACKEND ??
    process.env.VITE_AI_BACKEND ??
    'openai'
  ).toLowerCase()
  return configured === 'groq' ? 'groq' : 'openai'
}

const parseRequestBody = (value: unknown): ExtractRequestBody | null => {
  if (!isObject(value)) return null
  const inputType = value.inputType
  if (inputType !== 'text' && inputType !== 'image' && inputType !== 'pdf_pages') {
    return null
  }
  return {
    inputType,
    text: typeof value.text === 'string' ? value.text : undefined,
    imageDataUrl: typeof value.imageDataUrl === 'string' ? value.imageDataUrl : undefined,
    pages: Array.isArray(value.pages)
      ? value.pages.filter((item): item is string => typeof item === 'string')
      : undefined,
    fileName: typeof value.fileName === 'string' ? value.fileName : undefined,
    mimeType: typeof value.mimeType === 'string' ? value.mimeType : undefined,
    options: isObject(value.options) ? (value.options as ExtractOptions) : undefined,
  }
}

const extractJsonFromText = (text: string) => {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    // continue
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1])
    } catch {
      // continue
    }
  }

  const firstCurly = trimmed.indexOf('{')
  const lastCurly = trimmed.lastIndexOf('}')
  if (firstCurly >= 0 && lastCurly > firstCurly) {
    const candidate = trimmed.slice(firstCurly, lastCurly + 1)
    try {
      return JSON.parse(candidate)
    } catch {
      return null
    }
  }
  return null
}

const normalizeEnum = (value: unknown, allowed: Set<string>, fallback: string) => {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  if (allowed.has(normalized)) return normalized

  const lower = normalized.toLowerCase()
  if (allowed === PRODUCT_OPTIONS) {
    if (lower.includes('elek')) return 'Elektra'
    if (lower.includes('gas')) return 'Gas'
    if (lower.includes('water')) return 'Water'
    if (lower.includes('warm')) return 'Warmte'
  }
  if (allowed === MARKET_SEGMENT_OPTIONS) {
    if (/\bkv\b/i.test(normalized)) return 'KV'
    if (/\bgv\b/i.test(normalized)) return 'GV'
  }
  if (allowed === TELEMETRY_TYPE_OPTIONS) {
    if (lower.includes('slim')) return 'Slimme meter'
    if (lower.includes('maand')) return 'Maandbemeten'
    if (lower.includes('jaar')) return 'Jaarbemeten'
    if (lower.includes('continu') || lower.includes('kwartier')) {
      return 'Continu (kwartierwaarden)'
    }
  }
  return fallback
}

const toCleanString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

const normalizeBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['ja', 'yes', 'true', '1'].includes(normalized)) return true
    if (['nee', 'no', 'false', '0'].includes(normalized)) return false
  }
  return fallback
}

const findEanCodes = (text: string) => {
  const matches = text.match(/(?:\d[\s-]?){18}/g) ?? []
  return Array.from(
    new Set(
      matches
        .map((match) => match.replace(/\D/g, ''))
        .filter((value) => value.length === 18),
    ),
  )
}

const expandConnectionsByEans = (
  connections: AnyRecord[],
  eans: string[],
  source?: string,
) => {
  const uniqueEans = Array.from(new Set(eans)).filter(Boolean)
  if (uniqueEans.length === 0) return connections

  if (connections.length === 0) {
    return uniqueEans.map((ean) =>
      normalizeConnection({ eanCode: ean }, source),
    )
  }

  if (connections.length === 1 && uniqueEans.length > 1) {
    const base = connections[0]
    return uniqueEans.map((ean) => ({ ...base, eanCode: ean }))
  }

  const existing = new Set(
    connections
      .map((connection) =>
        typeof connection.eanCode === 'string'
          ? connection.eanCode.replace(/\D/g, '')
          : '',
      )
      .filter(Boolean),
  )
  const remaining = uniqueEans.filter((ean) => !existing.has(ean))
  const updated = connections.map((connection) => {
    if (!connection.eanCode && remaining.length > 0) {
      const ean = remaining.shift()
      if (ean) return { ...connection, eanCode: ean }
    }
    return connection
  })

  if (remaining.length > 0) {
    const base = connections[0]
    for (const ean of remaining) {
      updated.push({ ...base, eanCode: ean })
    }
  }

  return updated
}

const normalizeConnection = (raw: unknown, defaultSource?: string) => {
  const input = isObject(raw) ? raw : {}
  const eanDigits = toCleanString(input.eanCode).replace(/\D/g, '')
  const eanCode = eanDigits.length >= 18 ? eanDigits.slice(0, 18) : eanDigits

  const telemetryCodeRaw = toCleanString(input.telemetryCode).toUpperCase()
  const telemetryCode =
    telemetryCodeRaw ||
    (toCleanString(input.telemetryType) ? 'ONBEKEND' : 'ONBEKEND')

  const supplier = toCleanString(input.supplier)
  const supplierSafe =
    supplier.toLowerCase() === 'impact energy' ? '' : supplier

  const connection: AnyRecord = {
    eanCode,
    product: normalizeEnum(input.product, PRODUCT_OPTIONS, 'Onbekend'),
    tenaamstelling: toCleanString(input.tenaamstelling),
    kvkNumber: toCleanString(input.kvkNumber).replace(/\D/g, ''),
    iban: toCleanString(input.iban).replace(/\s+/g, '').toUpperCase(),
    authorizedSignatory: toCleanString(input.authorizedSignatory),
    telemetryCode,
    telemetryType: normalizeEnum(
      input.telemetryType,
      TELEMETRY_TYPE_OPTIONS,
      'Onbekend',
    ),
    deliveryStreet: toCleanString(input.deliveryStreet),
    deliveryHouseNumber: toCleanString(input.deliveryHouseNumber),
    deliveryHouseNumberAddition: toCleanString(input.deliveryHouseNumberAddition),
    deliveryPostcode: toCleanString(input.deliveryPostcode).toUpperCase(),
    deliveryCity: toCleanString(input.deliveryCity),
    invoiceSameAsDelivery: normalizeBoolean(input.invoiceSameAsDelivery, true),
    invoiceStreet: toCleanString(input.invoiceStreet),
    invoiceHouseNumber: toCleanString(input.invoiceHouseNumber),
    invoiceHouseNumberAddition: toCleanString(input.invoiceHouseNumberAddition),
    invoicePostcode: toCleanString(input.invoicePostcode).toUpperCase(),
    invoiceCity: toCleanString(input.invoiceCity),
    gridOperator: toCleanString(input.gridOperator),
    supplier: supplierSafe,
    marketSegment: normalizeEnum(input.marketSegment, MARKET_SEGMENT_OPTIONS, 'Onbekend'),
    meterNumber: toCleanString(input.meterNumber),
    notes: toCleanString(input.notes),
    addressWarning: toCleanString(input.addressWarning),
  }

  if (defaultSource) {
    connection.source = defaultSource
  }

  return connection
}

const pickConnections = (
  parsed: unknown,
  allowMultiple: boolean,
  inputType: InputType,
  source?: string,
) => {
  if (!isObject(parsed)) {
    return { connections: [] as AnyRecord[], warning: undefined as string | undefined }
  }

  let warning = toCleanString(parsed.warning)
  const candidate = parsed.connections ?? parsed.connection
  const rawArray = Array.isArray(candidate) ? candidate : candidate ? [candidate] : []
  let normalized = rawArray.map((item) => normalizeConnection(item, source))

  if (!allowMultiple) {
    normalized = normalized.slice(0, 1)
  }

  if (inputType === 'pdf_pages' && normalized.length === 0) {
    warning = warning || 'AI extract gaf geen velden terug voor deze PDF.'
  }

  return { connections: normalized, warning: warning || undefined }
}

const getResponseText = (responseJson: unknown) => {
  if (isObject(responseJson) && typeof responseJson.output_text === 'string') {
    return responseJson.output_text
  }
  if (!isObject(responseJson)) return ''

  const output = responseJson.output
  if (!Array.isArray(output)) return ''

  const collected: string[] = []
  for (const item of output) {
    if (!isObject(item) || !Array.isArray(item.content)) continue
    for (const contentItem of item.content) {
      if (!isObject(contentItem)) continue
      if (typeof contentItem.text === 'string') {
        collected.push(contentItem.text)
      } else if (
        isObject(contentItem.text) &&
        typeof contentItem.text.value === 'string'
      ) {
        collected.push(contentItem.text.value)
      }
    }
  }
  return collected.join('\n').trim()
}

const getChatCompletionText = (responseJson: unknown) => {
  if (!isObject(responseJson)) return ''
  const choices = responseJson.choices
  if (!Array.isArray(choices)) return ''

  const collected: string[] = []
  for (const choice of choices) {
    if (!isObject(choice) || !isObject(choice.message)) continue
    const content = choice.message.content
    if (typeof content === 'string') {
      collected.push(content)
      continue
    }
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!isObject(part)) continue
      if (typeof part.text === 'string') {
        collected.push(part.text)
      }
    }
  }
  return collected.join('\n').trim()
}

const buildUserContent = (body: ExtractRequestBody) => {
  const content: Array<Record<string, unknown>> = []
  const options = body.options ?? {}
  const detectedEans =
    body.inputType === 'text' && body.text
      ? findEanCodes(body.text)
      : []

  content.push({
    type: 'input_text',
    text: [
      'Extracteer energie-aansluiting velden in JSON.',
      `Bestand: ${body.fileName ?? 'onbekend'}`,
      `InputType: ${body.inputType}`,
      `allowMultiple: ${options.allowMultiple === true ? 'true' : 'false'}`,
      `splitMode: ${options.splitMode ?? 'auto'}`,
      `source: ${options.source ?? 'OCR_PHOTO'}`,
      detectedEans.length > 0
        ? `Detected EANs: ${detectedEans.join(', ')}`
        : 'Detected EANs: none',
    ].join('\n'),
  })

  if (body.inputType === 'text' && body.text) {
    content.push({
      type: 'input_text',
      text: body.text,
    })
  }

  if (body.inputType === 'image' && body.imageDataUrl) {
    content.push({
      type: 'input_image',
      image_url: body.imageDataUrl,
    })
  }

  if (body.inputType === 'pdf_pages' && body.pages) {
    for (const page of body.pages) {
      content.push({
        type: 'input_image',
        image_url: page,
      })
    }
  }

  return content
}

const buildGroqUserText = (body: ExtractRequestBody) => {
  const options = body.options ?? {}
  const detectedEans =
    body.inputType === 'text' && body.text
      ? findEanCodes(body.text)
      : []
  const metadata = [
    'Extracteer energie-aansluiting velden in JSON.',
    `Bestand: ${body.fileName ?? 'onbekend'}`,
    `InputType: ${body.inputType}`,
    `allowMultiple: ${options.allowMultiple === true ? 'true' : 'false'}`,
    `splitMode: ${options.splitMode ?? 'auto'}`,
    `source: ${options.source ?? 'OCR_PHOTO'}`,
    detectedEans.length > 0
      ? `Detected EANs: ${detectedEans.join(', ')}`
      : 'Detected EANs: none',
  ].join('\n')

  const textInput =
    body.inputType === 'text' && body.text
      ? body.text
      : 'Geen expliciete tekst ontvangen.'

  return `${metadata}\n\nDocumenttekst:\n${textInput}`
}

const SYSTEM_PROMPT = `
Je bent een intelligente energie-document analist voor de Impact Energy intake-tool.

CONTEXT (ZEER BELANGRIJK):

Impact Energy is een energieconsultant.
Klanten (zoals vastgoedbeheerders met 50–100 panden) uploaden contracten en facturen.
De tool moet hen werk besparen.

DOEL:
De gebruiker wil:
PDF uploaden → JSON krijgen → Opslaan → Klaar.

Er mag zo min mogelijk handmatig gecorrigeerd worden.

Je taak is daarom:
- Document interpreteren
- Informatie afleiden waar logisch
- Zo volledig mogelijk invullen
- Alleen "Onbekend" gebruiken als het écht niet afleidbaar is

BELANGRIJKE REGELS:

1) Denk als energie-analist, niet als tekstparser.
2) Je MAG logisch afleiden als iets duidelijk impliciet is.
3) Gebruik context (verbruik, eenheden, tariefsoort, etc.)
4) Vul alle velden zo volledig mogelijk in.

EAN:
- 18 cijfers.
- Verwijder spaties/streepjes.
- Meerdere EAN’s = meerdere connections.

PRODUCT AFLEIDING:
- kWh → Elektra
- m3 → Gas
- GJ → Warmte
- m3 water → Water

MARKTSEGMENT AFLEIDING:
- Groot verbruik (bijv. >50.000 kWh elektra of >25.000 m3 gas) → GV
- Klein verbruik → KV
- Als niet duidelijk → redelijke inschatting

TELEMETRIE:
- Als kwartierwaarden of meetdienst vermeld → waarschijnlijk GV/continu
- Als slimme meter genoemd → Slimme meter
- Zo niet duidelijk → redelijke inschatting

ADRES LOGICA:
- Prioriteit: Leveringsadres / Aansluitadres
- Factuuradres alleen als expliciet gelabeld
- Leverancier- of netbeheerder-adressen NIET gebruiken als leveringsadres
- Als meerdere adressen mogelijk: kies meest waarschijnlijke en zet uitleg in notes

IBAN:
- Vul alleen klant-IBAN in
- Leverancier-IBAN niet gebruiken

LEVERANCIER:
- Gebruik de daadwerkelijke energieleverancier
- NOOIT standaard "Impact Energy"

MULTIPLE EAN REGEL:
- Elke unieke EAN = aparte connection
- Zelfde adres mag herhaald worden

ONZEKERHEID:
- Alleen "Onbekend" gebruiken als er echt geen logische afleiding mogelijk is.
- Gebruik "notes" voor redenering indien nodig.

OUTPUT:
Geef ALLEEN geldige JSON.
Geen markdown.
Geen uitleg.

Schema:

{
  "connections": [
    {
      "eanCode": "",
      "product": "Onbekend",
      "tenaamstelling": "",
      "kvkNumber": "",
      "iban": "",
      "authorizedSignatory": "",
      "telemetryCode": "ONBEKEND",
      "telemetryType": "Onbekend",
      "deliveryStreet": "",
      "deliveryHouseNumber": "",
      "deliveryHouseNumberAddition": "",
      "deliveryPostcode": "",
      "deliveryCity": "",
      "invoiceSameAsDelivery": true,
      "invoiceStreet": "",
      "invoiceHouseNumber": "",
      "invoiceHouseNumberAddition": "",
      "invoicePostcode": "",
      "invoiceCity": "",
      "gridOperator": "",
      "supplier": "",
      "marketSegment": "Onbekend",
      "meterNumber": "",
      "notes": "",
      "addressWarning": ""
    }
  ],
  "warning": ""
}
`.trim()

export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: JSON_HEADERS })
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const ip = getClientIp(request)
  if (isRateLimited(ip, Date.now())) {
    return json(429, {
      error: 'Te veel verzoeken. Wacht even en probeer opnieuw.',
    })
  }

  const rawBody = await request.text()
  if (rawBody.length > MAX_REQUEST_BODY_CHARS) {
    return json(413, {
      error: "Bestand te groot voor AI-extract. Gebruik kleinere scans of minder pagina's.",
    })
  }

  let parsedBodyUnknown: unknown
  try {
    parsedBodyUnknown = JSON.parse(rawBody)
  } catch {
    return json(400, { error: 'Ongeldige JSON body.' })
  }

  const body = parseRequestBody(parsedBodyUnknown)
  if (!body) {
    return json(400, { error: 'Ongeldige payload.' })
  }

  if (body.inputType === 'text') {
    if (!body.text || body.text.trim().length === 0) {
      return json(400, { error: 'Text input ontbreekt.' })
    }
    if (body.text.length > MAX_TEXT_LENGTH) {
      return json(413, { error: 'Text input is te lang voor AI-extract.' })
    }
  }

  if (body.inputType === 'image') {
    if (!isDataUrl(body.imageDataUrl)) {
      return json(400, { error: 'Image data-url ontbreekt of is ongeldig.' })
    }
    if ((body.imageDataUrl?.length ?? 0) > MAX_IMAGE_DATA_URL_CHARS) {
      return json(413, { error: 'Afbeelding is te groot voor AI-extract.' })
    }
  }

  if (body.inputType === 'pdf_pages') {
    if (!Array.isArray(body.pages) || body.pages.length === 0) {
      return json(400, { error: 'PDF pagina-data ontbreekt.' })
    }
    if (body.pages.length > MAX_PDF_PAGES) {
      return json(413, {
        error: `PDF heeft te veel pagina's voor AI-extract (max ${MAX_PDF_PAGES}).`,
      })
    }
    const tooLargePage = body.pages.some(
      (page) => !isDataUrl(page) || page.length > MAX_PAGE_DATA_URL_CHARS,
    )
    if (tooLargePage) {
      return json(413, {
        error: 'Minstens 1 PDF-pagina is te groot of ongeldig voor AI-extract.',
      })
    }
  }

  const aiBackend = getAiBackend()
  if (aiBackend === 'groq' && body.inputType !== 'text') {
    return json(400, {
      error:
        'Groq backend ondersteunt hier alleen text input. Zet VITE_AI_BACKEND=groq zodat frontend eerst OCR tekst stuurt.',
    })
  }

  const openAiKey = process.env.OPENAI_API_KEY
  const groqKey = process.env.GROQ_API_KEY
  const allowMultiple = body.options?.allowMultiple === true
  let response: Response

  if (aiBackend === 'groq') {
    if (!groqKey) {
      return json(500, {
        error:
          'GROQ_API_KEY ontbreekt op de server. Zet deze in je serverless environment variables.',
      })
    }

    const groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
    const groqRequestBody = {
      model: groqModel,
      temperature: 0,
      max_tokens: 1800,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: buildGroqUserText(body),
        },
      ],
    }

    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify(groqRequestBody),
    })
  } else {
    if (!openAiKey) {
      return json(500, {
        error:
          'OPENAI_API_KEY ontbreekt op de server. Zet deze in je serverless environment variables.',
      })
    }

    const openAiModel = process.env.OPENAI_MODEL || 'gpt-4.1-mini'
    const openAiRequestBody = {
      model: openAiModel,
      temperature: 0,
      max_output_tokens: 1800,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: SYSTEM_PROMPT }],
        },
        {
          role: 'user',
          content: buildUserContent(body),
        },
      ],
    }

    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify(openAiRequestBody),
    })
  }

  if (!response.ok) {
    const details = await response.text()
    const upstreamStatus = response.status
    const providerLabel = aiBackend === 'groq' ? 'Groq' : 'OpenAI'
    const message =
      upstreamStatus === 401
        ? `${providerLabel} API-key ongeldig of ingetrokken.`
        : upstreamStatus === 429
        ? `${providerLabel} limiet bereikt. Probeer later opnieuw of controleer je quota.`
        : upstreamStatus === 400
        ? `${providerLabel} request ongeldig. Controleer bestandsgrootte of payload.`
        : 'AI-extract endpoint fout.'

    return json(upstreamStatus, {
      error: message,
      details: details.slice(0, 1200),
    })
  }

  const responseJson = (await response.json()) as unknown
  const outputText =
    aiBackend === 'groq'
      ? getChatCompletionText(responseJson)
      : getResponseText(responseJson)
  if (!outputText) {
    return json(502, {
      error: 'AI gaf geen leesbare output terug.',
    })
  }

  const extractedJson = extractJsonFromText(outputText)
  if (!extractedJson) {
    return json(502, {
      error: 'AI-output was geen geldige JSON.',
    })
  }

  let result = pickConnections(
    extractedJson,
    allowMultiple,
    body.inputType,
    body.options?.source,
  )

  if (allowMultiple && typeof body.text === 'string') {
    const eans = findEanCodes(body.text)
    if (eans.length > 1) {
      const expanded = expandConnectionsByEans(
        result.connections,
        eans,
        body.options?.source,
      )
      if (expanded.length !== result.connections.length) {
        result = {
          ...result,
          connections: expanded,
          warning:
            result.warning ??
            'Meerdere EAN-codes gevonden. Aansluitingen zijn opgesplitst.',
        }
      }
    }
  }

  return json(200, result)
}

