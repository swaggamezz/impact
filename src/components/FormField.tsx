import type { ReactNode } from 'react'
import type { FieldConfidence } from '../utils/validation'

interface FormFieldProps {
  label: string
  htmlFor: string
  required?: boolean
  error?: string
  warning?: string
  confidence?: FieldConfidence
  className?: string
  helpText?: string
  children: ReactNode
}

export const FormField = ({
  label,
  htmlFor,
  required,
  error,
  warning,
  confidence,
  className,
  helpText,
  children,
}: FormFieldProps) => {
  const confidenceClass =
    confidence === 'hoog'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : confidence === 'midden'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-red-200 bg-red-50 text-red-700'

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`.trim()}>
      <div className="flex items-center gap-2">
        <label
          htmlFor={htmlFor}
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
        {confidence && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${confidenceClass}`}
          >
            {confidence}
          </span>
        )}
        {helpText && (
          <span className="relative inline-flex items-center justify-center group">
            <button
              type="button"
              aria-label={`Uitleg ${label}`}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-bold text-slate-600 transition hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              ?
            </button>
            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-56 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-normal text-slate-600 opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100">
              {helpText}
            </span>
          </span>
        )}
      </div>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!error && warning && <p className="text-xs text-amber-700">{warning}</p>}
    </div>
  )
}
