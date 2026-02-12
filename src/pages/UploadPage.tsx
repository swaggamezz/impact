import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useUploads } from '../contexts/uploadContext'

const fileKey = (file: File) =>
  `${file.name}-${file.lastModified}-${file.size}`

const mergeFiles = (current: File[], incoming: File[]) => {
  const seen = new Set(current.map(fileKey))
  const next = [...current]
  for (const file of incoming) {
    const key = fileKey(file)
    if (!seen.has(key)) {
      seen.add(key)
      next.push(file)
    }
  }
  return next
}

const classifyFiles = (files: File[]) => {
  const photos: File[] = []
  const pdfs: File[] = []
  const excels: File[] = []
  const skipped: File[] = []

  for (const file of files) {
    const name = file.name.toLowerCase()
    const type = file.type.toLowerCase()
    if (type.startsWith('image/') || name.endsWith('.heic')) {
      photos.push(file)
      continue
    }
    if (type === 'application/pdf' || name.endsWith('.pdf')) {
      pdfs.push(file)
      continue
    }
    if (type === 'text/csv' || name.endsWith('.csv')) {
      excels.push(file)
      continue
    }
    if (
      type ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      name.endsWith('.docx')
    ) {
      excels.push(file)
      continue
    }
    if (
      type.includes('spreadsheet') ||
      name.endsWith('.xlsx') ||
      name.endsWith('.xls')
    ) {
      excels.push(file)
      continue
    }
    skipped.push(file)
  }

  return { photos, pdfs, excels, skipped }
}

export const UploadPage = () => {
  const navigate = useNavigate()
  const {
    photoFiles,
    pdfFiles,
    excelFiles,
    setPhotoFiles,
    setPdfFiles,
    setExcelFiles,
    clearUploads,
  } = useUploads()
  const [notice, setNotice] = useState<string | null>(null)

  const totalUploads = photoFiles.length + pdfFiles.length + excelFiles.length
  const canProceed = totalUploads > 0
  const photoLabel = `${photoFiles.length} foto${photoFiles.length === 1 ? '' : "'s"} geselecteerd`
  const pdfLabel = `${pdfFiles.length} PDF${pdfFiles.length === 1 ? '' : "'s"} geselecteerd`
  const excelLabel = `${excelFiles.length} Excel/CSV/DOCX-bestand${
    excelFiles.length === 1 ? '' : 'en'
  } geselecteerd`

  const handleFilesSelected = (files: File[]) => {
    if (files.length === 0) return
    const { photos, pdfs, excels, skipped } = classifyFiles(files)
    setPhotoFiles(mergeFiles(photoFiles, photos))
    setPdfFiles(mergeFiles(pdfFiles, pdfs))
    setExcelFiles(mergeFiles(excelFiles, excels))
    if (skipped.length > 0) {
      setNotice(
        `${skipped.length} bestand${
          skipped.length === 1 ? '' : 'en'
        } kunnen we niet lezen. Gebruik JPG, PNG, HEIC, PDF, XLSX, CSV of DOCX.`,
      )
    } else {
      setNotice(null)
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Upload
        </p>
        <h2 className="mt-2 text-xl font-semibold sm:text-2xl">Upload bestanden</h2>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          Selecteer foto's, PDF's en Excel/CSV/DOCX in 1 keer. De app herkent het type automatisch.
        </p>
        <div className="mt-6">
          <label
            htmlFor="upload-files"
            className="flex min-h-[96px] w-full cursor-pointer flex-col items-start justify-center rounded-2xl border border-[var(--impact-blue)] bg-[var(--impact-blue)] px-5 py-4 text-white shadow-sm transition hover:bg-[var(--impact-navy)] focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--impact-blue)] focus-within:ring-offset-2"
          >
            <span className="text-lg font-semibold">Upload bestanden</span>
            <span className="mt-1 text-sm text-blue-100">
              Je kunt meerdere bestanden tegelijk kiezen
            </span>
          </label>
          <input
            id="upload-files"
            type="file"
            multiple
            accept="image/*,.heic,application/pdf,.xlsx,.xls,.csv,.docx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv"
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              handleFilesSelected(files)
              event.currentTarget.value = ''
            }}
          />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Ondersteund: JPG, PNG, HEIC, PDF, XLSX, CSV, DOCX.
        </p>
        {notice && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {notice}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold sm:text-lg">Geselecteerde bestanden</h3>
            <p className="mt-1 text-sm text-slate-600 sm:text-base">
              {totalUploads === 0
                ? 'Nog geen bestanden gekozen.'
                : `${totalUploads} bestand${
                    totalUploads === 1 ? '' : 'en'
                  } klaar voor verwerking.`}
            </p>
          </div>
          <div className="flex w-full flex-col-reverse gap-3 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={clearUploads}
              className="btn-secondary w-full sm:w-auto"
              disabled={!canProceed}
            >
              Verwijder alles
            </button>
            <button
              type="button"
              disabled={!canProceed}
              onClick={() => navigate('/ocr-preview', { state: { autoStart: true } })}
              className="btn-primary w-full px-6 py-3 text-base disabled:cursor-not-allowed sm:w-auto"
            >
              Start verwerking
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {photoLabel}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {pdfLabel}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {excelLabel}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Na Start verwerking zie je per bestand de status: lezen, OCR, extractie en klaar.
        </p>
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Tip: upload alles in 1 keer. Daarna controleren we de velden samen.
        <div className="mt-4">
          <Link to="/" className="btn-secondary text-xs">
            Terug naar start
          </Link>
        </div>
      </section>
    </div>
  )
}
