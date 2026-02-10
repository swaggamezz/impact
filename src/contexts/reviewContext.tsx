import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ConnectionDraft } from '../models/connection'

export type PendingReport = {
  warnings: string[]
  errors: string[]
  bySource: {
    photo: number
    pdf: number
    excel: number
  }
}

type PendingState = {
  connections: ConnectionDraft[]
  report: PendingReport | null
}

interface ReviewContextValue extends PendingState {
  setPendingConnections: (connections: ConnectionDraft[]) => void
  setPendingReport: (report: PendingReport | null) => void
  clearPending: () => void
}

const STORAGE_KEY = 'impact-energy.pending'

const readStorage = (): PendingState => {
  if (typeof sessionStorage === 'undefined') {
    return { connections: [], report: null }
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { connections: [], report: null }
    const parsed = JSON.parse(raw) as PendingState
    return {
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
      report: parsed.report ?? null,
    }
  } catch {
    return { connections: [], report: null }
  }
}

const writeStorage = (state: PendingState) => {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const ReviewContext = createContext<ReviewContextValue | undefined>(undefined)

export const ReviewProvider = ({ children }: { children: ReactNode }) => {
  const initial = readStorage()
  const [connections, setConnections] = useState<ConnectionDraft[]>(
    initial.connections,
  )
  const [report, setReport] = useState<PendingReport | null>(initial.report)

  useEffect(() => {
    writeStorage({ connections, report })
  }, [connections, report])

  const value = useMemo<ReviewContextValue>(
    () => ({
      connections,
      report,
      setPendingConnections: (next) => setConnections(next),
      setPendingReport: (next) => setReport(next),
      clearPending: () => {
        setConnections([])
        setReport(null)
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem(STORAGE_KEY)
        }
      },
    }),
    [connections, report],
  )

  return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>
}

export const useReview = () => {
  const ctx = useContext(ReviewContext)
  if (!ctx) {
    throw new Error('useReview must be used within ReviewProvider')
  }
  return ctx
}
