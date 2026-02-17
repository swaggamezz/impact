import { useEffect, useMemo, useRef, useState } from 'react'
import { getKvkProfile, searchKvk } from '../services/kvkService'
import type { KvkProfile, KvkSearchItem, KvkSignatory } from '../types/kvk'

type Step = 'search' | 'preview'

type Props = {
  onApply: (profile: KvkProfile, signatory?: KvkSignatory) => void
}

const formatAddress = (profile?: KvkProfile) => {
  if (!profile) return '-'
  const parts = [
    profile.address.street,
    profile.address.houseNumber,
    profile.address.houseNumberAddition,
  ].filter(Boolean)
  const line1 = parts.join(' ')
  const line2 = [profile.address.postcode, profile.address.city]
    .filter(Boolean)
    .join(' ')
  if (!line1 && !line2) return '-'
  if (!line2) return line1
  if (!line1) return line2
  return `${line1}, ${line2}`
}

export const KvkLookupWizard = ({ onApply }: Props) => {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<KvkSearchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedProfile, setSelectedProfile] = useState<KvkProfile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [selectedSignatory, setSelectedSignatory] = useState<string>('')
  const [successHint, setSuccessHint] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<number | undefined>(undefined)

  const signatories = selectedProfile?.signatories ?? []
  const hasMultipleSignatories = signatories.length > 1

  useEffect(() => {
    if (!open) return

    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setError(null)
      return
    }

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
    }
    abortRef.current?.abort()

    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)

    debounceRef.current = window.setTimeout(async () => {
      try {
        const items = await searchKvk(trimmed, controller.signal)
        setResults(items.slice(0, 10))
        setLoading(false)
      } catch (err) {
        if ((err as DOMException).name === 'AbortError') return
        setError('Zoeken mislukt. Probeer het opnieuw.')
        setLoading(false)
      }
    }, 400)

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current)
      }
      controller.abort()
    }
  }, [open, query])

  const handleSelect = async (item: KvkSearchItem) => {
    if (!item.kvkNumber) return
    setStep('preview')
    setProfileLoading(true)
    setProfileError(null)
    setSelectedProfile(null)
    setSelectedSignatory('')
    setSuccessHint(null)
    try {
      const profile = await getKvkProfile(item.kvkNumber)
      setSelectedProfile(profile)
      if (profile.signatories.length === 1) {
        setSelectedSignatory(profile.signatories[0].name)
      }
    } catch {
      setProfileError('KVK-profiel ophalen mislukt.')
    } finally {
      setProfileLoading(false)
    }
  }

  const handleApply = () => {
    if (!selectedProfile) return
    const signatory =
      signatories.find((entry) => entry.name === selectedSignatory) ??
      (signatories.length === 1 ? signatories[0] : undefined)
    onApply(selectedProfile, signatory)
    setSuccessHint(
      'Gegevens automatisch ingevuld via KVK - je kunt dit aanpassen.',
    )
  }

  const hintVisible = useMemo(
    () => successHint && successHint.trim().length > 0,
    [successHint],
  )

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Afsluiter via KVK
          </h3>
          <p className="text-xs text-slate-600">
            Zoek bedrijf en vul gegevens automatisch in.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((prev) => !prev)
            setSuccessHint(null)
          }}
          className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-400"
        >
          {open ? 'Sluiten' : 'Bedrijf zoeken via KVK (optioneel)'}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {step === 'search' && (
            <>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Zoek op bedrijfsnaam of KVK-nummer..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              {loading && (
                <p className="text-xs text-slate-500">Zoeken...</p>
              )}
              {!loading && error && (
                <p className="text-xs text-red-600">{error}</p>
              )}
              {!loading && !error && query.trim() && results.length === 0 && (
                <p className="text-xs text-slate-500">Geen resultaten.</p>
              )}
              {results.length > 0 && (
                <ul className="space-y-2">
                  {results.map((item) => (
                    <li key={`${item.kvkNumber}-${item.name}`}>
                      <button
                        type="button"
                        onClick={() => handleSelect(item)}
                        className="flex w-full flex-col rounded-xl border border-slate-200 bg-white px-4 py-2 text-left text-xs transition hover:border-slate-300"
                      >
                        <span className="font-semibold text-slate-800">
                          {item.name || 'Onbekend bedrijf'}
                        </span>
                        <span className="text-slate-500">
                          KvK {item.kvkNumber || '-'}
                          {item.city ? ` · ${item.city}` : ''}
                        </span>
                        {item.type && (
                          <span className="text-slate-400">{item.type}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {step === 'preview' && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs">
              {profileLoading && (
                <p className="text-slate-500">Gegevens ophalen...</p>
              )}
              {!profileLoading && profileError && (
                <p className="text-red-600">{profileError}</p>
              )}
              {!profileLoading && selectedProfile && (
                <>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-800">
                      {selectedProfile.legalName || 'Bedrijfsnaam'}
                    </p>
                    <p className="text-slate-500">
                      KvK {selectedProfile.kvkNumber}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-slate-500">Rechtsvorm</p>
                    <p className="text-slate-800">
                      {selectedProfile.legalForm || '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-slate-500">Adres (hoofdvestiging)</p>
                    <p className="text-slate-800">
                      {formatAddress(selectedProfile)}
                    </p>
                  </div>
                  {signatories.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-slate-500">Tekenbevoegde(n)</p>
                      {hasMultipleSignatories ? (
                        <select
                          value={selectedSignatory}
                          onChange={(event) =>
                            setSelectedSignatory(event.target.value)
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                        >
                          <option value="">Selecteer tekenbevoegde</option>
                          {signatories.map((entry) => (
                            <option key={entry.name} value={entry.name}>
                              {entry.name}
                              {entry.role ? ` (${entry.role})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-slate-800">
                          {signatories[0].name}
                          {signatories[0].role ? ` (${signatories[0].role})` : ''}
                        </p>
                      )}
                    </div>
                  )}
                  {hintVisible && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                      {successHint}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep('search')}
                      className="btn-secondary text-xs"
                    >
                      Terug
                    </button>
                    <button
                      type="button"
                      onClick={handleApply}
                      className="btn-primary text-xs"
                      disabled={!selectedProfile}
                    >
                      Vul gegevens in
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
