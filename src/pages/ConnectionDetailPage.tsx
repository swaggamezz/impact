import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConnectionForm } from '../components/ConnectionForm'
import { createDraftConnection, type ConnectionDraft } from '../models/connection'
import { deleteConnection, getConnectionById, saveConnection } from '../services/storageService'
import { validateConnection } from '../utils/validation'

const FIELD_LABELS: Partial<Record<keyof ConnectionDraft, string>> = {
  eanCode: 'EAN-code',
  product: 'Product',
  tenaamstelling: 'Tenaamstelling',
  kvkNumber: 'KvK-nummer',
  legalForm: 'Rechtsvorm',
  iban: 'IBAN',
  authorizedSignatory: 'Tekenbevoegde volgens KvK',
  telemetryCode: 'Telemetriecode / Meetcode',
  deliveryStreet: 'Straat (leveringsadres)',
  deliveryHouseNumber: 'Huisnummer (leveringsadres)',
  deliveryPostcode: 'Postcode (leveringsadres)',
  deliveryCity: 'Plaats (leveringsadres)',
  marketSegment: 'Marktsegment',
}

export const ConnectionDetailPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [connection, setConnection] = useState<ConnectionDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [showErrors, setShowErrors] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setNotFound(false)

      if (!id || id === 'nieuw' || id === 'new') {
        if (active) {
          setConnection(createDraftConnection('MANUAL'))
          setLoading(false)
        }
        return
      }

      const existing = await getConnectionById(id)
      if (active) {
        if (existing) {
          setConnection(existing)
        } else {
          setConnection(createDraftConnection('MANUAL'))
          setNotFound(true)
        }
        setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [id])

  const errors = useMemo(
    () => (connection ? validateConnection(connection) : {}),
    [connection],
  )
  const errorCount = Object.keys(errors).length
  const missingFieldLabels = useMemo(
    () =>
      Object.keys(errors)
        .map((field) => FIELD_LABELS[field as keyof ConnectionDraft] ?? field)
        .slice(0, 6),
    [errors],
  )

  const handleChange = (field: keyof ConnectionDraft, value: string | boolean) => {
    let nextValue: string | boolean = value
    if (
      typeof value === 'string' &&
      field.toLowerCase().includes('postcode')
    ) {
      nextValue = value.toUpperCase()
    }
    setConnection((prev) => (prev ? { ...prev, [field]: nextValue } : prev))
  }

  const handleSave = async () => {
    if (!connection) return
    setShowErrors(true)
    if (errorCount > 0) {
      const proceed = window.confirm(
        `${errorCount} veld${errorCount === 1 ? '' : 'en'} missen nog informatie of zijn ongeldig. Toch opslaan als incompleet?`,
      )
      if (!proceed) {
        return
      }
    }
    await saveConnection(connection)
    navigate('/connections')
  }

  const handleDelete = async () => {
    if (!id || id === 'nieuw' || id === 'new' || notFound) return
    if (!window.confirm('Weet je zeker dat je deze aansluiting wilt verwijderen?')) {
      return
    }
    await deleteConnection(id)
    navigate('/connections')
  }

  if (loading || !connection) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Laden...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              {id === 'nieuw' || id === 'new'
                ? 'Nieuwe aansluiting'
                : 'Aansluiting bewerken'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Bron: {connection.source} - Aangemaakt: {connection.createdAt}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/connections"
              className="btn-secondary text-xs"
            >
              Terug
            </Link>
            <button
              type="button"
              onClick={handleSave}
              className="btn-primary text-xs"
            >
              Opslaan
            </button>
            {id !== 'nieuw' && id !== 'new' && !notFound && (
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300"
              >
                Verwijderen
              </button>
            )}
          </div>
        </div>
        {notFound && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Aansluiting niet gevonden. Er is een nieuwe draft aangemaakt.
          </div>
        )}
        {showErrors && errorCount > 0 && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorCount} veld
            {errorCount === 1 ? '' : 'en'} missen of zijn onjuist.
            {missingFieldLabels.length > 0 && (
              <p className="mt-2 text-xs text-red-700">
                Controleer: {missingFieldLabels.join(', ')}
                {errorCount > missingFieldLabels.length ? ', ...' : ''}
              </p>
            )}
          </div>
        )}
      </section>

      <ConnectionForm
        value={connection}
        errors={errors}
        showErrors={showErrors}
        onChange={handleChange}
      />
    </div>
  )
}
