import { describe, expect, it } from 'vitest'
import { createDraftConnection } from '../models/connection'
import {
  detectLikelyOcrPostcodeError,
  isValidEAN,
  isValidIban,
  isValidKvk,
  isValidPostcodeNLorBE,
  validateConnection,
} from './validation'

describe('validation helpers', () => {
  it('validates EAN codes', () => {
    expect(isValidEAN('123456789012345678')).toBe(true)
    expect(isValidEAN('1234 5678 9012 3456 78')).toBe(true)
    expect(isValidEAN('123456')).toBe(false)
  })

  it('validates NL/BE postcodes', () => {
    expect(isValidPostcodeNLorBE('1234 AB')).toBe(true)
    expect(isValidPostcodeNLorBE('1234')).toBe(true)
    expect(isValidPostcodeNLorBE('12AB')).toBe(false)
  })

  it('detects likely OCR postcode mistakes and suggests correction', () => {
    expect(detectLikelyOcrPostcodeError('I234 A8')).toEqual({
      likely: true,
      suggested: '1234 AB',
    })
    expect(detectLikelyOcrPostcodeError('I234')).toEqual({
      likely: true,
      suggested: '1234',
    })
    expect(detectLikelyOcrPostcodeError('1234 AB')).toEqual({
      likely: false,
      suggested: undefined,
    })
  })

  it('validates KvK numbers', () => {
    expect(isValidKvk('12345678')).toBe(true)
    expect(isValidKvk('12 34 56 78')).toBe(true)
    expect(isValidKvk('1234')).toBe(false)
  })

  it('validates IBAN numbers', () => {
    expect(isValidIban('NL91 ABNA 0417 1643 00')).toBe(true)
    expect(isValidIban('BE71 0961 2345 6769')).toBe(true)
    expect(isValidIban('NL00 BANK 0000 0000 00')).toBe(false)
  })

  it('returns errors for missing required fields', () => {
    const draft = createDraftConnection('MANUAL')
    const errors = validateConnection(draft)
    expect(errors.eanCode).toBe('EAN-code is verplicht (18 cijfers).')
    expect(errors.product).toBe('Kies een product.')
    expect(errors.tenaamstelling).toBe('Tenaamstelling is verplicht.')
    expect(errors.kvkNumber).toBe('KvK-nummer is verplicht.')
    expect(errors.iban).toBe('IBAN is verplicht.')
    expect(errors.authorizedSignatory).toBe(
      'Tekenbevoegde volgens KvK is verplicht.',
    )
    expect(errors.telemetryCode).toBeUndefined()
    expect(errors.deliveryPostcode).toBe(
      'Postcode van leveringsadres is verplicht.',
    )
  })

  it('shows OCR-specific postcode suggestion when likely misread', () => {
    const draft = createDraftConnection('OCR_PHOTO')
    draft.eanCode = '123456789012345678'
    draft.product = 'Elektra'
    draft.tenaamstelling = 'Test BV'
    draft.kvkNumber = '12345678'
    draft.iban = 'NL91ABNA0417164300'
    draft.authorizedSignatory = 'Jan Jansen'
    draft.telemetryCode = 'ONBEKEND'
    draft.deliveryStreet = 'Straatnaam'
    draft.deliveryHouseNumber = '12'
    draft.deliveryPostcode = 'I234 A8'
    draft.deliveryCity = 'Utrecht'
    draft.marketSegment = 'KV'

    const errors = validateConnection(draft)
    expect(errors.deliveryPostcode).toBe(
      'Postcode lijkt verkeerd herkend, controleer. Bedoeld: 1234 AB?',
    )
  })
})
