import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { StepWizard } from './StepWizard'

export const AppShell = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_var(--impact-ice),_#ffffff_60%)] text-[var(--impact-ink)]">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src="/ImpactEnergy-logo-header-full.png"
                alt="Impact Energy logo"
                className="h-10 w-auto"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Impact Energy
                </p>
                <h1 className="text-xl font-semibold sm:text-2xl">
                  Aansluitingen intake
                </h1>
              </div>
            </div>
            <Link
              to="/connections"
              className="btn-secondary text-xs"
            >
              Overzicht
            </Link>
          </div>
          <StepWizard />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-8 animate-fade-up">
        {children}
      </main>
    </div>
  )
}
