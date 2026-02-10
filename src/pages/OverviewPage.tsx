import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useConnections } from '../hooks/useConnections'
import { createDraftConnection } from '../models/connection'
import { saveConnections } from '../services/storageService'
import { validateConnection } from '../utils/validation'

export const OverviewPage = () => {
  const { connections, loading, remove, refresh } = useConnections()
  const [bulkBaseId, setBulkBaseId] = useState('')
  const [bulkCount, setBulkCount] = useState(1)
  const [bulkNotice, setBulkNotice] = useState('')
  const [bulkError, setBulkError] = useState('')

  const incompleteCount = connections.filter(
    (connection) => Object.keys(validateConnection(connection)).length > 0,
  ).length

  useEffect(() => {
    if (connections.length === 0) {
      setBulkBaseId('')
      return
    }
    if (!connections.some((connection) => connection.id === bulkBaseId)) {
      setBulkBaseId(connections[0].id)
    }
  }, [connections, bulkBaseId])

  const handleDelete = async (id: string) => {
    if (!window.confirm('Weet je zeker dat je deze aansluiting wilt verwijderen?')) {
      return
    }
    await remove(id)
  }

  const formatAddress = (
    street?: string,
    houseNumber?: string,
    addition?: string,
  ) => {
    const parts = [street, houseNumber, addition].filter(Boolean)
    return parts.length > 0 ? parts.join(' ') : 'Adres onbekend'
  }

  const handleBulkCreate = async () => {
    setBulkNotice('')
    setBulkError('')
    const base = connections.find((connection) => connection.id === bulkBaseId)
    if (!base) {
      setBulkError('Kies eerst een basis-aansluiting.')
      return
    }

    const count = Math.max(1, Math.min(20, bulkCount))
    const newConnections = Array.from({ length: count }, () => ({
      ...createDraftConnection('MANUAL'),
      tenaamstelling: base.tenaamstelling,
      kvkNumber: base.kvkNumber,
      iban: base.iban,
      authorizedSignatory: base.authorizedSignatory,
      department: base.department,
      telemetryCode: base.telemetryCode,
      telemetryType: base.telemetryType,
      deliveryStreet: base.deliveryStreet,
      deliveryHouseNumber: base.deliveryHouseNumber,
      deliveryHouseNumberAddition: base.deliveryHouseNumberAddition,
      deliveryPostcode: base.deliveryPostcode,
      deliveryCity: base.deliveryCity,
      invoiceSameAsDelivery: base.invoiceSameAsDelivery,
      invoiceStreet: base.invoiceStreet,
      invoiceHouseNumber: base.invoiceHouseNumber,
      invoiceHouseNumberAddition: base.invoiceHouseNumberAddition,
      invoicePostcode: base.invoicePostcode,
      invoiceCity: base.invoiceCity,
      gridOperator: base.gridOperator,
      supplier: base.supplier,
      marketSegment: base.marketSegment,
    }))

    await saveConnections([...connections, ...newConnections])
    await refresh()
    setBulkNotice(
      `${count} nieuwe aansluiting${count === 1 ? '' : 'en'} toegevoegd.`,
    )
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Overzicht aansluitingen</h2>
              <p className="mt-1 text-sm text-slate-600">
                {connections.length} aansluiting
                {connections.length === 1 ? '' : 'en'} opgeslagen
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/export"
                className="btn-secondary"
              >
                Naar export
              </Link>
              <Link
                to="/connections/new"
                className="btn-primary"
              >
                Nieuwe aansluiting
              </Link>
              <Link
                to="/upload"
                className="btn-secondary"
              >
                Upload documenten
              </Link>
            </div>
          </div>
        {incompleteCount > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {incompleteCount} aansluiting
            {incompleteCount === 1 ? '' : 'en'} incompleet.
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold">
          Meerdere aansluitingen op hetzelfde adres
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Maak in 1 keer meerdere aansluitingen met hetzelfde adres. EAN en
          product blijven leeg zodat je ze per aansluiting kunt invullen.
        </p>
        {connections.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Voeg eerst minimaal 1 aansluiting toe om te kunnen kopieren.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="bulkBase"
                className="text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                Basis aansluiting
              </label>
              <select
                id="bulkBase"
                value={bulkBaseId}
                onChange={(event) => setBulkBaseId(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                    {connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.tenaamstelling || 'Onbekende aansluiting'} -{' '}
                    {formatAddress(
                      connection.deliveryStreet,
                      connection.deliveryHouseNumber,
                      connection.deliveryHouseNumberAddition,
                    )}
                    {connection.deliveryCity ? `, ${connection.deliveryCity}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="bulkCount"
                className="text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                Aantal nieuwe aansluitingen
              </label>
              <select
                id="bulkCount"
                value={bulkCount}
                onChange={(event) => setBulkCount(Number(event.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                {Array.from({ length: 20 }, (_, index) => index + 1).map(
                  (count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="flex flex-col justify-end gap-3">
              <button
                type="button"
                onClick={handleBulkCreate}
                className="btn-primary w-full"
              >
                Maak {bulkCount} aansluiting{bulkCount === 1 ? '' : 'en'}
              </button>
            </div>
          </div>
        )}
        {bulkError && (
          <p className="mt-3 text-sm text-red-600">{bulkError}</p>
        )}
        {bulkNotice && (
          <p className="mt-3 text-sm text-emerald-700">{bulkNotice}</p>
        )}
      </section>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          Laden...
        </div>
      ) : connections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-600">
            Nog geen aansluitingen. Upload documenten of voeg handmatig toe.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link
              to="/upload"
              className="btn-secondary"
            >
              Naar upload
            </Link>
            <Link
              to="/connections/new"
              className="btn-primary"
            >
              Handmatig toevoegen
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {connections.map((connection) => {
            const errors = validateConnection(connection)
            const errorCount = Object.keys(errors).length
            return (
              <div
                key={connection.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">
                      {connection.tenaamstelling || 'Onbekende aansluiting'}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {connection.eanCode || 'Geen EAN'} -{' '}
                      {connection.product || 'Geen product'} -{' '}
                      {connection.deliveryCity || 'Geen plaats'}
                    </p>
                  </div>
                  {errorCount > 0 ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                      Incompleet ({errorCount})
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Compleet
                    </span>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    to={`/connections/${connection.id}`}
                    className="btn-secondary text-xs"
                  >
                    Bewerken
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(connection.id)}
                    className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300"
                  >
                    Verwijderen
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
