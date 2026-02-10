import { Link } from 'react-router-dom'
import { useUploads } from '../contexts/uploadContext'
import { useConnections } from '../hooks/useConnections'

export const HomePage = () => {
  const { connections, reset } = useConnections()
  const { clearUploads } = useUploads()

  const handleReset = async () => {
    const confirmed = window.confirm(
      'Weet je zeker dat je alle aansluitingen wilt verwijderen?',
    )
    if (!confirmed) return
    clearUploads()
    await reset()
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Start
        </p>
        <h2 className="mt-2 text-xl font-semibold sm:text-2xl">
          Hoe wil je aansluiten aanleveren?
        </h2>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          Kies uploaden voor documenten, of voeg direct handmatig een aansluiting toe.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            to="/upload"
            className="group w-full rounded-2xl border border-[var(--impact-blue)] bg-[var(--impact-blue)] px-5 py-5 text-left text-white shadow-sm transition hover:bg-[var(--impact-navy)] focus:outline-none focus:ring-2 focus:ring-[var(--impact-blue)] focus:ring-offset-2"
          >
            <p className="text-base font-semibold sm:text-lg">Upload documenten</p>
            <p className="mt-1 text-xs text-blue-100 sm:text-sm">
              Foto, PDF of Excel in 1 flow
            </p>
          </Link>
          <Link
            to="/connections/new"
            className="group w-full rounded-2xl border border-[var(--impact-blue)] bg-[var(--impact-blue)] px-5 py-5 text-left text-white shadow-sm transition hover:bg-[var(--impact-navy)] focus:outline-none focus:ring-2 focus:ring-[var(--impact-blue)] focus:ring-offset-2"
          >
            <p className="text-base font-semibold sm:text-lg">Handmatig toevoegen</p>
            <p className="mt-1 text-xs text-blue-100 sm:text-sm">
              Snel 1 aansluiting invullen
            </p>
          </Link>
          <Link
            to="/connections"
            className="group w-full rounded-2xl border border-slate-200 bg-white px-5 py-5 text-left text-slate-800 shadow-sm transition hover:border-[var(--impact-blue)] hover:text-[var(--impact-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--impact-blue)] focus:ring-offset-2"
          >
            <p className="text-base font-semibold sm:text-lg">Overzicht</p>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Bekijk, bewerk en verwijder aansluitingen
            </p>
          </Link>
          <Link
            to="/export"
            className="group w-full rounded-2xl border border-slate-200 bg-white px-5 py-5 text-left text-slate-800 shadow-sm transition hover:border-[var(--impact-blue)] hover:text-[var(--impact-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--impact-blue)] focus:ring-offset-2"
          >
            <p className="text-base font-semibold sm:text-lg">Export</p>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Download Excel, CSV of PDF
            </p>
          </Link>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500">
            {connections.length} aansluiting
            {connections.length === 1 ? '' : 'en'} opgeslagen op dit apparaat.
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-300"
          >
            Reset alle gegevens op dit apparaat
          </button>
        </div>
      </section>
    </div>
  )
}
