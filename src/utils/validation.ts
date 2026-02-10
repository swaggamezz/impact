import type { Connection, ConnectionDraft } from '../models/connection'
import {
  CONNECTION_PRODUCTS,
  MARKET_SEGMENTS,
  REQUIRED_FIELDS,
  TELEMETRY_CODE_UNKNOWN,
  TELEMETRY_OPTIONS,
} from '../models/connection'

export type ConnectionValidationErrors = Partial<
  Record<keyof Connection, string>
>
export type ConnectionValidationWarnings = Partial<
  Record<keyof Connection, string>
>
export type FieldConfidence = 'laag' | 'midden' | 'hoog'

const hasValue = (value: unknown) =>
  value !== undefined && value !== null && String(value).trim() !== ''

const isOcrSource = (source?: string) =>
  source === 'OCR_PHOTO' || source === 'OCR_PDF'

const REQUIRED_FIELD_MESSAGES: Partial<Record<keyof Connection, string>> = {
  eanCode: 'EAN-code is verplicht (18 cijfers).',
  product: 'Kies een product.',
  tenaamstelling: 'Tenaamstelling is verplicht.',
  kvkNumber: 'KvK-nummer is verplicht.',
  iban: 'IBAN is verplicht.',
  authorizedSignatory: 'Tekenbevoegde volgens KvK is verplicht.',
  telemetryCode:
    'Telemetriecode / Meetcode is verplicht. Kies ONBEKEND als je dit niet weet.',
  deliveryStreet: 'Straat van leveringsadres is verplicht.',
  deliveryHouseNumber: 'Huisnummer van leveringsadres is verplicht.',
  deliveryPostcode: 'Postcode van leveringsadres is verplicht.',
  deliveryCity: 'Plaats van leveringsadres is verplicht.',
  marketSegment: 'Kies een marktsegment.',
  invoiceStreet: 'Straat van factuuradres is verplicht.',
  invoiceHouseNumber: 'Huisnummer van factuuradres is verplicht.',
  invoicePostcode: 'Postcode van factuuradres is verplicht.',
  invoiceCity: 'Plaats van factuuradres is verplicht.',
}

export const isValidEAN = (value?: string) => {
  if (!value) return false
  const digitsOnly = value.replace(/\s+/g, '')
  return /^\d{18}$/.test(digitsOnly)
}

export const isValidPostcodeNLorBE = (value?: string) => {
  if (!value) return false
  const normalized = value.trim().toUpperCase()
  if (/^\d{4}$/.test(normalized)) {
    return true
  }
  return /^\d{4}\s?[A-Z]{2}$/.test(normalized)
}

const OCR_TO_DIGIT_MAP: Record<string, string> = {
  O: '0',
  Q: '0',
  D: '0',
  I: '1',
  L: '1',
  Z: '2',
  S: '5',
  G: '6',
  T: '7',
  B: '8',
}

const DIGIT_TO_LETTER_MAP: Record<string, string> = {
  0: 'O',
  1: 'I',
  2: 'Z',
  5: 'S',
  6: 'G',
  7: 'T',
  8: 'B',
}

export const detectLikelyOcrPostcodeError = (value?: string) => {
  if (!value) {
    return { likely: false as const, suggested: undefined as string | undefined }
  }
  const compact = value.replace(/\s+/g, '').toUpperCase()
  if (!compact) {
    return { likely: false as const, suggested: undefined as string | undefined }
  }

  if (compact.length === 6) {
    const first4 = compact
      .slice(0, 4)
      .split('')
      .map((char) => (/\d/.test(char) ? char : OCR_TO_DIGIT_MAP[char] ?? char))
      .join('')
    const last2 = compact
      .slice(4)
      .split('')
      .map((char) => (/[A-Z]/.test(char) ? char : DIGIT_TO_LETTER_MAP[char] ?? char))
      .join('')
    const corrected = `${first4}${last2}`
    if (/^\d{4}[A-Z]{2}$/.test(corrected) && corrected !== compact) {
      return {
        likely: true as const,
        suggested: `${corrected.slice(0, 4)} ${corrected.slice(4)}`,
      }
    }
  }

  if (compact.length === 4) {
    const corrected = compact
      .split('')
      .map((char) => (/\d/.test(char) ? char : OCR_TO_DIGIT_MAP[char] ?? char))
      .join('')
    if (/^\d{4}$/.test(corrected) && corrected !== compact) {
      return {
        likely: true as const,
        suggested: corrected,
      }
    }
  }

  return { likely: false as const, suggested: undefined as string | undefined }
}

export const isValidKvk = (value?: string) => {
  if (!value) return false
  const digitsOnly = value.replace(/\s+/g, '')
  return /^\d{8}$/.test(digitsOnly)
}

const mod97 = (value: string) => {
  let remainder = 0
  for (const char of value) {
    remainder = Number(`${remainder}${char}`) % 97
  }
  return remainder
}

const toIbanNumeric = (value: string) =>
  value
    .split('')
    .map((char) => {
      if (/\d/.test(char)) return char
      return String(char.charCodeAt(0) - 55)
    })
    .join('')

export const isValidIban = (value?: string) => {
  if (!value) return false
  const normalized = value.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(normalized)) {
    return false
  }
  const rearranged = `${normalized.slice(4)}${normalized.slice(0, 4)}`
  const numeric = toIbanNumeric(rearranged)
  return mod97(numeric) === 1
}

export const validateConnection = (
  connection: ConnectionDraft,
): ConnectionValidationErrors => {
  const errors: ConnectionValidationErrors = {}

  for (const field of REQUIRED_FIELDS) {
    const value = connection[field]
    if (!hasValue(value)) {
      errors[field] = REQUIRED_FIELD_MESSAGES[field] ?? 'Verplicht veld'
    }
  }

  if (connection.eanCode && !isValidEAN(connection.eanCode)) {
    errors.eanCode = 'EAN moet precies 18 cijfers zijn.'
  }

  if (
    connection.deliveryPostcode &&
    !isValidPostcodeNLorBE(connection.deliveryPostcode)
  ) {
    const ocrHint = detectLikelyOcrPostcodeError(connection.deliveryPostcode)
    errors.deliveryPostcode = isOcrSource(connection.source)
      ? ocrHint.likely && ocrHint.suggested
        ? `Postcode lijkt verkeerd herkend, controleer. Bedoeld: ${ocrHint.suggested}?`
        : 'Postcode lijkt verkeerd herkend, controleer.'
      : 'Ongeldige postcode. Gebruik NL (1234 AB) of BE (1234).'
  }

  if (
    connection.invoiceSameAsDelivery === false &&
    connection.invoicePostcode &&
    !isValidPostcodeNLorBE(connection.invoicePostcode)
  ) {
    const ocrHint = detectLikelyOcrPostcodeError(connection.invoicePostcode)
    errors.invoicePostcode = isOcrSource(connection.source)
      ? ocrHint.likely && ocrHint.suggested
        ? `Postcode lijkt verkeerd herkend, controleer. Bedoeld: ${ocrHint.suggested}?`
        : 'Postcode lijkt verkeerd herkend, controleer.'
      : 'Ongeldige postcode. Gebruik NL (1234 AB) of BE (1234).'
  }

  if (connection.kvkNumber && !isValidKvk(connection.kvkNumber)) {
    errors.kvkNumber = 'KvK moet 8 cijfers zijn.'
  }

  if (connection.iban && !isValidIban(connection.iban)) {
    errors.iban = 'IBAN lijkt ongeldig. Controleer het rekeningnummer.'
  }

  if (
    connection.product &&
    !CONNECTION_PRODUCTS.includes(connection.product)
  ) {
    errors.product = 'Kies een product of Onbekend.'
  }

  if (
    connection.marketSegment &&
    !MARKET_SEGMENTS.includes(connection.marketSegment)
  ) {
    errors.marketSegment = 'Kies KV, GV of Onbekend.'
  }

  if (
    connection.telemetryType &&
    !TELEMETRY_OPTIONS.includes(
      connection.telemetryType as (typeof TELEMETRY_OPTIONS)[number],
    )
  ) {
    errors.telemetryType = 'Kies een geldige telemetrie-optie.'
  }

  if (connection.invoiceSameAsDelivery === false) {
    if (!connection.invoiceStreet?.trim()) {
      errors.invoiceStreet = REQUIRED_FIELD_MESSAGES.invoiceStreet
    }
    if (!connection.invoiceHouseNumber?.trim()) {
      errors.invoiceHouseNumber = REQUIRED_FIELD_MESSAGES.invoiceHouseNumber
    }
    if (!connection.invoicePostcode?.trim()) {
      errors.invoicePostcode = REQUIRED_FIELD_MESSAGES.invoicePostcode
    }
    if (!connection.invoiceCity?.trim()) {
      errors.invoiceCity = REQUIRED_FIELD_MESSAGES.invoiceCity
    }
  }

  return errors
}

export const validateConnectionWarnings = (
  connection: ConnectionDraft,
): ConnectionValidationWarnings => {
  const warnings: ConnectionValidationWarnings = {}
  if (connection.product === 'Onbekend') {
    warnings.product = 'Product staat op Onbekend. Controleer dit indien mogelijk.'
  }
  if (connection.marketSegment === 'Onbekend') {
    warnings.marketSegment =
      'Marktsegment staat op Onbekend. Controleer dit indien mogelijk.'
  }
  if ((connection.telemetryCode ?? '').toUpperCase() === TELEMETRY_CODE_UNKNOWN) {
    warnings.telemetryCode =
      'Telemetriecode staat op ONBEKEND. Voeg deze later toe indien mogelijk.'
  }
  if (connection.addressWarning) {
    warnings.deliveryStreet = connection.addressWarning
  }
  return warnings
}

export const getFieldConfidence = (
  connection: ConnectionDraft,
  field: keyof ConnectionDraft,
  errors?: ConnectionValidationErrors,
): FieldConfidence | undefined => {
  const value = connection[field]
  if (!hasValue(value)) return undefined
  if (errors?.[field as keyof Connection]) return 'laag'

  const isAddressField =
    field === 'deliveryStreet' ||
    field === 'deliveryHouseNumber' ||
    field === 'deliveryPostcode' ||
    field === 'deliveryCity' ||
    field === 'invoiceStreet' ||
    field === 'invoiceHouseNumber' ||
    field === 'invoicePostcode' ||
    field === 'invoiceCity'

  if (isAddressField && connection.addressWarning) {
    return 'laag'
  }

  if (connection.source === 'MANUAL' || connection.source === 'EXCEL') {
    return 'hoog'
  }

  if (isOcrSource(connection.source)) {
    return 'midden'
  }

  return 'midden'
}
