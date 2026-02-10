import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useReview } from '../contexts/reviewContext'
import { useUploads } from '../contexts/uploadContext'
import type { ConnectionDraft } from '../models/connection'
import { extractConnectionsFromExcelFile } from '../services/extractorService'
import {
  extractConnectionsFromImageWithProvider,
  extractConnectionsFromPdfWithProvider,
} from '../services/extractionProviderService'

type FileStatus = {
  status: 'waiting' | 'processing' | 'done' | 'error' | 'stopped'
  progress: number
  message?: string
  resultCount?: number
}

type ProcessingTask = {
  kind: 'photo' | 'pdf' | 'excel'
  file: File
}

type ProcessingSummary = {
  warnings: string[]
  errors: string[]
  bySource: {
    photo: number
    pdf: number
    excel: number
  }
  detectedCount: number
  stopped: boolean
}

const fileKey = (file: File) =>
  `${file.name}-${file.lastModified}-${file.size}`

const MAX_CONCURRENT_FILES = 2

const FileList = ({
  title,
  files,
  statusMap,
  onRemoveFile,
  disableRemove,
}: {
  title: string
  files: File[]
  statusMap: Record<string, FileStatus>
  onRemoveFile?: (file: File) => void
  disableRemove?: boolean
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-center justify-between">
      <h3 className="text-base font-semibold">{title}</h3>
      <span className="text-xs font-semibold text-slate-500">
        {files.length} bestand{files.length === 1 ? '' : 'en'}
      </span>
    </div>
    {files.length === 0 ? (
      <p className="mt-3 text-sm text-slate-500">Nog geen uploads.</p>
    ) : (
      <ul className="mt-4 space-y-3">
        {files.map((file) => {
          const status = statusMap[fileKey(file)] ?? {
            status: 'waiting',
            progress: 0,
          }
          const progressPercent = Math.round(status.progress * 100)
          return (
            <li
              key={fileKey(file)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{file.name}</span>
                <span className="text-xs text-slate-500">
                  {status.status === 'processing'
                    ? `${progressPercent}%`
                    : status.status === 'done'
                    ? 'Klaar'
                    : status.status === 'stopped'
                    ? 'Gestopt'
                    : status.status === 'error'
                    ? 'Fout'
                    : 'Wacht'}
                </span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                <div
                  className={`h-2 rounded-full ${
                    status.status === 'error'
                      ? 'bg-red-400'
                      : status.status === 'stopped'
                      ? 'bg-amber-400'
                      : status.status === 'done'
                      ? 'bg-emerald-500'
                      : 'bg-[var(--impact-blue)]'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {status.message && (
                <p className="mt-2 text-xs text-slate-500">
                  {status.message}
                </p>
              )}
              {status.resultCount !== undefined && (
                <p className="mt-1 text-xs text-slate-500">
                  {status.resultCount} aansluiting
                  {status.resultCount === 1 ? '' : 'en'} gevonden
                </p>
              )}
              {onRemoveFile &&
                !disableRemove &&
                status.status !== 'processing' && (
                <button
                  type="button"
                  onClick={() => onRemoveFile(file)}
                  className="mt-2 rounded-full border border-slate-300 px-3 py-1 text-[10px] font-semibold text-slate-600 transition hover:border-slate-400"
                >
                  Verwijder
                </button>
                )}
            </li>
          )
        })}
      </ul>
    )}
  </div>
)

export const OcrPreviewPage = () => {
  const {
    photoFiles,
    pdfFiles,
    excelFiles,
    clearUploads,
    setPhotoFiles,
    setPdfFiles,
    setExcelFiles,
  } = useUploads()
  const { setPendingConnections, setPendingReport } = useReview()
  const navigate = useNavigate()
  const location = useLocation()
  const hasAutoStartedRef = useRef(false)
  const stopRequestedRef = useRef(false)
  const [processing, setProcessing] = useState(false)
  const [stopRequested, setStopRequested] = useState(false)
  const [statusMap, setStatusMap] = useState<Record<string, FileStatus>>({})
  const [summary, setSummary] = useState<ProcessingSummary | null>(null)

  const allFiles = useMemo(
    () => [...photoFiles, ...pdfFiles, ...excelFiles],
    [photoFiles, pdfFiles, excelFiles],
  )
  const hasUploads = allFiles.length > 0

  const updateStatus = (key: string, next: Partial<FileStatus>) => {
    setStatusMap((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? { status: 'waiting', progress: 0 }),
        ...next,
      },
    }))
  }
  const removeFileFrom = (
    files: File[],
    setter: (next: File[]) => void,
  ) => {
    return (file: File) => {
      if (processing) return
      const key = fileKey(file)
      setter(files.filter((item) => fileKey(item) !== key))
      setStatusMap((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  useEffect(() => {
    setStatusMap((prev) => {
      const next: Record<string, FileStatus> = {}
      for (const file of allFiles) {
        const key = fileKey(file)
        next[key] = prev[key] ?? { status: 'waiting', progress: 0 }
      }
      return next
    })
  }, [allFiles])

  const queueStats = useMemo(() => {
    const stats = {
      waiting: 0,
      processing: 0,
      done: 0,
      error: 0,
      stopped: 0,
    }
    for (const file of allFiles) {
      const state = statusMap[fileKey(file)]?.status ?? 'waiting'
      if (state === 'waiting') stats.waiting += 1
      if (state === 'processing') stats.processing += 1
      if (state === 'done') stats.done += 1
      if (state === 'error') stats.error += 1
      if (state === 'stopped') stats.stopped += 1
    }
    return stats
  }, [allFiles, statusMap])

  const totalProgress = useMemo(() => {
    if (allFiles.length === 0) return 0
    const total = allFiles.reduce((sum, file) => {
      const progress = statusMap[fileKey(file)]?.progress ?? 0
      return sum + Math.min(1, Math.max(0, progress))
    }, 0)
    return total / allFiles.length
  }, [allFiles, statusMap])

  const totalProgressPercent = Math.round(totalProgress * 100)

  const requestStopProcessing = () => {
    if (!processing) return
    stopRequestedRef.current = true
    setStopRequested(true)
  }

  const processUploads = async () => {
    if (!hasUploads || processing) return
    stopRequestedRef.current = false
    setStopRequested(false)
    setProcessing(true)
    setSummary(null)
    setPendingConnections([])
    setPendingReport(null)
    setStatusMap(() =>
      Object.fromEntries(
        allFiles.map((file) => [
          fileKey(file),
          { status: 'waiting', progress: 0, message: 'In wachtrij' } as FileStatus,
        ]),
      ),
    )
    const warnings: string[] = []
    const errors: string[] = []
    const newConnections: ConnectionDraft[] = []
    const bySource = { photo: 0, pdf: 0, excel: 0 }
    const tasks: ProcessingTask[] = [
      ...photoFiles.map((file) => ({ kind: 'photo' as const, file })),
      ...pdfFiles.map((file) => ({ kind: 'pdf' as const, file })),
      ...excelFiles.map((file) => ({ kind: 'excel' as const, file })),
    ]
    const handledKeys = new Set<string>()

    try {
      const processTask = async (task: ProcessingTask) => {
        const file = task.file
        const key = fileKey(file)
        if (stopRequestedRef.current) {
          return
        }
        updateStatus(key, {
          status: 'processing',
          progress: 0,
          message: 'Bezig met lezen',
        })

        try {
          if (task.kind === 'photo') {
            const { connections: extracted, warning } =
              await extractConnectionsFromImageWithProvider(
                file,
                {
                  source: 'OCR_PHOTO',
                  allowMultiple: true,
                },
                (progress) => {
                  updateStatus(key, {
                    status: 'processing',
                    progress: progress.progress,
                    message: progress.status,
                  })
                },
              )
            if (warning) {
              warnings.push(`Foto ${file.name}: ${warning}`)
            }
            newConnections.push(...extracted)
            bySource.photo += extracted.length
            updateStatus(key, {
              status: 'done',
              progress: 1,
              resultCount: extracted.length,
              message: 'Klaar',
            })
            return
          }

          if (task.kind === 'pdf') {
            const { connections: extracted, warning } =
              await extractConnectionsFromPdfWithProvider(
                file,
                {
                  source: 'OCR_PDF',
                  allowMultiple: false,
                  splitMode: 'none',
                },
                (progress) => {
                  updateStatus(key, {
                    status: 'processing',
                    progress: progress.progress,
                    message: progress.status,
                  })
                },
              )
            if (warning) {
              warnings.push(`PDF ${file.name}: ${warning}`)
            }
            newConnections.push(...extracted)
            bySource.pdf += extracted.length
            updateStatus(key, {
              status: 'done',
              progress: 1,
              resultCount: extracted.length,
              message: 'Klaar',
            })
            return
          }

          updateStatus(key, {
            status: 'processing',
            progress: 0.5,
            message: 'Bezig met extractie',
          })
          const { connections, unmappedHeaders } =
            await extractConnectionsFromExcelFile(file)
          newConnections.push(...connections)
          bySource.excel += connections.length
          if (unmappedHeaders.length > 0) {
            warnings.push(
              `Excel ${file.name}: geen match voor kolommen ${unmappedHeaders.join(', ')}`,
            )
          }
          updateStatus(key, {
            status: 'done',
            progress: 1,
            resultCount: connections.length,
            message: 'Klaar',
          })
        } catch {
          if (task.kind === 'photo') {
            errors.push(
              `Dit bestand kunnen we niet lezen: ${file.name}. Probeer een scherpere foto of scan.`,
            )
          } else if (task.kind === 'pdf') {
            errors.push(
              `Dit bestand kunnen we niet lezen: ${file.name}. Probeer een scherpere scan.`,
            )
          } else {
            errors.push(
              `Dit Excel-bestand kunnen we niet lezen: ${file.name}. Controleer of het een .xlsx bestand is.`,
            )
          }
          updateStatus(key, {
            status: 'error',
            progress: 1,
            message: 'Fout bij verwerken',
          })
        } finally {
          handledKeys.add(key)
        }
      }

      let cursor = 0
      const runWorker = async () => {
        while (!stopRequestedRef.current) {
          const index = cursor
          if (index >= tasks.length) return
          cursor += 1
          const task = tasks[index]
          if (!task) return
          await processTask(task)
        }
      }

      const workerCount = Math.min(MAX_CONCURRENT_FILES, tasks.length)
      await Promise.all(
        Array.from({ length: workerCount }, () => runWorker()),
      )

      if (stopRequestedRef.current) {
        const skippedTasks = tasks.filter(
          (task) => !handledKeys.has(fileKey(task.file)),
        )
        for (const task of skippedTasks) {
          updateStatus(fileKey(task.file), {
            status: 'stopped',
            progress: 0,
            message: 'Overgeslagen door stop',
          })
        }
        if (skippedTasks.length > 0) {
          warnings.push(
            `Verwerking is gestopt. ${skippedTasks.length} bestand${
              skippedTasks.length === 1 ? '' : 'en'
            } niet verwerkt.`,
          )
        }
      }

      if (newConnections.length > 0 && !stopRequestedRef.current) {
        setPendingConnections(newConnections)
        setPendingReport({ warnings, errors, bySource })
        clearUploads()
        navigate('/controle')
        return
      }

      if (newConnections.length > 0) {
        setPendingConnections(newConnections)
        setPendingReport({ warnings, errors, bySource })
      }
      setSummary({
        warnings,
        errors,
        bySource,
        detectedCount: newConnections.length,
        stopped: stopRequestedRef.current,
      })
    } finally {
      setProcessing(false)
      setStopRequested(false)
      stopRequestedRef.current = false
    }
  }

  useEffect(() => {
    const shouldAutoStart =
      (location.state as { autoStart?: boolean } | null)?.autoStart === true
    if (!shouldAutoStart || hasAutoStartedRef.current || processing || !hasUploads) {
      return
    }
    hasAutoStartedRef.current = true
    void processUploads()
  }, [hasUploads, location.state, processing])

  const summaryText = useMemo(() => {
    if (!summary) return null
    if (summary.detectedCount > 0) {
      return `${summary.detectedCount} aansluiting${
        summary.detectedCount === 1 ? '' : 'en'
      } gevonden.`
    }
    if (summary.stopped) {
      return 'Verwerking gestopt.'
    }
    return 'Geen aansluitingen gevonden.'
  }, [summary])

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Detectie & OCR</h2>
        <p className="mt-2 text-sm text-slate-600">
          Controleer de uploads. Start de detectie om aansluitingen uit foto,
          PDF en Excel te halen. Na afloop ga je automatisch naar Controle.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Elke PDF telt altijd als 1 aansluiting, ongeacht het aantal pagina's.
        </p>
        {hasUploads && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
              <span>Totaal voortgang</span>
              <span>{totalProgressPercent}%</span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
              <div
                className="h-2 rounded-full bg-[var(--impact-blue)]"
                style={{ width: `${totalProgressPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Wachtrij: {queueStats.waiting} wacht, {queueStats.processing}{' '}
              bezig, {queueStats.done} klaar, {queueStats.error} fout
              {queueStats.stopped > 0 ? `, ${queueStats.stopped} gestopt` : ''}.
            </p>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!hasUploads || processing}
            onClick={processUploads}
            className="btn-primary disabled:cursor-not-allowed"
          >
            {processing ? 'Bezig met detectie...' : 'Start detectie'}
          </button>
          {processing && (
            <button
              type="button"
              onClick={requestStopProcessing}
              className="rounded-full border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-600 transition hover:border-red-300 disabled:cursor-not-allowed"
              disabled={stopRequested}
            >
              {stopRequested ? 'Stop aangevraagd...' : 'Stop verwerking'}
            </button>
          )}
          <Link
            to="/upload"
            className="btn-secondary"
          >
            Uploads aanpassen
          </Link>
          <button
            type="button"
            onClick={clearUploads}
            className="btn-secondary"
          >
            Verwijder alle uploads
          </button>
        </div>
      </section>

      {summary && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm shadow-sm">
          <p className="font-semibold text-slate-800">{summaryText}</p>
          {summary.detectedCount > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Controleer de gevonden aansluitingen voordat je ze opslaat.
            </p>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 px-4 py-3 text-slate-600">
              Foto OCR: {summary.bySource.photo}
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3 text-slate-600">
              PDF OCR: {summary.bySource.pdf}
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3 text-slate-600">
              Excel import: {summary.bySource.excel}
            </div>
          </div>
          {summary.warnings.length > 0 && (
            <ul className="mt-3 space-y-2 text-slate-600">
              {summary.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {summary.errors.length > 0 && (
            <ul className="mt-3 space-y-2 text-red-600">
              {summary.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
              onClick={clearUploads}
            >
              Uploads wissen
            </button>
            {summary.detectedCount > 0 && (
              <Link to="/controle" className="btn-primary text-xs">
                Naar controle
              </Link>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <FileList
          title="Foto's"
          files={photoFiles}
          statusMap={statusMap}
          onRemoveFile={removeFileFrom(photoFiles, setPhotoFiles)}
          disableRemove={processing}
        />
        <FileList
          title="PDF's"
          files={pdfFiles}
          statusMap={statusMap}
          onRemoveFile={removeFileFrom(pdfFiles, setPdfFiles)}
          disableRemove={processing}
        />
        <FileList
          title="Excel"
          files={excelFiles}
          statusMap={statusMap}
          onRemoveFile={removeFileFrom(excelFiles, setExcelFiles)}
          disableRemove={processing}
        />
      </div>
    </div>
  )
}
