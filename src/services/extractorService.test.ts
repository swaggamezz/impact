import { describe, expect, it } from 'vitest'
import { extractConnectionsFromText } from './extractorService'

describe('extractConnectionsFromText', () => {
  it('extracts a single connection with labels', () => {
    const text = `
EAN: 123456789012345678
Product: Elektra
Tenaamstelling: Impact BV
KvK: 12345678
Telemetrie: Ja
Adres: Stationsstraat 12 A
Postcode: 1234 AB
Plaats: Utrecht
Marktsegment: KV
`
    const results = extractConnectionsFromText(text, {
      source: 'OCR_PHOTO',
      allowMultiple: true,
    })

    expect(results).toHaveLength(1)
    expect(results[0].eanCode).toBe('123456789012345678')
    expect(results[0].product).toBe('Elektra')
    expect(results[0].tenaamstelling).toBe('Impact BV')
    expect(results[0].kvkNumber).toBe('12345678')
    expect(results[0].telemetryType).toBe('Onbekend')
    expect(results[0].telemetryCode).toBe('ONBEKEND')
    expect(results[0].deliveryStreet).toBe('Stationsstraat')
    expect(results[0].deliveryHouseNumber).toBe('12')
    expect(results[0].deliveryHouseNumberAddition).toBe('A')
    expect(results[0].deliveryPostcode).toBe('1234 AB')
    expect(results[0].deliveryCity).toBe('Utrecht')
    expect(results[0].marketSegment).toBe('KV')
  })

  it('splits multiple EANs when allowed', () => {
    const text = `
EAN 123456789012345678
EAN 987654321098765432
Product: Gas
`
    const results = extractConnectionsFromText(text, {
      source: 'OCR_PHOTO',
      allowMultiple: true,
    })

    const eans = results.map((item) => item.eanCode)
    expect(eans).toContain('123456789012345678')
    expect(eans).toContain('987654321098765432')
  })

  it('keeps PDF-style extraction to exactly one connection when split is disabled', () => {
    const text = `
EAN 123456789012345678
EAN 987654321098765432
Product: Gas
`

    const results = extractConnectionsFromText(text, {
      source: 'OCR_PDF',
      allowMultiple: false,
      splitMode: 'none',
    })

    expect(results).toHaveLength(1)
    expect(results[0].eanCode).toBe('123456789012345678')
  })
})
