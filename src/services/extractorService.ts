import * as XLSX from 'xlsx'
import {
  CONNECTION_PRODUCTS,
  MARKET_SEGMENTS,
  TELEMETRY_CODE_UNKNOWN,
  createDraftConnection,
  type Connection,
  type ConnectionDraft,
  type ConnectionProduct,
  type ConnectionSource,
  type MarketSegment,
} from '../models/connection'

type ConnectionField = keyof Connection

const LABEL_ALIASES: Record<ConnectionField, string[]> = {
  id: ['id'],
  eanCode: [
    'ean',
    'ean code',
    'ean-code',
    'ean nr',
    'ean nummer',
    'aansluitnummer',
    'ean nummer',
  ],
  product: [
    'product',
    'energieproduct',
    'soort product',
    'energie type',
    'type product',
  ],
  tenaamstelling: [
    'tenaamstelling',
    'naam op contract',
    'naam op factuur',
    'contractant',
    'contract naam',
    'factuurnaam',
    'bedrijfsnaam',
    'klantnaam',
    'klant',
    'naam klant',
  ],
  kvkNumber: ['kvk', 'kvk nummer', 'kvk-nummer', 'kvk nr'],
  iban: ['iban', 'rekeningnummer', 'account number', 'bankrekening'],
  authorizedSignatory: [
    'tekenbevoegde',
    'tekenbevoegd',
    'tekenbevoegde volgens kvk',
    'vertegenwoordiger',
  ],
  department: ['afdeling', 'department', 'dept'],
  deliveryStreet: ['straat', 'straatnaam', 'straat naam', 'adres straat'],
  deliveryHouseNumber: ['huisnummer', 'huis nummer', 'hnr', 'nr', 'huisnr', 'huis nr'],
  deliveryHouseNumberAddition: [
    'toevoeging',
    'huisnummer toevoeging',
    'huisnr toevoeging',
    'bus',
    'bis',
    'app',
  ],
  deliveryPostcode: ['postcode', 'post code', 'postal code', 'zip'],
  deliveryCity: ['plaats', 'stad', 'city', 'woonplaats'],
  invoiceStreet: ['factuurstraat', 'straat factuur', 'factuuradres straat'],
  invoiceHouseNumber: ['factuur huisnummer', 'huisnummer factuur', 'factuur huis nr'],
  invoiceHouseNumberAddition: [
    'factuur toevoeging',
    'toevoeging factuur',
    'factuur bus',
  ],
  invoicePostcode: ['factuur postcode', 'postcode factuur'],
  invoiceCity: ['factuur plaats', 'plaats factuur'],
  gridOperator: ['netbeheerder', 'grid operator', 'netbeheerder naam'],
  supplier: ['leverancier', 'energieleverancier', 'supplier'],
  marketSegment: ['marktsegment', 'segment', 'kv/gv', 'markt segment', 'segmentatie'],
  telemetryCode: [
    'telemetriecode',
    'telemetrycode',
    'meetcode',
    'meet code',
  ],
  telemetryType: ['telemetrie', 'telemetry', 'telemetrie type', 'telemetrie aanwezig'],
  meterNumber: ['meternummer', 'meter nummer', 'meter nr'],
  annualUsageNormal: ['jaarverbruik hoog', 'jaarverbruik normaal', 'verbruik hoog', 'jaargebruik hoog'],
  annualUsageLow: ['jaarverbruik laag', 'verbruik laag', 'jaargebruik laag'],
  status: ['status', 'fase'],
  notes: ['notities', 'opmerking', 'remarks', 'opmerkingen'],
  createdAt: ['aangemaakt', 'created'],
  source: ['bron', 'source'],
  invoiceSameAsDelivery: ['factuuradres gelijk aan leveringsadres', 'factuuradres hetzelfde'],
  addressWarning: [],
}

const ADDRESS_LABELS = {
  delivery: ['leveringsadres', 'aansluitadres', 'adres aansluiting', 'adres aansluit', 'klantadres'],
  invoice: ['factuuradres', 'facturatieadres', 'billing address', 'postadres'],
}

const ADDRESS_IGNORE_WORDS = ['leverancier', 'netbeheerder', 'afzender']

const GENERIC_ADDRESS_ALIASES = ['adres', 'locatie adres', 'adres locatie', 'adresregel', 'adres regel']

const normalizeLabel = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const levenshtein = (a: string, b: string) => {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }
  return matrix[a.length][b.length]
}

const matchLabelToField = (label: string): ConnectionField | null => {
  const normalized = normalizeLabel(label)
  if (!normalized) return null

  if (normalized.includes('telemetrie') || normalized.includes('telemetry')) {
    if (normalized.includes('code') || normalized.includes('meet')) {
      return 'telemetryCode'
    }
    return 'telemetryType'
  }

  let bestField: ConnectionField | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const [field, aliases] of Object.entries(LABEL_ALIASES)) {
    for (const alias of aliases) {
      const aliasNormalized = normalizeLabel(alias)
      if (!aliasNormalized) continue
      if (normalized === aliasNormalized) return field as ConnectionField
      if (normalized.includes(aliasNormalized) || aliasNormalized.includes(normalized)) {
        if (normalized.length > 2) return field as ConnectionField
      }
      const distance = levenshtein(normalized, aliasNormalized)
      const score = distance / Math.max(normalized.length, aliasNormalized.length)
      if (score < bestScore) {
        bestScore = score
        bestField = field as ConnectionField
      }
    }
  }

  return bestScore <= 0.25 ? bestField : null
}

const normalizeEAN = (value: string) => value.replace(/\D/g, '').slice(0, 18)

const normalizePostcode = (value: string) => {
  const trimmed = value.trim().toUpperCase()
  const noSpace = trimmed.replace(/\s+/g, '')
  if (/^\d{4}[A-Z]{2}$/.test(noSpace)) {
    return `${noSpace.slice(0, 4)} ${noSpace.slice(4)}`
  }
  return trimmed
}

const normalizeProduct = (value: string): ConnectionProduct | undefined => {
  const normalized = value.toLowerCase()
  if (normalized.includes('elek')) return 'Elektra'
  if (normalized.includes('gas')) return 'Gas'
  if (normalized.includes('water')) return 'Water'
  if (normalized.includes('warm')) return 'Warmte'
  if (normalized.includes('onbek') || normalized.includes('unknown')) {
    return 'Onbekend'
  }
  return undefined
}

const normalizeMarketSegment = (value: string): MarketSegment | undefined => {
  const normalized = value.toLowerCase()
  const match = value.toUpperCase().match(/\b(KV|GV)\b/)
  if (match) return match[1] as MarketSegment
  if (
    normalized.includes('onbek') ||
    normalized.includes('nvt') ||
    normalized.includes('niet bekend') ||
    normalized.includes('unknown')
  ) {
    return 'Onbekend'
  }
  return undefined
}

const normalizeTelemetry = (value: string) => {
  const normalized = value.toLowerCase()
  if (normalized.includes('slim')) {
    return 'Slimme meter'
  }
  if (normalized.includes('maand')) {
    return 'Maandbemeten'
  }
  if (normalized.includes('jaar')) {
    return 'Jaarbemeten'
  }
  if (normalized.includes('continu') || normalized.includes('kwartier')) {
    return 'Continu (kwartierwaarden)'
  }
  if (
    normalized.includes('onbek') ||
    normalized.includes('niet bekend') ||
    normalized.includes('unknown') ||
    normalized.includes('onduidelijk') ||
    normalized.includes('ja') ||
    normalized.includes('aanwezig') ||
    normalized.includes('yes') ||
    normalized.includes('nee') ||
    normalized.includes('geen') ||
    normalized.includes('niet') ||
    normalized.includes('no')
  ) {
    return 'Onbekend'
  }
  if (
    normalized.trim() === 'telemetrie' ||
    normalized.trim() === 'telemetry'
  ) {
    return ''
  }
  return value.trim()
}

const normalizeTelemetryCode = (value: string) => {
  const normalized = value.trim()
  if (!normalized) return ''
  const lower = normalized.toLowerCase()
  if (
    lower === 'onbekend' ||
    lower === 'unknown' ||
    lower === 'nvt' ||
    lower === 'n.v.t.'
  ) {
    return TELEMETRY_CODE_UNKNOWN
  }
  return normalized.toUpperCase().replace(/\s+/g, '')
}

const normalizeIban = (value: string) =>
  value.replace(/\s+/g, '').toUpperCase()

const parseAddress = (value: string) => {
  const trimmed = value.trim()
  const cleaned = trimmed.split(',')[0].trim()
  if (!cleaned || cleaned.includes(':')) return null
  const digitCount = cleaned.replace(/\D/g, '').length
  if (digitCount > 6) return null
  const match = cleaned.match(/^(.+?)\s+(\d{1,6})\s*([A-Za-z0-9\-\/]*)?$/)
  if (!match) return null
  return {
    street: match[1].trim(),
    houseNumber: match[2],
    houseNumberAddition: match[3]?.trim() || undefined,
  }
}

const lineHasIgnoreWord = (line: string) => {
  const normalized = normalizeLabel(line)
  return ADDRESS_IGNORE_WORDS.some((word) =>
    normalized.includes(normalizeLabel(word)),
  )
}

const getValueAfterSeparator = (line: string) => {
  const match = line.match(/[:\-]\s*(.+)$/)
  return match?.[1]?.trim() ?? ''
}

const extractAddressCandidate = (lines: string[], index: number) => {
  const candidates = [
    getValueAfterSeparator(lines[index]),
    lines[index + 1],
    lines[index + 2],
    lines[index + 3],
  ].filter(Boolean) as string[]

  let address = null as ReturnType<typeof parseAddress> | null
  let postcodeCity: ReturnType<typeof findPostcodeAndCity> | null = null

  for (const candidate of candidates) {
    if (!address) {
      address = parseAddress(candidate)
    }
    if (!postcodeCity) {
      postcodeCity = findPostcodeAndCity(candidate, false)
    }
  }

  if (!address && !postcodeCity) return null

  return {
    street: address?.street,
    houseNumber: address?.houseNumber,
    houseNumberAddition: address?.houseNumberAddition,
    postcode: postcodeCity?.postcode,
    city: postcodeCity?.city,
    isSupplier: candidates.some((candidate) => lineHasIgnoreWord(candidate)),
  }
}

const selectAddressCandidate = (
  candidates: Array<
    ReturnType<typeof extractAddressCandidate> & { isSupplier?: boolean }
  >,
) => {
  if (candidates.length === 0) return { address: null, warning: undefined }
  const clean = candidates.find((candidate) => !candidate?.isSupplier)
  if (clean) return { address: clean, warning: undefined }
  return {
    address: candidates[0],
    warning: 'Dit lijkt mogelijk het leverancieradres - controleer.',
  }
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

const POSTCODE_CITY_REGEX =
  /(\d{4}\s?[A-Z]{2}|\d{4})\s+([A-Za-z][A-Za-z\s\-]+)(?:,|$)/

const findPostcodeAndCity = (text: string, skipSupplier = true) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[.,;]+$/, '').trim())
  for (const line of lines) {
    if (skipSupplier && lineHasIgnoreWord(line)) {
      continue
    }
    const match = line.match(POSTCODE_CITY_REGEX)
    if (match) {
      const possibleNlPostcode = /\d{4}\s?[A-Z]{2}/.test(line)
      if (
        match[1].length === 4 &&
        match[2].trim().length === 2 &&
        possibleNlPostcode
      ) {
        continue
      }
      return {
        postcode: normalizePostcode(match[1]),
        city: match[2].trim(),
      }
    }
  }
  return null
}

const lineHasLabel = (line: string, labels: string[]) => {
  const normalized = normalizeLabel(line)
  return labels.some((label) =>
    normalized.includes(normalizeLabel(label)),
  )
}

const extractLabeledAddresses = (lines: string[]) => {
  const deliveryCandidates = []
  const invoiceCandidates = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (lineHasLabel(line, ADDRESS_LABELS.delivery)) {
      const candidate = extractAddressCandidate(lines, i)
      if (candidate) {
        deliveryCandidates.push(candidate)
      }
    }
    if (lineHasLabel(line, ADDRESS_LABELS.invoice)) {
      const candidate = extractAddressCandidate(lines, i)
      if (candidate) {
        invoiceCandidates.push(candidate)
      }
    }
  }

  const deliverySelection = selectAddressCandidate(deliveryCandidates)
  const invoiceSelection = selectAddressCandidate(invoiceCandidates)

  return {
    delivery: deliverySelection.address,
    invoice: invoiceSelection.address,
    warning: deliverySelection.warning,
  }
}

const isEanMarker = (line: string) => {
  const lower = line.toLowerCase()
  if (findEanCodes(line).length > 0) return true
  return /\bean\b/.test(lower) && /\d{6,}/.test(line)
}

const isHeadingMarker = (line: string) => {
  const lower = line.toLowerCase()
  return (
    lower.startsWith('aansluiting') ||
    lower.startsWith('aansluitnaam') ||
    lower.startsWith('aansluitnummer')
  )
}

const splitByMarkers = (lines: string[], useHeadingMarkers: boolean) => {
  const blocks: string[] = []
  let current: string[] = []
  let hasPrimaryMarker = false
  let markerCount = 0

  for (const line of lines) {
    const marker = isEanMarker(line) || (useHeadingMarkers && isHeadingMarker(line))
    if (marker) {
      markerCount += 1
      if (current.length > 0 && hasPrimaryMarker) {
        blocks.push(current.join('\n'))
        current = []
        hasPrimaryMarker = false
      }
      hasPrimaryMarker = true
    }
    current.push(line)
  }

  if (current.length > 0) {
    blocks.push(current.join('\n'))
  }

  if (blocks.length > 1 && markerCount > 1) {
    return blocks
  }

  return null
}

const splitIntoBlocks = (text: string, splitMode: 'auto' | 'none' = 'auto') => {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (splitMode === 'none') return [trimmed]
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const hasEans = findEanCodes(trimmed).length > 0
  const markerBlocks = splitByMarkers(lines, !hasEans)
  if (markerBlocks) return markerBlocks

  const blocks = trimmed
    .split(/\n{2,}|\r\n{2,}/g)
    .map((block) => block.trim())
    .filter(Boolean)

  return blocks.length > 0 ? blocks : [trimmed]
}

const extractFieldsFromBlock = (block: string) => {
  const fields: Partial<ConnectionDraft> = {}
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const labeledAddresses = extractLabeledAddresses(lines)
  if (labeledAddresses.delivery) {
    fields.deliveryStreet ??= labeledAddresses.delivery.street
    fields.deliveryHouseNumber ??= labeledAddresses.delivery.houseNumber
    if (labeledAddresses.delivery.houseNumberAddition) {
      fields.deliveryHouseNumberAddition ??=
        labeledAddresses.delivery.houseNumberAddition
    }
    fields.deliveryPostcode ??= labeledAddresses.delivery.postcode
    fields.deliveryCity ??= labeledAddresses.delivery.city
  }
  if (labeledAddresses.invoice) {
    fields.invoiceStreet ??= labeledAddresses.invoice.street
    fields.invoiceHouseNumber ??= labeledAddresses.invoice.houseNumber
    if (labeledAddresses.invoice.houseNumberAddition) {
      fields.invoiceHouseNumberAddition ??=
        labeledAddresses.invoice.houseNumberAddition
    }
    fields.invoicePostcode ??= labeledAddresses.invoice.postcode
    fields.invoiceCity ??= labeledAddresses.invoice.city
    fields.invoiceSameAsDelivery = false
  }
  if (labeledAddresses.warning) {
    fields.addressWarning ??= labeledAddresses.warning
  }

  const assignTextField = (field: ConnectionField, value: string) => {
    if (
      field === 'id' ||
      field === 'createdAt' ||
      field === 'source' ||
      field === 'addressWarning'
    ) {
      return
    }
    ;(fields as Record<string, string>)[field] ??= value
  }

  const applyAddressValue = (
    target: 'delivery' | 'invoice',
    label: string,
    rawValue: string,
  ) => {
    if (lineHasIgnoreWord(label)) {
      fields.addressWarning ??=
        'Dit lijkt mogelijk het leverancieradres - controleer.'
      return true
    }
    const address = parseAddress(rawValue)
    const postcodeCity = findPostcodeAndCity(rawValue)

    if (target === 'delivery') {
      if (address) {
        fields.deliveryStreet ??= address.street
        fields.deliveryHouseNumber ??= address.houseNumber
        if (address.houseNumberAddition) {
          fields.deliveryHouseNumberAddition ??= address.houseNumberAddition
        }
      }
      if (postcodeCity) {
        fields.deliveryPostcode ??= postcodeCity.postcode
        fields.deliveryCity ??= postcodeCity.city
      }
    } else {
      if (address) {
        fields.invoiceStreet ??= address.street
        fields.invoiceHouseNumber ??= address.houseNumber
        if (address.houseNumberAddition) {
          fields.invoiceHouseNumberAddition ??= address.houseNumberAddition
        }
      }
      if (postcodeCity) {
        fields.invoicePostcode ??= postcodeCity.postcode
        fields.invoiceCity ??= postcodeCity.city
      }
      fields.invoiceSameAsDelivery = false
    }
    return true
  }

  const applyLabelValue = (label: string, value: string) => {
    if (
      GENERIC_ADDRESS_ALIASES.some((alias) =>
        normalizeLabel(label).includes(normalizeLabel(alias)),
      )
    ) {
      const target = lineHasLabel(label, ADDRESS_LABELS.invoice)
        ? 'invoice'
        : 'delivery'
      return applyAddressValue(target, label, value)
    }

    const field = matchLabelToField(label)
    if (!field) return false
    const normalizedValue = value.trim()
    if (!normalizedValue) return true
    switch (field) {
      case 'eanCode':
        fields.eanCode ??= normalizeEAN(normalizedValue)
        break
      case 'kvkNumber':
        fields.kvkNumber ??= normalizedValue.replace(/\D/g, '')
        break
      case 'iban':
        fields.iban ??= normalizeIban(normalizedValue)
        break
      case 'deliveryPostcode': {
        const postcodeCity = findPostcodeAndCity(normalizedValue)
        if (postcodeCity) {
          fields.deliveryPostcode ??= postcodeCity.postcode
          fields.deliveryCity ??= postcodeCity.city
        } else {
          fields.deliveryPostcode ??= normalizePostcode(normalizedValue)
        }
        break
      }
      case 'invoicePostcode': {
        const postcodeCity = findPostcodeAndCity(normalizedValue)
        if (postcodeCity) {
          fields.invoicePostcode ??= postcodeCity.postcode
          fields.invoiceCity ??= postcodeCity.city
        } else {
          fields.invoicePostcode ??= normalizePostcode(normalizedValue)
        }
        fields.invoiceSameAsDelivery = false
        break
      }
      case 'product': {
        const product = normalizeProduct(normalizedValue)
        fields.product ??= product ?? (normalizedValue as ConnectionProduct)
        break
      }
      case 'marketSegment': {
        const segment = normalizeMarketSegment(normalizedValue)
        fields.marketSegment ??= segment ?? (normalizedValue as MarketSegment)
        break
      }
      case 'deliveryStreet': {
        const address = parseAddress(normalizedValue)
        if (address) {
          fields.deliveryStreet ??= address.street
          fields.deliveryHouseNumber ??= address.houseNumber
          if (address.houseNumberAddition) {
            fields.deliveryHouseNumberAddition ??= address.houseNumberAddition
          }
        } else {
          fields.deliveryStreet ??= normalizedValue
        }
        break
      }
      case 'invoiceStreet': {
        const address = parseAddress(normalizedValue)
        if (address) {
          fields.invoiceStreet ??= address.street
          fields.invoiceHouseNumber ??= address.houseNumber
          if (address.houseNumberAddition) {
            fields.invoiceHouseNumberAddition ??= address.houseNumberAddition
          }
        } else {
          fields.invoiceStreet ??= normalizedValue
        }
        fields.invoiceSameAsDelivery = false
        break
      }
      case 'telemetryType':
        {
          const telemetry = normalizeTelemetry(normalizedValue)
          if (telemetry) {
            fields.telemetryType ??= telemetry
          }
        }
        break
      case 'telemetryCode':
        fields.telemetryCode ??= normalizeTelemetryCode(normalizedValue)
        break
      case 'invoiceSameAsDelivery':
        if (normalizedValue.toLowerCase().includes('nee')) {
          fields.invoiceSameAsDelivery = false
        }
        if (normalizedValue.toLowerCase().includes('ja')) {
          fields.invoiceSameAsDelivery = true
        }
        break
      default:
        assignTextField(field, normalizedValue)
    }
    return true
  }

  for (const line of lines) {
    const labelValueMatch = line.match(/^(.+?)[\:\-]\s*(.+)$/)
    const spacedMatch = line.match(/^(.+?)\s{2,}(.+)$/)
    const looseMatch = line.match(
      /^([A-Za-z][A-Za-z0-9\s\/-]{2,25})\s+(.+)$/,
    )
    const match = labelValueMatch ?? spacedMatch ?? looseMatch
    if (match) {
      const label = match[1]
      const value = match[2]
      if (applyLabelValue(label, value)) {
        continue
      }
    }
  }

  if (!fields.eanCode) {
    const eans = findEanCodes(block)
    if (eans.length > 0) {
      fields.eanCode = eans[0]
    }
  }

  if (!fields.product) {
    const product = normalizeProduct(block)
    if (product) fields.product = product
  }

  if (!fields.marketSegment) {
    const segment = normalizeMarketSegment(block)
    if (segment) fields.marketSegment = segment
  }

  if (!fields.kvkNumber) {
    const kvkMatch = block.replace(/\s+/g, ' ').match(/\b(\d{8})\b/)
    if (kvkMatch) {
      fields.kvkNumber = kvkMatch[1]
    }
  }

  if (!fields.telemetryType) {
    const telemetryLine = lines.find((line) => {
      const normalized = normalizeLabel(line)
      return normalized.includes('telemetrie') || normalized.includes('telemetry')
    })
    if (telemetryLine) {
      const telemetry = normalizeTelemetry(telemetryLine)
      if (telemetry) {
        fields.telemetryType = telemetry
      }
    }
  }

  const safeLines = lines.filter((line) => !lineHasIgnoreWord(line))

  if (!fields.deliveryStreet || !fields.deliveryHouseNumber) {
    const addressLine = safeLines.find((line) => parseAddress(line))
    const address = addressLine ? parseAddress(addressLine) : null
    if (address) {
      fields.deliveryStreet ??= address.street
      fields.deliveryHouseNumber ??= address.houseNumber
      if (address.houseNumberAddition) {
        fields.deliveryHouseNumberAddition ??= address.houseNumberAddition
      }
    }
  }

  if (!fields.deliveryPostcode || !fields.deliveryCity) {
    const postcodeCity = findPostcodeAndCity(safeLines.join('\n'))
    if (postcodeCity) {
      fields.deliveryPostcode ??= postcodeCity.postcode
      fields.deliveryCity ??= postcodeCity.city
    }
  }

  if (
    (!fields.deliveryStreet || !fields.deliveryHouseNumber) &&
    lines.some((line) => lineHasIgnoreWord(line))
  ) {
    const supplierAddressLine = lines.find(
      (line) => lineHasIgnoreWord(line) && parseAddress(line),
    )
    const address = supplierAddressLine
      ? parseAddress(supplierAddressLine)
      : null
    if (address) {
      fields.deliveryStreet ??= address.street
      fields.deliveryHouseNumber ??= address.houseNumber
      if (address.houseNumberAddition) {
        fields.deliveryHouseNumberAddition ??= address.houseNumberAddition
      }
      fields.addressWarning ??=
        'Dit lijkt mogelijk het leverancieradres - controleer.'
    }
  }

  if (
    (!fields.deliveryPostcode || !fields.deliveryCity) &&
    lines.some((line) => lineHasIgnoreWord(line))
  ) {
    const supplierPostcodeCity = findPostcodeAndCity(
      lines.join('\n'),
      false,
    )
    if (supplierPostcodeCity) {
      fields.deliveryPostcode ??= supplierPostcodeCity.postcode
      fields.deliveryCity ??= supplierPostcodeCity.city
      fields.addressWarning ??=
        'Dit lijkt mogelijk het leverancieradres - controleer.'
    }
  }

  if (
    fields.invoiceStreet ||
    fields.invoiceHouseNumber ||
    fields.invoicePostcode ||
    fields.invoiceCity
  ) {
    fields.invoiceSameAsDelivery = false
  }

  return fields
}

export const extractConnectionsFromText = (
  text: string,
  {
    source = 'OCR_PHOTO',
    allowMultiple = true,
    splitMode = 'auto',
  }: {
    source?: ConnectionSource
    allowMultiple?: boolean
    splitMode?: 'auto' | 'none'
  } = {},
) => {
  const blocks = splitIntoBlocks(text, splitMode)
  const targetBlocks = allowMultiple ? blocks : blocks.slice(0, 1)
  const connections: ConnectionDraft[] = []

  for (const block of targetBlocks) {
    const fields = extractFieldsFromBlock(block)
    const eans = findEanCodes(block)
    if (allowMultiple && eans.length > 1) {
      for (const ean of eans) {
        connections.push({
          ...createDraftConnection(source),
          ...fields,
          eanCode: ean,
        })
      }
    } else {
      if (eans.length > 0 && !fields.eanCode) {
        fields.eanCode = eans[0]
      }
      connections.push({
        ...createDraftConnection(source),
        ...fields,
      })
    }
  }

  return connections.filter((connection) =>
    Object.keys(connection).some(
      (key) =>
        key !== 'id' &&
        key !== 'createdAt' &&
        key !== 'source' &&
        key !== 'telemetryCode' &&
        key !== 'invoiceSameAsDelivery' &&
        key !== 'addressWarning',
    ),
  )
}

const mapHeadersToFields = (headers: string[]) => {
  const mapping: Record<string, ConnectionField | null> = {}
  for (const header of headers) {
    const field = matchLabelToField(header)
    mapping[header] = field
  }
  return mapping
}

const normalizeExcelValue = (field: ConnectionField, raw: unknown) => {
  if (raw === null || raw === undefined) return ''
  const value = String(raw).trim()
  if (!value) return ''
  switch (field) {
    case 'eanCode':
      return normalizeEAN(value)
    case 'deliveryPostcode':
    case 'invoicePostcode':
      return normalizePostcode(value)
    case 'kvkNumber':
      return value.replace(/\D/g, '')
    case 'product': {
      return normalizeProduct(value) ?? value
    }
    case 'marketSegment': {
      return normalizeMarketSegment(value) ?? value
    }
    case 'telemetryType': {
      return normalizeTelemetry(value)
    }
    case 'telemetryCode': {
      return normalizeTelemetryCode(value)
    }
    case 'iban': {
      return normalizeIban(value)
    }
    case 'invoiceSameAsDelivery': {
      const normalized = value.toLowerCase()
      if (['ja', 'yes', 'true', '1'].includes(normalized)) return true
      if (['nee', 'no', 'false', '0'].includes(normalized)) return false
      return ''
    }
    default:
      return value
  }
}

export const extractConnectionsFromExcelFile = async (
  file: File,
): Promise<{
  connections: ConnectionDraft[]
  unmappedHeaders: string[]
  mappedHeaders: Record<string, ConnectionField>
}> => {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { connections: [], unmappedHeaders: [], mappedHeaders: {} }
  }
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  })
  if (rows.length === 0) {
    return { connections: [], unmappedHeaders: [], mappedHeaders: {} }
  }

  const headers = Object.keys(rows[0])
  const mapping = mapHeadersToFields(headers)
  const mappedHeaders: Record<string, ConnectionField> = {}
  const unmappedHeaders: string[] = []

  for (const [header, field] of Object.entries(mapping)) {
    if (field) mappedHeaders[header] = field
    else unmappedHeaders.push(header)
  }

  const connections = rows.map((row) => {
    const draft = createDraftConnection('EXCEL')
    const mutableDraft = draft as Record<string, unknown>
    for (const header of headers) {
      const field = mapping[header]
      if (!field) continue
      const normalizedValue = normalizeExcelValue(field, row[header])
      if (normalizedValue === '') continue
      if (
        field === 'deliveryStreet' &&
        typeof normalizedValue === 'string' &&
        !draft.deliveryHouseNumber
      ) {
        const address = parseAddress(normalizedValue)
        if (address) {
          draft.deliveryStreet = address.street
          draft.deliveryHouseNumber = address.houseNumber
          if (address.houseNumberAddition) {
            draft.deliveryHouseNumberAddition = address.houseNumberAddition
          }
          continue
        }
      }
      if (
        field === 'invoiceStreet' &&
        typeof normalizedValue === 'string' &&
        !draft.invoiceHouseNumber
      ) {
        const address = parseAddress(normalizedValue)
        if (address) {
          draft.invoiceStreet = address.street
          draft.invoiceHouseNumber = address.houseNumber
          if (address.houseNumberAddition) {
            draft.invoiceHouseNumberAddition = address.houseNumberAddition
          }
          draft.invoiceSameAsDelivery = false
          continue
        }
      }
      mutableDraft[field] = normalizedValue
    }
    if (
      (!draft.deliveryPostcode || !draft.deliveryCity) &&
      typeof row['Postcode'] === 'string'
    ) {
      const postcodeCity = findPostcodeAndCity(String(row['Postcode']))
      if (postcodeCity) {
        draft.deliveryPostcode ??= postcodeCity.postcode
        draft.deliveryCity ??= postcodeCity.city
      }
    }
    if (!draft.product) {
      const product = normalizeProduct(JSON.stringify(row))
      if (product) draft.product = product
    }
    if (!draft.marketSegment) {
      const segment = normalizeMarketSegment(JSON.stringify(row))
      if (segment) draft.marketSegment = segment
    }
    if (
      draft.invoiceStreet ||
      draft.invoiceHouseNumber ||
      draft.invoicePostcode ||
      draft.invoiceCity
    ) {
      draft.invoiceSameAsDelivery = false
    }
    return draft
  })

  return { connections, unmappedHeaders, mappedHeaders }
}

export const excelFileToText = async (
  file: File,
  maxRows = 200,
): Promise<{ text: string; truncatedRows: number }> => {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { text: '', truncatedRows: 0 }
  }
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  })
  if (rows.length === 0) {
    return { text: '', truncatedRows: 0 }
  }

  const headers = Object.keys(rows[0])
  const usableRows = rows.slice(0, maxRows)
  const lines = usableRows.map((row, index) => {
    const pairs = headers
      .map((header) => {
        const value = row[header]
        const normalized =
          value === null || value === undefined ? '' : String(value).trim()
        return normalized ? `${header}: ${normalized}` : ''
      })
      .filter(Boolean)
      .join(' | ')
    return `Rij ${index + 1}: ${pairs}`
  })
  const truncatedRows = Math.max(0, rows.length - usableRows.length)
  const text = [
    `Excel sheet: ${sheetName}`,
    `Kolommen: ${headers.join(', ')}`,
    ...lines,
  ].join('\n')

  return { text, truncatedRows }
}

export const getKnownFields = () => ({
  products: CONNECTION_PRODUCTS,
  marketSegments: MARKET_SEGMENTS,
})
