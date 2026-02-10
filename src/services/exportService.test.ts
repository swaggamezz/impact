import { describe, expect, it } from 'vitest'
import { buildCsv } from './exportService'

describe('exportService', () => {
  it('builds CSV with headers and values', () => {
    const csv = buildCsv([
      {
        id: '1',
        createdAt: '2024-01-01',
        source: 'MANUAL',
        eanCode: '123456789012345678',
        product: 'Gas',
        tenaamstelling: 'Test BV',
        kvkNumber: '12345678',
        iban: 'NL91ABNA0417164300',
        telemetryCode: 'ONBEKEND',
        telemetryType: 'Onbekend',
        deliveryPostcode: '1234 AB',
        deliveryCity: 'Amsterdam',
        marketSegment: 'KV',
        deliveryStreet: 'Straat',
        deliveryHouseNumber: '1',
      },
    ])

    const lines = csv.split('\n')
    expect(lines[0]).toContain('EAN code')
    expect(lines[1]).toContain('123456789012345678')
    expect(lines[1]).toContain('Gas')
  })
})
