import { useCallback, useEffect, useState } from 'react'
import type { ConnectionDraft } from '../models/connection'
import {
  clearAllConnections,
  deleteConnection,
  getAllConnections,
  saveConnection,
} from '../services/storageService'

export const useConnections = () => {
  const [connections, setConnections] = useState<ConnectionDraft[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const items = await getAllConnections()
    setConnections(items)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = useCallback(
    async (connection: ConnectionDraft) => {
      await saveConnection(connection)
      await refresh()
    },
    [refresh],
  )

  const remove = useCallback(
    async (id: string) => {
      await deleteConnection(id)
      await refresh()
    },
    [refresh],
  )

  const reset = useCallback(async () => {
    await clearAllConnections()
    await refresh()
  }, [refresh])

  return {
    connections,
    loading,
    refresh,
    save,
    remove,
    reset,
  }
}
