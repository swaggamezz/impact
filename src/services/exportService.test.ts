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
        legalName: 'Test BV',
        tradeName: 'Test Handelsnaam',
        kvkNumber: '12345678',
        companyActive: 'active',
        iban: 'NL91ABNA0417164300',
        invoiceEmail: 'facturen@testbv.nl',
        vatNumber: 'NL123456789B01',
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
    expect(lines[0]).toContain('Juridische naam')
    expect(lines[1]).toContain('123456789012345678')
    expect(lines[1]).toContain('Gas')
    expect(lines[1]).toContain('Test BV')
  })
})
