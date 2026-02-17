import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'
import type { ConnectionDraft } from '../models/connection'

const EXPORT_COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'eanCode', label: 'EAN code' },
  { key: 'product', label: 'Product' },
  { key: 'tenaamstelling', label: 'Tenaamstelling' },
  { key: 'kvkNumber', label: 'KvK' },
  { key: 'legalForm', label: 'Rechtsvorm' },
  { key: 'iban', label: 'IBAN' },
  { key: 'authorizedSignatory', label: 'Tekenbevoegde' },
  { key: 'telemetryCode', label: 'Telemetriecode' },
  { key: 'telemetryType', label: 'Telemetrie type' },
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
  { key: 'gridOperator', label: 'Netbeheerder' },
  { key: 'supplier', label: 'Leverancier' },
  { key: 'marketSegment', label: 'Segment' },
  { key: 'department', label: 'Afdeling' },
  { key: 'meterNumber', label: 'Meternummer' },
  { key: 'annualUsageNormal', label: 'Jaarverbruik hoog' },
  { key: 'annualUsageLow', label: 'Jaarverbruik laag' },
  { key: 'status', label: 'Status' },
  { key: 'notes', label: 'Notities' },
  { key: 'createdAt', label: 'Aangemaakt' },
  { key: 'source', label: 'Bron' },
]

const normalizeValue = (value: unknown) => {
  if (value === null || value === undefined) return ''
  return String(value)
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
  const headerHeight = 58
  const labelWidth = 180
  const valueWidth = pageWidth - margin * 2 - labelWidth - 12
  const lineHeight = 14

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
      `Aangemaakt: ${new Date().toLocaleString('nl-NL')}  |  Totaal: ${connections.length}`,
      margin,
      58,
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
      ['EAN', normalizeValue(connection.eanCode)],
      ['Product', normalizeValue(connection.product)],
      ['Marktsegment', normalizeValue(connection.marketSegment)],
      ['KvK', normalizeValue(connection.kvkNumber)],
      ['Rechtsvorm', normalizeValue(connection.legalForm)],
      ['Tekenbevoegde', normalizeValue(connection.authorizedSignatory)],
      ['IBAN', normalizeValue(connection.iban)],
      ['Telemetriecode / Meetcode', normalizeValue(connection.telemetryCode)],
      ['Telemetrie type', normalizeValue(connection.telemetryType)],
      ['Leveringsadres', deliveryAddress],
      ['Factuuradres', invoiceAddress],
      ['Netbeheerder', normalizeValue(connection.gridOperator)],
      ['Leverancier', normalizeValue(connection.supplier)],
      ['Meternummer', normalizeValue(connection.meterNumber)],
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
