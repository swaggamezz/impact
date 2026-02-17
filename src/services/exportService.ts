import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'
import type { ConnectionDraft } from '../models/connection'
import { validateConnection } from '../utils/validation'

const EXPORT_COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'tenaamstelling', label: 'Tenaamstelling' },
  { key: 'legalName', label: 'Juridische naam' },
  { key: 'tradeName', label: 'Handelsnaam' },
  { key: 'kvkNumber', label: 'KvK' },
  { key: 'legalForm', label: 'Rechtsvorm' },
  { key: 'companyActive', label: 'Status bedrijf' },
  { key: 'authorizedSignatory', label: 'Tekenbevoegde' },
  { key: 'authorizedSignatoryRole', label: 'Rol tekenbevoegde' },
  { key: 'iban', label: 'IBAN' },
  { key: 'invoiceEmail', label: 'Factuur e-mail' },
  { key: 'vatNumber', label: 'BTW-nummer' },
  { key: 'contactEmail', label: 'Contact e-mail' },
  { key: 'contactPhone', label: 'Contact telefoon' },
  { key: 'website', label: 'Website' },
  { key: 'eanCode', label: 'EAN code' },
  { key: 'product', label: 'Product' },
  { key: 'gridOperator', label: 'Netbeheerder' },
  { key: 'telemetryCode', label: 'Telemetriecode' },
  { key: 'telemetryType', label: 'Telemetrie type' },
  { key: 'marketSegment', label: 'Segment' },
  { key: 'meterNumber', label: 'Meternummer' },
  { key: 'deliveryPostcode', label: 'Postcode levering' },
  { key: 'deliveryHouseNumber', label: 'Huisnummer levering' },
  { key: 'deliveryHouseNumberAddition', label: 'Toevoeging levering' },
  { key: 'deliveryStreet', label: 'Straat levering' },
  { key: 'deliveryCity', label: 'Plaats levering' },
  { key: 'invoiceSameAsDelivery', label: 'Factuuradres = levering' },
  { key: 'invoicePostcode', label: 'Postcode factuur' },
  { key: 'invoiceHouseNumber', label: 'Huisnummer factuur' },
  { key: 'invoiceHouseNumberAddition', label: 'Toevoeging factuur' },
  { key: 'invoiceStreet', label: 'Straat factuur' },
  { key: 'invoiceCity', label: 'Plaats factuur' },
  { key: 'supplier', label: 'Leverancier' },
  { key: 'department', label: 'Afdeling' },
  { key: 'annualUsageNormal', label: 'Jaarverbruik hoog' },
  { key: 'annualUsageLow', label: 'Jaarverbruik laag' },
  { key: 'status', label: 'Status' },
  { key: 'addressWarning', label: 'Adreswaarschuwing' },
  { key: 'notes', label: 'Notities' },
  { key: 'createdAt', label: 'Aangemaakt' },
  { key: 'source', label: 'Bron' },
]

const normalizeValue = (value: unknown) => {
  if (value === null || value === undefined) return ''
  return String(value)
}

const COMPANY_ACTIVE_LABELS: Record<string, string> = {
  active: 'Actief',
  inactive: 'Niet actief',
  unknown: 'Onbekend',
}

const isInvoiceSameAsDelivery = (connection: ConnectionDraft) =>
  connection.invoiceSameAsDelivery !== false ||
  (!connection.invoiceStreet &&
    !connection.invoiceHouseNumber &&
    !connection.invoicePostcode &&
    !connection.invoiceCity)

const formatAddress = (
  street?: string,
  houseNumber?: string,
  houseNumberAddition?: string,
  postcode?: string,
  city?: string,
) => {
  const line1 = [street, houseNumber, houseNumberAddition]
    .filter((part) => (part ?? '').toString().trim() !== '')
    .join(' ')
  const line2 = [postcode, city]
    .filter((part) => (part ?? '').toString().trim() !== '')
    .join(' ')

  if (!line1 && !line2) return '-'
  if (!line2) return line1
  if (!line1) return line2
  return `${line1}, ${line2}`
}

const getExportValue = (connection: ConnectionDraft, key: string) => {
  const invoiceSame = isInvoiceSameAsDelivery(connection)

  switch (key) {
    case 'companyActive': {
      const raw = connection.companyActive
      if (!raw) return ''
      return COMPANY_ACTIVE_LABELS[raw] ?? raw
    }
    case 'invoiceSameAsDelivery':
      return invoiceSame ? 'Ja' : 'Nee'
    case 'invoiceStreet':
      return invoiceSame ? connection.deliveryStreet : connection.invoiceStreet
    case 'invoiceHouseNumber':
      return invoiceSame
        ? connection.deliveryHouseNumber
        : connection.invoiceHouseNumber
    case 'invoiceHouseNumberAddition':
      return invoiceSame
        ? connection.deliveryHouseNumberAddition
        : connection.invoiceHouseNumberAddition
    case 'invoicePostcode':
      return invoiceSame ? connection.deliveryPostcode : connection.invoicePostcode
    case 'invoiceCity':
      return invoiceSame ? connection.deliveryCity : connection.invoiceCity
    default:
      return (connection as Record<string, unknown>)[key]
  }
}

const buildRows = (connections: ConnectionDraft[]) =>
  connections.map((connection) =>
    EXPORT_COLUMNS.map((column) =>
      normalizeValue(getExportValue(connection, column.key)),
    ),
  )

const escapeCsvValue = (value: string, delimiter: string) => {
  if (value.includes('"')) {
    value = value.replace(/"/g, '""')
  }
  if (value.includes(delimiter) || value.includes('\n') || value.includes('\r')) {
    return `"${value}"`
  }
  return value
}

export const buildCsv = (
  connections: ConnectionDraft[],
  delimiter = ';',
) => {
  const headerRow = EXPORT_COLUMNS.map((column) => column.label)
  const dataRows = buildRows(connections)
  const rows = [headerRow, ...dataRows].map((row) =>
    row.map((value) => escapeCsvValue(value, delimiter)).join(delimiter),
  )
  return rows.join('\n')
}

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export const createCsvBlob = (connections: ConnectionDraft[]) => {
  const csv = buildCsv(connections)
  return new Blob([csv], { type: 'text/csv;charset=utf-8;' })
}

export const exportToCsv = (connections: ConnectionDraft[]) => {
  const blob = createCsvBlob(connections)
  downloadBlob(blob, 'impact-energy-aansluitingen.csv')
}

export const createXlsxBlob = (connections: ConnectionDraft[]) => {
  const data = [
    EXPORT_COLUMNS.map((column) => column.label),
    ...buildRows(connections),
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Aansluitingen')
  const out = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export const exportToXlsx = (connections: ConnectionDraft[]) => {
  const blob = createXlsxBlob(connections)
  downloadBlob(blob, 'impact-energy-aansluitingen.xlsx')
}

const buildPdfDocument = (connections: ConnectionDraft[]) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 32
  const headerHeight = 78
  const labelWidth = 180
  const valueWidth = pageWidth - margin * 2 - labelWidth - 12
  const lineHeight = 14

  const exportTimestamp = new Date().toLocaleString('nl-NL')
  const incompleteCount = connections.filter(
    (connection) => Object.keys(validateConnection(connection)).length > 0,
  ).length

  const drawDocumentHeader = () => {
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, pageWidth, 46, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('Impact Energy', margin, 28)
    doc.setFont('helvetica', 'normal')
    doc.text('Intake export aansluitingen', margin + 96, 28)
    doc.setTextColor(15, 23, 42)
    doc.setFontSize(9)
    doc.text(
      `Aangemaakt: ${exportTimestamp}`,
      margin,
      58,
    )
    doc.text(
      `Totaal: ${connections.length}  |  Incompleet: ${incompleteCount}`,
      margin,
      70,
    )
  }

  drawDocumentHeader()
  let cursorY = margin + headerHeight

  const ensurePageSpace = (neededHeight: number) => {
    if (cursorY + neededHeight <= pageHeight - margin) return
    doc.addPage()
    drawDocumentHeader()
    cursorY = margin + headerHeight
  }

  const drawField = (label: string, rawValue: string) => {
    const value = rawValue.trim() ? rawValue : '-'
    const wrapped = doc.splitTextToSize(value, valueWidth) as string[]
    const blockHeight = Math.max(lineHeight, wrapped.length * lineHeight) + 2
    ensurePageSpace(blockHeight + 2)
    doc.setFont('helvetica', 'bold')
    doc.text(label, margin + 8, cursorY)
    doc.setFont('helvetica', 'normal')
    doc.text(wrapped, margin + labelWidth, cursorY)
    cursorY += blockHeight
  }

  for (let index = 0; index < connections.length; index += 1) {
    const connection = connections[index]
    const invoiceSame = isInvoiceSameAsDelivery(connection)
    const deliveryAddress = formatAddress(
      connection.deliveryStreet,
      connection.deliveryHouseNumber,
      connection.deliveryHouseNumberAddition,
      connection.deliveryPostcode,
      connection.deliveryCity,
    )
    const invoiceAddress = invoiceSame
      ? 'Gelijk aan leveringsadres'
      : formatAddress(
          connection.invoiceStreet,
          connection.invoiceHouseNumber,
          connection.invoiceHouseNumberAddition,
          connection.invoicePostcode,
          connection.invoiceCity,
        )

    const fields: Array<[string, string]> = [
      ['Aansluiting', `#${index + 1}`],
      ['Tenaamstelling', normalizeValue(connection.tenaamstelling)],
      ['Juridische naam', normalizeValue(connection.legalName)],
      ['Handelsnaam', normalizeValue(connection.tradeName)],
      ['Rechtsvorm', normalizeValue(connection.legalForm)],
      [
        'Status bedrijf',
        normalizeValue(getExportValue(connection, 'companyActive')),
      ],
      ['KvK', normalizeValue(connection.kvkNumber)],
      ['Tekenbevoegde', normalizeValue(connection.authorizedSignatory)],
      ['Rol tekenbevoegde', normalizeValue(connection.authorizedSignatoryRole)],
      ['IBAN', normalizeValue(connection.iban)],
      ['Factuur e-mail', normalizeValue(connection.invoiceEmail)],
      ['BTW-nummer', normalizeValue(connection.vatNumber)],
      ['Contact e-mail', normalizeValue(connection.contactEmail)],
      ['Contact telefoon', normalizeValue(connection.contactPhone)],
      ['Website', normalizeValue(connection.website)],
      ['EAN', normalizeValue(connection.eanCode)],
      ['Product', normalizeValue(connection.product)],
      ['Marktsegment', normalizeValue(connection.marketSegment)],
      ['Telemetriecode / Meetcode', normalizeValue(connection.telemetryCode)],
      ['Telemetrie type', normalizeValue(connection.telemetryType)],
      ['Netbeheerder', normalizeValue(connection.gridOperator)],
      ['Leverancier', normalizeValue(connection.supplier)],
      ['Meternummer', normalizeValue(connection.meterNumber)],
      ['Leveringsadres', deliveryAddress],
      ['Factuuradres', invoiceAddress],
      ['Afdeling', normalizeValue(connection.department)],
      ['Jaarverbruik hoog', normalizeValue(connection.annualUsageNormal)],
      ['Jaarverbruik laag', normalizeValue(connection.annualUsageLow)],
      ['Status', normalizeValue(connection.status)],
      ['Adreswaarschuwing', normalizeValue(connection.addressWarning)],
      ['Notities', normalizeValue(connection.notes)],
      ['Bron', normalizeValue(connection.source)],
      ['Aangemaakt', normalizeValue(connection.createdAt)],
    ]

    const estimatedHeight =
      34 +
      fields.reduce((height, [, rawValue]) => {
        const value = rawValue.trim() ? rawValue : '-'
        const wrapped = doc.splitTextToSize(value, valueWidth) as string[]
        const blockHeight = Math.max(lineHeight, wrapped.length * lineHeight) + 2
        return height + blockHeight
      }, 0) +
      16
    ensurePageSpace(estimatedHeight)
    doc.setFillColor(241, 245, 249)
    doc.roundedRect(
      margin,
      cursorY - 16,
      pageWidth - margin * 2,
      estimatedHeight,
      8,
      8,
      'F',
    )
    doc.setDrawColor(203, 213, 225)
    doc.roundedRect(
      margin,
      cursorY - 16,
      pageWidth - margin * 2,
      estimatedHeight,
      8,
      8,
      'S',
    )

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(`Aansluiting ${index + 1}`, margin + 8, cursorY)
    cursorY += 16
    doc.setFontSize(10)

    for (const [label, value] of fields) {
      drawField(label, value)
    }

    cursorY += 12
  }

  return doc
}

export const createPdfBlob = (connections: ConnectionDraft[]) => {
  const doc = buildPdfDocument(connections)
  return doc.output('blob')
}

export const exportToPdf = (connections: ConnectionDraft[]) => {
  const blob = createPdfBlob(connections)
  downloadBlob(blob, 'impact-energy-aansluitingen.pdf')
}

export const previewPdf = (connections: ConnectionDraft[]) => {
  const doc = buildPdfDocument(connections)
  doc.save('impact-energy-aansluitingen.pdf')
}

export const getExportColumns = () => EXPORT_COLUMNS
