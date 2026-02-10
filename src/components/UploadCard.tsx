import { useId, type ChangeEvent } from 'react'

interface UploadCardProps {
  title: string
  description: string
  accept: string
  files: File[]
  multiple?: boolean
  onFilesSelected: (files: File[]) => void
  onRemoveFile?: (file: File) => void
  onClear?: () => void
}

export const UploadCard = ({
  title,
  description,
  accept,
  files,
  multiple,
  onFilesSelected,
  onRemoveFile,
  onClear,
}: UploadCardProps) => {
  const inputId = useId()

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? [])
    onFilesSelected(nextFiles)
    event.target.value = ''
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {files.length} bestand{files.length === 1 ? '' : 'en'}
        </span>
      </div>
      <label
        htmlFor={inputId}
        className="btn-primary mt-4 w-full cursor-pointer text-center"
      >
        Bestand(en) kiezen
      </label>
      <input
        id={inputId}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
      />
      {files.length > 0 && (
        <div className="mt-4 space-y-2 text-xs text-slate-500">
          {files.map((file) => (
            <div
              key={`${file.name}-${file.lastModified}-${file.size}`}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">{file.name}</span>
              {onRemoveFile && (
                <button
                  type="button"
                  onClick={() => onRemoveFile(file)}
                  className="rounded-full border border-slate-300 px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:border-slate-400"
                >
                  Verwijder
                </button>
              )}
            </div>
          ))}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="mt-2 w-full rounded-full border border-slate-300 px-3 py-2 text-[10px] font-semibold text-slate-600 transition hover:border-slate-400"
            >
              Verwijder alles
            </button>
          )}
        </div>
      )}
    </div>
  )
}
