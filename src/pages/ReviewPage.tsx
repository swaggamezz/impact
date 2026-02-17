import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ConnectionForm } from '../components/ConnectionForm'
import { useReview } from '../contexts/reviewContext'
import { buildKvkPatch, applyKvkPatch } from '../services/kvkMapping'
import { getKvkProfile } from '../services/kvkService'
import { getAllConnections, setConnections } from '../services/storageService'
import { isValidKvk, validateConnection } from '../utils/validation'
import type { ConnectionDraft } from '../models/connection'
import type { KvkProfile, KvkSignatory } from '../types/kvk'

export const ReviewPage = () => {
  const {
    connections: pendingConnections,
    report,
    setPendingConnections,
    clearPending,
  } = useReview()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(
    pendingConnections[0]?.id ?? null,
  )
  const [saving, setSaving] = useState(false)
  const [kvkSuggestions, setKvkSuggestions] = useState<
    Record<
      string,
      {
        status: 'loading' | 'applied' | 'error'
        kvkNumber: string
        profile?: KvkProfile
        error?: string
      }
    >
  >({})
  const kvkSuggestionsRef = useRef(kvkSuggestions)

  useEffect(() => {
    kvkSuggestionsRef.current = kvkSuggestions
  }, [kvkSuggestions])

  useEffect(() => {
    if (!selectedId && pendingConnections.length > 0) {
      setSelectedId(pendingConnections[0].id)
    }
  }, [pendingConnections, selectedId])

  useEffect(() => {
    let active = true
    const controllers: AbortController[] = []

    const validConnections = pendingConnections.filter((connection) =>
      isValidKvk(connection.kvkNumber),
    )

    setKvkSuggestions((prev) => {
      const next: typeof prev = {}
      let changed = false
      for (const connection of validConnections) {
        const existing = prev[connection.id]
        if (existing && existing.kvkNumber === connection.kvkNumber) {
          next[connection.id] = existing
        } else {
          changed = true
        }
      }
      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true
      }
      return changed ? next : prev
    })

    for (const connection of validConnections) {
      const existing = kvkSuggestionsRef.current[connection.id]
      if (
        existing &&
        existing.kvkNumber === connection.kvkNumber &&
        (existing.status === 'loading' ||
          existing.status === 'applied' ||
          existing.status === 'error')
      ) {
        continue
      }
      const controller = new AbortController()
      controllers.push(controller)
      setKvkSuggestions((prev) => ({
        ...prev,
        [connection.id]: {
          status: 'loading',
          kvkNumber: connection.kvkNumber ?? '',
        },
      }))

      getKvkProfile(connection.kvkNumber ?? '', controller.signal)
        .then((profile) => {
          if (!active) return
          const autoSignatory =
            profile.signatories.length === 1 ? profile.signatories[0] : undefined
          const patch = buildKvkPatch(profile, autoSignatory as KvkSignatory | undefined)
          setPendingConnections((prev) =>
            prev.map((entry) =>
              entry.id === connection.id ? applyKvkPatch(entry, patch) : entry,
            ),
          )
          setKvkSuggestions((prev) => ({
            ...prev,
            [connection.id]: {
              status: 'applied',
              kvkNumber: connection.kvkNumber ?? '',
              profile,
            },
          }))
        })
        .catch(() => {
          if (!active) return
          setKvkSuggestions((prev) => ({
            ...prev,
            [connection.id]: {
              status: 'error',
              kvkNumber: connection.kvkNumber ?? '',
              error: 'KVK lookup mislukt.',
            },
          }))
        })
    }

    return () => {
      active = false
      controllers.forEach((controller) => controller.abort())
    }
  }, [pendingConnections])

  const selectedConnection = pendingConnections.find(
    (connection) => connection.id === selectedId,
  )

  const incompleteCount = useMemo(
    () =>
      pendingConnections.filter(
        (connection) => Object.keys(validateConnection(connection)).length > 0,
      ).length,
    [pendingConnections],
  )

  const kvkAppliedItems = useMemo(
    () =>
      pendingConnections
        .map((connection) => ({
          connection,
          suggestion: kvkSuggestions[connection.id],
        }))
        .filter(
          (item) =>
            item.suggestion?.status === 'applied' && item.suggestion.profile,
        ),
    [pendingConnections, kvkSuggestions],
  )

  const kvkErrorItems = useMemo(
    () =>
      pendingConnections
        .map((connection) => ({
          connection,
          suggestion: kvkSuggestions[connection.id],
        }))
        .filter((item) => item.suggestion?.status === 'error'),
    [pendingConnections, kvkSuggestions],
  )

  const handleChange = (
    id: string,
    field: keyof ConnectionDraft,
    value: string | boolean,
  ) => {
    setPendingConnections((prev) =>
      prev.map((connection) =>
        connection.id === id
          ? {
              ...connection,
              [field]:
                typeof value === 'string' && field.toLowerCase().includes('postcode')
                  ? value.toUpperCase()
                  : value,
            }
          : connection,
      ),
    )
  }

  const handleRemove = (id: string) => {
    const next = pendingConnections.filter((connection) => connection.id !== id)
    setPendingConnections(next)
    if (selectedId === id) {
      setSelectedId(next[0]?.id ?? null)
    }
  }

  const handleSaveAll = async () => {
    if (pendingConnections.length === 0 || saving) return
    if (incompleteCount > 0) {
      const proceed = window.confirm(
        `${incompleteCount} aansluiting${
          incompleteCount === 1 ? '' : 'en'
        } ${incompleteCount === 1 ? 'is' : 'zijn'} nog incompleet. Toch opslaan in overzicht?`,
      )
      if (!proceed) {
        return
      }
    }
    setSaving(true)
    const existing = await getAllConnections()
    await setConnections([...existing, ...pendingConnections])
    clearPending()
    setSaving(false)
    navigate('/connections')
  }

  if (pendingConnections.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold">Geen detecties om te controleren</h2>
        <p className="mt-2 text-sm text-slate-600">
          Start eerst een detectie vanuit foto, PDF of Excel.
        </p>
        <Link
          to="/upload"
          className="btn-primary mt-4"
        >
          Naar upload
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Controleer de gegevens</h2>
            <p className="mt-1 text-sm text-slate-600">
              {pendingConnections.length} aansluiting
              {pendingConnections.length === 1 ? '' : 'en'} uit detectie.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/upload"
              className="btn-secondary text-xs"
            >
              Terug naar upload
            </Link>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="btn-primary text-xs disabled:cursor-not-allowed"
            >
              {saving ? 'Opslaan...' : 'Opslaan in overzicht'}
            </button>
          </div>
        </div>
        {incompleteCount > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {incompleteCount} aansluiting
            {incompleteCount === 1 ? '' : 'en'} missen verplichte velden.
          </div>
        )}
        {kvkAppliedItems.length > 0 && (
          <div className="mt-4 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="font-semibold">
              KvK gevonden, bedrijfsgegevens zijn aangevuld. Je kunt dit aanpassen.
            </p>
            <ul className="space-y-1 text-xs text-emerald-900">
              {kvkAppliedItems.map(({ connection, suggestion }) => (
                <li key={`kvk-${connection.id}`}>
                  {(suggestion?.profile?.legalName ||
                    suggestion?.profile?.tradeName ||
                    connection.tenaamstelling ||
                    'Bedrijf') as string}{' '}
                  (KvK {suggestion?.kvkNumber})
                </li>
              ))}
            </ul>
          </div>
        )}
        {kvkErrorItems.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            KVK lookup mislukt voor{' '}
            {kvkErrorItems.length === 1
              ? '1 aansluiting.'
              : `${kvkErrorItems.length} aansluitingen.`}{' '}
            Vul dit handmatig in.
          </div>
        )}
        {report?.warnings?.length ? (
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            {report.warnings.map((warning, index) => (
              <li key={`warning-${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        ) : null}
        {report?.errors?.length ? (
          <ul className="mt-3 space-y-2 text-sm text-red-600">
            {report.errors.map((error, index) => (
              <li key={`error-${index}-${error}`}>{error}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
            Foto OCR: {report?.bySource.photo ?? 0}
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
            PDF OCR: {report?.bySource.pdf ?? 0}
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
            Excel import: {report?.bySource.excel ?? 0}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr,2fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Aansluitingen
          </p>
          <div className="mt-3 space-y-2">
            {pendingConnections.map((connection, index) => {
              const errors = validateConnection(connection)
              const errorCount = Object.keys(errors).length
              const active = connection.id === selectedId
              return (
                <button
                  key={connection.id}
                  type="button"
                  onClick={() => setSelectedId(connection.id)}
                  className={`flex w-full flex-col gap-1 rounded-xl border px-4 py-3 text-left text-sm transition ${
                    active
                      ? 'border-[var(--impact-blue)] bg-[var(--impact-blue)] text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="font-semibold">
                    Aansluiting {index + 1}
                  </span>
                  <span className={active ? 'text-white/80' : 'text-slate-500'}>
                    {connection.tenaamstelling || connection.eanCode || 'Onbekend'}
                  </span>
                  {errorCount > 0 ? (
                    <span className="text-xs font-semibold text-amber-500">
                      {errorCount} fout
                      {errorCount === 1 ? '' : 'en'}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-500">
                      Compleet
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={clearPending}
            className="btn-secondary mt-4 w-full text-xs"
          >
            Verwijder alle detecties
          </button>
        </aside>

        <section className="space-y-4">
          {selectedConnection ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {selectedConnection.tenaamstelling || 'Aansluiting bewerken'}
                  </p>
                  <p className="text-xs text-slate-500">
                    EAN: {selectedConnection.eanCode || 'Onbekend'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(selectedConnection.id)}
                  className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:border-red-300"
                >
                  Verwijder aansluiting
                </button>
              </div>
              <ConnectionForm
                value={selectedConnection}
                errors={validateConnection(selectedConnection)}
                showErrors
                onChange={(field, value) =>
                  handleChange(selectedConnection.id, field, value)
                }
              />
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
              Selecteer een aansluiting om te bewerken.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
