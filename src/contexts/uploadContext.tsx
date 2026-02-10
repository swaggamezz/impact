import type { ReactNode } from 'react'
import { createContext, useContext, useMemo, useState } from 'react'

interface UploadState {
  photoFiles: File[]
  pdfFiles: File[]
  excelFiles: File[]
}

interface UploadContextValue extends UploadState {
  setPhotoFiles: (files: File[]) => void
  setPdfFiles: (files: File[]) => void
  setExcelFiles: (files: File[]) => void
  clearUploads: () => void
}

const UploadContext = createContext<UploadContextValue | undefined>(undefined)

export const UploadProvider = ({ children }: { children: ReactNode }) => {
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [pdfFiles, setPdfFiles] = useState<File[]>([])
  const [excelFiles, setExcelFiles] = useState<File[]>([])

  const value = useMemo<UploadContextValue>(
    () => ({
      photoFiles,
      pdfFiles,
      excelFiles,
      setPhotoFiles,
      setPdfFiles,
      setExcelFiles,
      clearUploads: () => {
        setPhotoFiles([])
        setPdfFiles([])
        setExcelFiles([])
      },
    }),
    [photoFiles, pdfFiles, excelFiles],
  )

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
}

export const useUploads = () => {
  const ctx = useContext(UploadContext)
  if (!ctx) {
    throw new Error('useUploads must be used within UploadProvider')
  }
  return ctx
}
