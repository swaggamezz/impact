import { Link, useLocation } from 'react-router-dom'
import { useReview } from '../contexts/reviewContext'
import { useUploads } from '../contexts/uploadContext'

const steps = [
  {
    path: '/',
    label: 'Start',
    description: 'Begin hier',
  },
  {
    path: '/upload',
    label: 'Upload',
    description: 'Selecteer bestanden',
  },
  {
    path: '/ocr-preview',
    label: 'Detectie',
    description: 'OCR leest velden',
  },
  {
    path: '/controle',
    label: 'Controle',
    description: 'Controleer en corrigeer',
  },
  {
    path: '/connections',
    label: 'Overzicht',
    description: 'Lijst met aansluitingen',
  },
  {
    path: '/export',
    label: 'Export',
    description: 'Download Excel, CSV of PDF',
  },
]

const isActiveStep = (pathname: string, stepPath: string) => {
  if (stepPath === '/controle') {
    return pathname.startsWith('/controle')
  }
  if (stepPath === '/connections') {
    return (
      pathname.startsWith('/connections') ||
      pathname.startsWith('/overzicht') ||
      pathname.startsWith('/aansluiting')
    )
  }
  return pathname === stepPath
}

const getStepIndex = (pathname: string) => {
  const index = steps.findIndex((step) => isActiveStep(pathname, step.path))
  return index === -1 ? 0 : index
}

export const StepWizard = () => {
  const location = useLocation()
  const currentIndex = getStepIndex(location.pathname)
  const previousStep = steps[currentIndex - 1]
  const nextStep = steps[currentIndex + 1]
  const { photoFiles, pdfFiles, excelFiles } = useUploads()
  const { connections: pendingConnections } = useReview()
  const uploadCount = photoFiles.length + pdfFiles.length + excelFiles.length

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Stappenplan
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            Stap {currentIndex + 1}: {steps[currentIndex].label}
          </p>
          <p className="text-xs text-slate-500">
            {steps[currentIndex].description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {previousStep && (
            <Link to={previousStep.path} className="btn-secondary text-xs">
              Vorige
            </Link>
          )}
          {nextStep && (
            <Link to={nextStep.path} className="btn-primary text-xs">
              Volgende: {nextStep.label}
            </Link>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {steps.map((step, index) => {
          const status =
            index < currentIndex
              ? 'complete'
              : index === currentIndex
              ? 'current'
              : 'upcoming'
          return (
            <Link
              key={step.path}
              to={step.path}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                status === 'current'
                  ? 'border-[var(--impact-blue)] bg-[var(--impact-ice)]'
                  : status === 'complete'
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                    status === 'current'
                      ? 'bg-[var(--impact-blue)] text-white'
                      : status === 'complete'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {step.label}
                  </p>
                  <p className="text-xs text-slate-500">{step.description}</p>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
      <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          Uploads klaar: {uploadCount}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          Te controleren: {pendingConnections.length}
        </div>
      </div>
    </div>
  )
}
