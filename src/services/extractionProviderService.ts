import type { ConnectionDraft, ConnectionSource } from '../models/connection'
import { extractConnectionsFromText } from './extractorService'
import {
  recognizeImage,
  recognizePdfFile,
  renderPdfFileToImageDataUrls,
} from './ocrService'

export type ExtractionProvider = 'localOCR' | 'aiExtract'
export type ExtractionStage = 'reading' | 'ocr' | 'extracting' | 'done'

export interface ExtractionOptions {
  source: ConnectionSource
  allowMultiple: boolean
  splitMode?: 'auto' | 'none'
}

export interface ExtractionProgress {
  stage: ExtractionStage
  progress: number
  status: string
}

interface ProviderResponse {
  connections: ConnectionDraft[]
  warning?: string
}

type ProgressHandler = (progress: ExtractionProgress) => void

const isConnectionDraft = (value: unknown): value is ConnectionDraft =>
  typeof value === 'object' && value !== null

const normalizeConnections = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.filter(isConnectionDraft)
  }
  if (isConnectionDraft(value)) {
    return [value]
  }
  return []
}

const getAiEndpoint = () =>
  (import.meta.env.VITE_AI_EXTRACT_ENDPOINT as string | undefined) ?? '/api/extract'

const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms))

export const getExtractionProvider = (): ExtractionProvider => {
  const configured = import.meta.env.VITE_EXTRACT_PROVIDER as
    | ExtractionProvider
    | undefined
  return configured === 'aiExtract' ? 'aiExtract' : 'localOCR'
}

const emitProgress = (
  onProgress: ProgressHandler | undefined,
  stage: ExtractionStage,
  progress: number,
  status: string,
) => {
  onProgress?.({ stage, progress, status })
}

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        resolve(result)
      } else {
        reject(new Error('Kon bestand niet omzetten naar data-url'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('Bestand lezen mislukt'))
    reader.readAsDataURL(file)
  })

const optimizeImageDataUrl = async (
  file: File,
  maxDimension = 1800,
  quality = 0.82,
) => {
  if (
    typeof document === 'undefined' ||
    typeof createImageBitmap !== 'function'
  ) {
    return fileToDataUrl(file)
  }

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const longest = Math.max(bitmap.width, bitmap.height)
    const scale = longest > maxDimension ? maxDimension / longest : 1
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      return fileToDataUrl(file)
    }
    context.filter = 'grayscale(1) contrast(1.15)'
    context.drawImage(bitmap, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return fileToDataUrl(file)
  } finally {
    bitmap?.close()
  }
}

const parseAiResponse = (data: unknown) => {
  if (typeof data !== 'object' || data === null) {
    return { connections: [], warning: undefined as string | undefined }
  }
  const record = data as Record<string, unknown>
  const connections = normalizeConnections(record.connections ?? record.connection)
  const warning =
    typeof record.warning === 'string' ? record.warning : undefined
  return { connections, warning }
}

const extractFromTextLocally = (
  text: string,
  options: ExtractionOptions,
) =>
  extractConnectionsFromText(text, {
    source: options.source,
    allowMultiple: options.allowMultiple,
    splitMode: options.splitMode,
  })

const extractImageLocally = async (
  file: File,
  options: ExtractionOptions,
  onProgress?: ProgressHandler,
): Promise<ProviderResponse> => {
  emitProgress(onProgress, 'reading', 0.05, 'Bezig met lezen')
  const result = await recognizeImage(file, (progress) => {
    emitProgress(
      onProgress,
      'ocr',
      0.1 + progress.progress * 0.75,
      'Bezig met OCR',
    )
  })
  emitProgress(onProgress, 'extracting', 0.9, 'Bezig met extractie')
  const connections = extractFromTextLocally(result.text, options)
  emitProgress(onProgress, 'done', 1, 'Klaar')
  return { connections }
}

const extractPdfLocally = async (
  file: File,
  options: ExtractionOptions,
  onProgress?: ProgressHandler,
): Promise<ProviderResponse> => {
  emitProgress(onProgress, 'reading', 0.05, 'Bezig met lezen')
  const result = await recognizePdfFile(file, (progress) => {
    emitProgress(
      onProgress,
      'ocr',
      0.1 + progress.progress * 0.75,
      `Bezig met OCR (${progress.status})`,
    )
  })
  emitProgress(onProgress, 'extracting', 0.9, 'Bezig met extractie')
  const connections = extractFromTextLocally(result.text, options)
  emitProgress(onProgress, 'done', 1, 'Klaar')
  return { connections }
}

const callAiEndpoint = async (payload: Record<string, unknown>) => {
  const endpoint = getAiEndpoint()
  if (!endpoint) {
    throw new Error('AI endpoint ontbreekt')
  }

  const shouldDebug =
    (import.meta.env.VITE_DEBUG_AI as string | undefined) === 'true' ||
    import.meta.env.DEV === true

  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (response.ok) {
      const data = await response.json()
      if (shouldDebug) {
        // eslint-disable-next-line no-console
        console.log('AI extract response', data)
      }
      return data
    }

    const details = await response.text()
    const isRetryable =
      response.status === 429 || response.status === 502 || response.status === 503

    if (isRetryable && attempt < maxAttempts) {
      const retryAfterHeader = response.headers.get('retry-after')
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN
      const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : attempt * 1200
      await sleep(delayMs)
      continue
    }

    throw new Error(
      `AI extract HTTP ${response.status}${details ? ` - ${details.slice(0, 220)}` : ''}`,
    )
  }

  throw new Error('AI extract mislukt na meerdere pogingen')
}

const extractImageWithAi = async (
  file: File,
  options: ExtractionOptions,
  onProgress?: ProgressHandler,
): Promise<ProviderResponse> => {
  emitProgress(onProgress, 'reading', 0.2, 'Bezig met lezen')
  const imageDataUrl = await optimizeImageDataUrl(file)
  emitProgress(onProgress, 'extracting', 0.55, 'Bezig met AI-analyse')
  const data = await callAiEndpoint({
    inputType: 'image',
    fileName: file.name,
    mimeType: file.type || 'image/jpeg',
    imageDataUrl,
    options,
  })
  const parsed = parseAiResponse(data)
  emitProgress(onProgress, 'done', 1, 'Klaar')
  return parsed
}

const extractPdfWithAi = async (
  file: File,
  options: ExtractionOptions,
  onProgress?: ProgressHandler,
): Promise<ProviderResponse> => {
  emitProgress(onProgress, 'reading', 0.1, 'Bezig met lezen')
  const pages = await renderPdfFileToImageDataUrls(file, 1.25, 0.8)
  emitProgress(onProgress, 'extracting', 0.5, 'Bezig met AI-analyse')
  const data = await callAiEndpoint({
    inputType: 'pdf_pages',
    fileName: file.name,
    pages,
    options,
  })
  const parsed = parseAiResponse(data)
  emitProgress(onProgress, 'done', 1, 'Klaar')
  return parsed
}

export const extractConnectionsFromTextWithProvider = async (
  text: string,
  options: ExtractionOptions,
): Promise<ProviderResponse> => {
  if (getExtractionProvider() !== 'aiExtract') {
    return { connections: extractFromTextLocally(text, options) }
  }

  const data = await callAiEndpoint({
    inputType: 'text',
    text,
    options,
  })
  return parseAiResponse(data)
}

export const extractConnectionsFromImageWithProvider = async (
  file: File,
  options: ExtractionOptions,
  onProgress?: ProgressHandler,
): Promise<ProviderResponse> => {
  if (getExtractionProvider() !== 'aiExtract') {
    return extractImageLocally(file, options, onProgress)
  }
  return extractImageWithAi(file, options, onProgress)
}

export const extractConnectionsFromPdfWithProvider = async (
  file: File,
  options: ExtractionOptions,
  onProgress?: ProgressHandler,
): Promise<ProviderResponse> => {
  if (getExtractionProvider() !== 'aiExtract') {
    return extractPdfLocally(file, options, onProgress)
  }
  return extractPdfWithAi(file, options, onProgress)
}
