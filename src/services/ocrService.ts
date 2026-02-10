import * as Tesseract from 'tesseract.js'
import { getDocument, GlobalWorkerOptions, type PDFPageProxy } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

const OCR_LANGS = 'nld+eng'
const OCR_LANG_PATH = 'https://tessdata.projectnaptha.com/4.0.0'
const IMAGE_MAX_DIMENSION = 2400

export interface OcrProgress {
  status: string
  progress: number
}

export interface OcrPdfResult {
  text: string
  confidence: number
  pageCount: number
}

let workerPromise: Promise<Tesseract.Worker> | null = null
let activeLogger: ((message: Tesseract.LoggerMessage) => void) | null = null
let workerConfigured = false

const getWorker = async () => {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker(
      OCR_LANGS,
      Tesseract.OEM.LSTM_ONLY,
      {
        langPath: OCR_LANG_PATH,
        logger: (message) => {
          if (activeLogger) {
            activeLogger(message)
          }
        },
      },
    )
  }
  const worker = await workerPromise
  if (!workerConfigured) {
    await worker.setParameters({ preserve_interword_spaces: '1' })
    workerConfigured = true
  }
  return worker
}

const renderPdfPage = async (page: PDFPageProxy, scale = 2) => {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas context ontbreekt')
  }
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  await page.render({ canvas, canvasContext: context, viewport }).promise
  page.cleanup()
  return canvas
}

export const renderPdfFileToImageDataUrls = async (
  file: File,
  scale = 1.5,
  quality = 0.82,
) => {
  const buffer = await file.arrayBuffer()
  const loadingTask = getDocument({ data: buffer })
  const pdf = await loadingTask.promise
  const pages: string[] = []
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex)
    const canvas = await renderPdfPage(page, scale)
    pages.push(canvas.toDataURL('image/jpeg', quality))
  }
  return pages
}

const fitWithinMaxDimension = (width: number, height: number) => {
  const longest = Math.max(width, height)
  if (longest <= IMAGE_MAX_DIMENSION) return { width, height }
  const ratio = IMAGE_MAX_DIMENSION / longest
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

const preprocessCanvas = (
  source: CanvasImageSource,
  width: number,
  height: number,
) => {
  const targetSize = fitWithinMaxDimension(width, height)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    return source as Tesseract.ImageLike
  }
  canvas.width = targetSize.width
  canvas.height = targetSize.height
  context.filter = 'grayscale(1) contrast(1.25)'
  context.drawImage(source, 0, 0, targetSize.width, targetSize.height)
  return canvas
}

const preprocessImage = async (image: Tesseract.ImageLike) => {
  if (typeof document === 'undefined') return image
  if (image instanceof HTMLCanvasElement) {
    return preprocessCanvas(image, image.width, image.height)
  }
  if (image instanceof Blob && typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' })
      return preprocessCanvas(bitmap, bitmap.width, bitmap.height)
    } catch {
      return image
    } finally {
      bitmap?.close()
    }
  }
  return image
}

export const recognizeImage = async (
  image: Tesseract.ImageLike,
  onProgress?: (progress: OcrProgress) => void,
) => {
  const worker = await getWorker()
  activeLogger = (message) => {
    onProgress?.({ status: message.status, progress: message.progress })
  }

  try {
    const preparedImage = await preprocessImage(image)
    const result = await worker.recognize(preparedImage)
    return {
      text: result.data.text ?? '',
      confidence: result.data.confidence ?? 0,
    }
  } finally {
    activeLogger = null
  }
}

export const recognizePdfFile = async (
  file: File,
  onProgress?: (progress: OcrProgress) => void,
): Promise<OcrPdfResult> => {
  const buffer = await file.arrayBuffer()
  const loadingTask = getDocument({ data: buffer })
  const pdf = await loadingTask.promise
  let combinedText = ''
  let totalConfidence = 0
  const pageCount = pdf.numPages

  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex)
    const canvas = await renderPdfPage(page, 2)
    const pageProgressOffset = (pageIndex - 1) / pageCount
    const { text, confidence } = await recognizeImage(canvas, (progress) => {
      const scaled = progress.progress / pageCount
      onProgress?.({
        status: `Pagina ${pageIndex}/${pageCount}: ${progress.status}`,
        progress: Math.min(0.99, pageProgressOffset + scaled),
      })
    })
    combinedText = `${combinedText}\n${text}`.trim()
    totalConfidence += confidence
    onProgress?.({
      status: `Pagina ${pageIndex}/${pageCount} klaar`,
      progress: pageIndex / pageCount,
    })
  }

  return {
    text: combinedText,
    confidence: pageCount > 0 ? totalConfidence / pageCount : 0,
    pageCount,
  }
}
