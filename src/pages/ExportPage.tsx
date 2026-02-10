import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useConnections } from '../hooks/useConnections'
import {
  createCsvBlob,
  createPdfBlob,
  createXlsxBlob,
  downloadBlob,
} from '../services/exportService'
import { validateConnection } from '../utils/validation'

export const ExportPage = () => {
  const { connections, loading } = useConnections()
  const incompleteCount = connections.filter(
    (connection) => Object.keys(validateConnection(connection)).length > 0,
  ).length
  const hasData = connections.length > 0
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [lastExport, setLastExport] = useState<{
    blob: Blob
    filename: string
    mimeType: string
  } | null>(null)
  const hasShareSupport =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof File !== 'undefined'

  const shouldExport = () => {
    if (incompleteCount === 0) return true
    return window.confirm(
      `${incompleteCount} aansluiting${
        incompleteCount === 1 ? '' : 'en'
      } ${incompleteCount === 1 ? 'is' : 'zijn'} nog incompleet. Toch exporteren?`,
    )
  }

  const handleExport = (type: 'xlsx' | 'csv' | 'pdf') => {
    if (!hasData) return
    if (!shouldExport()) return
    try {
      const exportMap = {
        xlsx: {
          filename: 'impact-energy-aansluitingen.xlsx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          blob: createXlsxBlob(connections),
        },
        csv: {
          filename: 'impact-energy-aansluitingen.csv',
          mimeType: 'text/csv;charset=utf-8;',
          blob: createCsvBlob(connections),
        },
        pdf: {
          filename: 'impact-energy-aansluitingen.pdf',
          mimeType: 'application/pdf',
          blob: createPdfBlob(connections),
        },
      } as const

      const selected = exportMap[type]
      downloadBlob(selected.blob, selected.filename)
      setLastExport({
        blob: selected.blob,
        filename: selected.filename,
        mimeType: selected.mimeType,
      })
      setExportMessage('Download gestart.')
    } catch {
      setExportMessage('Export mislukt. Probeer opnieuw.')
    }
  }

  const handleShare = async () => {
    if (!lastExport || !hasShareSupport) return
    try {
      const file = new File([lastExport.blob], lastExport.filename, {
        type: lastExport.mimeType,
      })
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        setExportMessage('Delen wordt niet ondersteund op dit apparaat.')
        return
      }
      await navigator.share({
        title: 'Impact Energy export',
        text: 'Aansluitingen export',
        files: [file],
      })
      setExportMessage('Bestand gedeeld.')
    } catch {
      setExportMessage('Delen geannuleerd of niet gelukt.')
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Export</h2>
        <p className="mt-2 text-sm text-slate-600">
          Exporteer de aansluitingen naar Excel, CSV of PDF.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Gegevens laden...</p>
        ) : !hasData ? (
          <p className="mt-4 text-sm text-slate-500">
            Nog geen aansluitingen beschikbaar.
          </p>
        ) : (
          <p className="mt-4 text-sm text-slate-600">
            {connections.length} aansluiting
            {connections.length === 1 ? '' : 'en'} klaar voor export.
          </p>
        )}
        {incompleteCount > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {incompleteCount} aansluiting
            {incompleteCount === 1 ? '' : 'en'} incompleet. Export kan doorgaan
            met waarschuwing.
          </div>
        )}
        {exportMessage && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {exportMessage}
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!hasData}
            onClick={() => handleExport('xlsx')}
            className="btn-primary disabled:cursor-not-allowed"
          >
            Export Excel
          </button>
          <button
            type="button"
            disabled={!hasData}
            onClick={() => handleExport('csv')}
            className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export CSV
          </button>
          <button
            type="button"
            disabled={!hasData}
            onClick={() => handleExport('pdf')}
            className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export PDF
          </button>
          {hasShareSupport && (
            <button
              type="button"
              disabled={!lastExport}
              onClick={handleShare}
              className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Deel laatste export
            </button>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Controleer de aansluitingen voordat je exporteert.
        <div className="mt-4">
          <Link
            to="/connections"
            className="btn-secondary text-xs"
          >
            Naar overzicht
          </Link>
        </div>
      </section>
    </div>
  )
}
