import type { KvkProfile, KvkSearchItem } from '../types/kvk'

const getSearchUrl = (query: string, limit = 10) => {
  const params = new URLSearchParams()
  params.set('q', query)
  params.set('limit', String(Math.min(10, Math.max(1, limit))))
  return `/api/kvk/search?${params.toString()}`
}

const getProfileUrl = (kvkNumber: string, vestigingsNumber?: string) => {
  const params = new URLSearchParams()
  params.set('kvkNumber', kvkNumber)
  if (vestigingsNumber) {
    params.set('vestigingsNumber', vestigingsNumber)
  }
  return `/api/kvk/profile?${params.toString()}`
}

export const searchKvk = async (
  query: string,
  signal?: AbortSignal,
): Promise<KvkSearchItem[]> => {
  const trimmed = query.trim()
  if (!trimmed) return []
  const response = await fetch(getSearchUrl(trimmed), { signal })
  if (response.status === 404) {
    return []
  }
  if (!response.ok) {
    throw new Error('KVK zoeken mislukt. Probeer het opnieuw.')
  }
  const data = (await response.json()) as { items?: KvkSearchItem[] }
  return Array.isArray(data.items) ? data.items : []
}

export const getKvkProfile = async (
  kvkNumber: string,
  signal?: AbortSignal,
  vestigingsNumber?: string,
): Promise<KvkProfile> => {
  const response = await fetch(getProfileUrl(kvkNumber, vestigingsNumber), {
    signal,
  })
  if (response.status === 404) {
    throw new Error('Geen KVK-profiel gevonden.')
  }
  if (!response.ok) {
    throw new Error('KVK-profiel ophalen mislukt.')
  }
  return (await response.json()) as KvkProfile
}
