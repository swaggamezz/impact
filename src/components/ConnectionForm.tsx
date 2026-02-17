import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  CONNECTION_PRODUCTS,
  MARKET_SEGMENTS,
  REQUIRED_FIELDS,
  TELEMETRY_CODE_UNKNOWN,
  TELEMETRY_OPTIONS,
  type ConnectionDraft,
} from '../models/connection'
import {
  extractHouseNumber,
  isValidNlPostcode,
  lookupAddress,
  normalizePostcode,
} from '../services/addressLookupService'
import {
  getFieldConfidence,
  validateConnectionWarnings,
  type ConnectionValidationErrors,
} from '../utils/validation'
import { KvkLookupWizard } from './KvkLookupWizard'
import { FormField } from './FormField'
import { buildKvkPatch } from '../services/kvkMapping'
import type { KvkProfile, KvkSignatory } from '../types/kvk'

interface ConnectionFormProps {
  value: ConnectionDraft
  errors?: ConnectionValidationErrors
  showErrors?: boolean
  onChange: (field: keyof ConnectionDraft, value: string | boolean) => void
}

const required = new Set(REQUIRED_FIELDS)
const GRID_OPERATORS = [
  'Liander',
  'Enexis',
  'Stedin',
  'TenneT',
  'Coteq',
  'Rendo',
  'Westland Infra',
  'Endinet',
  'Overig',
] as const
const GRID_OPERATOR_OTHER_VALUE = '__other__'
type LookupStatus = 'idle' | 'loading' | 'success' | 'notfound' | 'error'

const inputClassName = (hasError?: boolean) =>
  `w-full rounded-xl border px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200 ${
    hasError ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'
  }`

export const ConnectionForm = ({
  value,
  errors,
  showErrors,
  onChange,
}: ConnectionFormProps) => {
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>('idle')
  const [gridOperatorCustomDraft, setGridOperatorCustomDraft] = useState('')
  const latestValuesRef = useRef(value)
  const lookupTimerRef = useRef<number | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)
  const warnings = useMemo(() => validateConnectionWarnings(value), [value])

  const getError = (field: keyof ConnectionDraft) => {
    const error = errors?.[field]
    if (showErrors) return error
    if (
      (field === 'eanCode' ||
        field === 'deliveryPostcode' ||
        field === 'kvkNumber' ||
        field === 'telemetryCode' ||
        field === 'iban') &&
      value[field] &&
      error
    ) {
      return error
    }
    return undefined
  }
  const getWarning = (field: keyof ConnectionDraft) => warnings[field]
  const getConfidence = (field: keyof ConnectionDraft) =>
    getFieldConfidence(value, field, errors)

  useEffect(() => {
    latestValuesRef.current = value
  }, [value])

  useEffect(() => {
    const rawPostcode = value.deliveryPostcode?.trim() ?? ''
    const rawHouseNumber = value.deliveryHouseNumber?.trim() ?? ''
    const normalizedPostcode = normalizePostcode(rawPostcode)
    const numericHouseNumber = extractHouseNumber(rawHouseNumber)

    if (!isValidNlPostcode(normalizedPostcode) || !numericHouseNumber) {
      setLookupStatus('idle')
      return
    }

    if (lookupTimerRef.current) {
      window.clearTimeout(lookupTimerRef.current)
    }
    abortRef.current?.abort()

    lookupTimerRef.current = window.setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      setLookupStatus('loading')
      try {
        const result = await lookupAddress(
          normalizedPostcode,
          numericHouseNumber,
          controller.signal,
        )

        if (!result) {
          setLookupStatus('notfound')
          return
        }

        const latest = latestValuesRef.current
        const latestPostcode = normalizePostcode(latest.deliveryPostcode ?? '')
        const latestHouseNumber = extractHouseNumber(
          latest.deliveryHouseNumber ?? '',
        )

        if (
          latestPostcode !== normalizedPostcode ||
          latestHouseNumber !== numericHouseNumber
        ) {
          return
        }

        if (!latest.deliveryStreet || latest.deliveryStreet.trim() === '') {
          onChange('deliveryStreet', result.street)
        }
        if (!latest.deliveryCity || latest.deliveryCity.trim() === '') {
          onChange('deliveryCity', result.city)
        }

        setLookupStatus('success')
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') return
        setLookupStatus('error')
      }
    }, 450)

    return () => {
      if (lookupTimerRef.current) {
        window.clearTimeout(lookupTimerRef.current)
      }
      abortRef.current?.abort()
    }
  }, [value.deliveryPostcode, value.deliveryHouseNumber, onChange])

  const normalizedGridOperator = (value.gridOperator ?? '').trim()
  const isStandardGridOperator = GRID_OPERATORS.includes(
    normalizedGridOperator as (typeof GRID_OPERATORS)[number],
  )
  const isOtherGridOperator = normalizedGridOperator === 'Anders'
  const hasCustomGridOperator =
    !!normalizedGridOperator &&
    !isStandardGridOperator &&
    !isOtherGridOperator
  const gridOperatorSelectValue = isStandardGridOperator
    ? normalizedGridOperator
    : hasCustomGridOperator || isOtherGridOperator
      ? GRID_OPERATOR_OTHER_VALUE
      : ''
  const showCustomGridOperator =
    gridOperatorSelectValue === GRID_OPERATOR_OTHER_VALUE
  const customGridOperator = hasCustomGridOperator
    ? normalizedGridOperator
    : gridOperatorCustomDraft

  useEffect(() => {
    if (hasCustomGridOperator) {
      setGridOperatorCustomDraft(normalizedGridOperator)
    }
  }, [hasCustomGridOperator, normalizedGridOperator])

  const handleGridOperatorSelect = (
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    const selected = event.target.value
    if (selected === '') {
      onChange('gridOperator', '')
      return
    }
    if (selected === GRID_OPERATOR_OTHER_VALUE) {
      const nextCustom = (gridOperatorCustomDraft || '').trim()
      onChange('gridOperator', nextCustom || 'Anders')
      return
    }
    onChange('gridOperator', selected)
  }

  const handleGridOperatorCustomInput = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const next = event.target.value
    setGridOperatorCustomDraft(next)
    const trimmed = next.trim()
    onChange('gridOperator', trimmed || 'Anders')
  }

  const lookupMessage =
    lookupStatus === 'loading'
      ? 'Adres ophalen op basis van postcode en huisnummer...'
      : lookupStatus === 'success'
        ? 'Adres gevonden en aangevuld waar mogelijk.'
        : lookupStatus === 'notfound'
          ? 'Geen adres gevonden. Controleer postcode en huisnummer.'
          : lookupStatus === 'error'
            ? 'Adres ophalen mislukt. Vul het adres handmatig in.'
            : ''

  const lookupTone =
    lookupStatus === 'success'
      ? 'text-emerald-600'
      : lookupStatus === 'notfound' || lookupStatus === 'error'
        ? 'text-amber-700'
        : 'text-slate-500'

  const invoiceSameAsDelivery = value.invoiceSameAsDelivery !== false

  const applyKvkProfile = (
    profile: KvkProfile,
    signatory?: KvkSignatory,
  ) => {
    const patch = buildKvkPatch(profile, signatory)
    const fields = Object.entries(patch) as Array<
      [keyof ConnectionDraft, string | boolean | undefined]
    >
    for (const [field, fieldValue] of fields) {
      if (fieldValue !== undefined && fieldValue !== value[field]) {
        onChange(field, fieldValue)
      }
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Basisgegevens</h2>
        <p className="mt-1 text-sm text-slate-600">
          Deze velden zijn verplicht voor een complete aansluiting.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <FormField
            label="EAN-code"
            htmlFor="eanCode"
            required={required.has('eanCode')}
            error={getError('eanCode')}
            warning={getWarning('eanCode')}
            confidence={getConfidence('eanCode')}
            helpText="EAN-code: 18-cijferige code die een aansluiting identificeert; voor elk energietype heeft u een aparte EAN. Bron: energuide.be."
          >
            <input
              id="eanCode"
              name="eanCode"
              value={value.eanCode ?? ''}
              onChange={(event) => onChange('eanCode', event.target.value)}
              placeholder="123456789012345678"
              inputMode="numeric"
              className={inputClassName(!!getError('eanCode'))}
            />
          </FormField>

          <FormField
            label="Product"
            htmlFor="product"
            required={required.has('product')}
            error={getError('product')}
            warning={getWarning('product')}
            confidence={getConfidence('product')}
            helpText="Product: kies Elektra, Gas, Water, Warmte of tijdelijk Onbekend."
          >
            <select
              id="product"
              name="product"
              value={value.product ?? ''}
              onChange={(event) => onChange('product', event.target.value)}
              className={inputClassName(!!getError('product'))}
            >
              <option value="">Selecteer product</option>
              {CONNECTION_PRODUCTS.map((product) => (
                <option key={product} value={product}>
                  {product}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Tenaamstelling"
            htmlFor="tenaamstelling"
            required={required.has('tenaamstelling')}
            error={getError('tenaamstelling')}
            warning={getWarning('tenaamstelling')}
            confidence={getConfidence('tenaamstelling')}
          >
            <input
              id="tenaamstelling"
              name="tenaamstelling"
              value={value.tenaamstelling ?? ''}
              onChange={(event) => onChange('tenaamstelling', event.target.value)}
              placeholder="Naam op contract/factuur"
              className={inputClassName(!!getError('tenaamstelling'))}
            />
          </FormField>

          <div className="sm:col-span-2">
            <KvkLookupWizard onApply={applyKvkProfile} />
          </div>

          <FormField
            label="KvK-nummer"
            htmlFor="kvkNumber"
            required={required.has('kvkNumber')}
            error={getError('kvkNumber')}
            warning={getWarning('kvkNumber')}
            confidence={getConfidence('kvkNumber')}
            helpText="KvK is 8 cijfers (NL)."
          >
            <input
              id="kvkNumber"
              name="kvkNumber"
              value={value.kvkNumber ?? ''}
              onChange={(event) => onChange('kvkNumber', event.target.value)}
              placeholder="12345678"
              inputMode="numeric"
              className={inputClassName(!!getError('kvkNumber'))}
            />
          </FormField>

          <FormField
            label="Rechtsvorm"
            htmlFor="legalForm"
            error={getError('legalForm')}
            warning={getWarning('legalForm')}
            confidence={getConfidence('legalForm')}
          >
            <input
              id="legalForm"
              name="legalForm"
              value={value.legalForm ?? ''}
              onChange={(event) => onChange('legalForm', event.target.value)}
              placeholder="Bijv. BV, VOF, Stichting"
              className={inputClassName(!!getError('legalForm'))}
            />
          </FormField>

          <FormField
            label="IBAN"
            htmlFor="iban"
            required={required.has('iban')}
            error={getError('iban')}
            warning={getWarning('iban')}
            confidence={getConfidence('iban')}
            helpText="Vul het IBAN in zoals op factuur of contract."
          >
            <input
              id="iban"
              name="iban"
              value={value.iban ?? ''}
              onChange={(event) => onChange('iban', event.target.value.toUpperCase())}
              placeholder="NL00BANK0123456789"
              className={inputClassName(!!getError('iban'))}
            />
          </FormField>

          <FormField
            label="Tekenbevoegde volgens KvK"
            htmlFor="authorizedSignatory"
            required={required.has('authorizedSignatory')}
            error={getError('authorizedSignatory')}
            warning={getWarning('authorizedSignatory')}
            confidence={getConfidence('authorizedSignatory')}
          >
            <input
              id="authorizedSignatory"
              name="authorizedSignatory"
              value={value.authorizedSignatory ?? ''}
              onChange={(event) =>
                onChange('authorizedSignatory', event.target.value)
              }
              placeholder="Naam tekenbevoegde"
              className={inputClassName(!!getError('authorizedSignatory'))}
            />
          </FormField>

          <FormField
            label="Telemetriecode / Meetcode"
            htmlFor="telemetryCode"
            required={required.has('telemetryCode')}
            error={getError('telemetryCode')}
            warning={getWarning('telemetryCode')}
            confidence={getConfidence('telemetryCode')}
            helpText="Zoals op factuur/meetrapport. Gebruik ONBEKEND als je dit nu niet weet."
          >
            <div className="space-y-2">
              <input
                id="telemetryCode"
                name="telemetryCode"
                value={value.telemetryCode ?? ''}
                onChange={(event) =>
                  onChange('telemetryCode', event.target.value.toUpperCase())
                }
                placeholder="Bijv. E17A..."
                className={inputClassName(!!getError('telemetryCode'))}
              />
              <button
                type="button"
                onClick={() => onChange('telemetryCode', TELEMETRY_CODE_UNKNOWN)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
              >
                Ik weet dit niet
              </button>
            </div>
          </FormField>

          <FormField
            label="Telemetrie type (optioneel)"
            htmlFor="telemetryType"
            error={getError('telemetryType')}
            warning={getWarning('telemetryType')}
            confidence={getConfidence('telemetryType')}
          >
            <select
              id="telemetryType"
              name="telemetryType"
              value={value.telemetryType ?? ''}
              onChange={(event) => onChange('telemetryType', event.target.value)}
              className={inputClassName(!!getError('telemetryType'))}
            >
              <option value="">Selecteer telemetrie type</option>
              {TELEMETRY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Marktsegment"
            htmlFor="marketSegment"
            required={required.has('marketSegment')}
            error={getError('marketSegment')}
            warning={getWarning('marketSegment')}
            confidence={getConfidence('marketSegment')}
            helpText="Marktsegment: KV = kleinverbruik (<= 3x80 A / < 40 m3/h), GV = grootverbruik. Onbekend kan tijdelijk, maar controleer dit later."
          >
            <select
              id="marketSegment"
              name="marketSegment"
              value={value.marketSegment ?? ''}
              onChange={(event) => onChange('marketSegment', event.target.value)}
              className={inputClassName(!!getError('marketSegment'))}
            >
              <option value="">Selecteer segment</option>
              {MARKET_SEGMENTS.map((segment) => (
                <option key={segment} value={segment}>
                  {segment}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold">Leveringsadres (verplicht)</h3>
        <p className="mt-1 text-sm text-slate-600">
          Begin met postcode en huisnummer. Straat en plaats vullen we waar mogelijk aan.
        </p>
        {value.addressWarning && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {value.addressWarning}
          </div>
        )}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <FormField
            label="Postcode"
            htmlFor="deliveryPostcode"
            required={required.has('deliveryPostcode')}
            error={getError('deliveryPostcode')}
            warning={getWarning('deliveryPostcode')}
            confidence={getConfidence('deliveryPostcode')}
          >
            <input
              id="deliveryPostcode"
              name="deliveryPostcode"
              value={value.deliveryPostcode ?? ''}
              onChange={(event) =>
                onChange('deliveryPostcode', event.target.value)
              }
              placeholder="1234 AB"
              className={inputClassName(!!getError('deliveryPostcode'))}
            />
          </FormField>

          <FormField
            label="Huisnummer"
            htmlFor="deliveryHouseNumber"
            required={required.has('deliveryHouseNumber')}
            error={getError('deliveryHouseNumber')}
            warning={getWarning('deliveryHouseNumber')}
            confidence={getConfidence('deliveryHouseNumber')}
          >
            <input
              id="deliveryHouseNumber"
              name="deliveryHouseNumber"
              value={value.deliveryHouseNumber ?? ''}
              onChange={(event) =>
                onChange('deliveryHouseNumber', event.target.value)
              }
              placeholder="123"
              inputMode="numeric"
              className={inputClassName(!!getError('deliveryHouseNumber'))}
            />
          </FormField>

          <FormField
            label="Toevoeging"
            htmlFor="deliveryHouseNumberAddition"
            error={getError('deliveryHouseNumberAddition')}
            warning={getWarning('deliveryHouseNumberAddition')}
            confidence={getConfidence('deliveryHouseNumberAddition')}
          >
            <input
              id="deliveryHouseNumberAddition"
              name="deliveryHouseNumberAddition"
              value={value.deliveryHouseNumberAddition ?? ''}
              onChange={(event) =>
                onChange('deliveryHouseNumberAddition', event.target.value)
              }
              placeholder="A / bis"
              className={inputClassName(!!getError('deliveryHouseNumberAddition'))}
            />
          </FormField>

          <FormField
            label="Straat"
            htmlFor="deliveryStreet"
            required={required.has('deliveryStreet')}
            error={getError('deliveryStreet')}
            warning={getWarning('deliveryStreet')}
            confidence={getConfidence('deliveryStreet')}
          >
            <input
              id="deliveryStreet"
              name="deliveryStreet"
              value={value.deliveryStreet ?? ''}
              onChange={(event) => onChange('deliveryStreet', event.target.value)}
              placeholder="Straatnaam"
              className={inputClassName(!!getError('deliveryStreet'))}
            />
          </FormField>

          <FormField
            label="Plaats"
            htmlFor="deliveryCity"
            required={required.has('deliveryCity')}
            error={getError('deliveryCity')}
            warning={getWarning('deliveryCity')}
            confidence={getConfidence('deliveryCity')}
          >
            <input
              id="deliveryCity"
              name="deliveryCity"
              value={value.deliveryCity ?? ''}
              onChange={(event) => onChange('deliveryCity', event.target.value)}
              className={inputClassName(!!getError('deliveryCity'))}
            />
          </FormField>
        </div>
        {lookupMessage && (
          <p className={`mt-3 text-xs ${lookupTone}`}>{lookupMessage}</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold">Factuuradres (optioneel)</h3>
        <p className="mt-1 text-sm text-slate-600">
          Vink uit als het factuuradres afwijkt van het leveringsadres.
        </p>
        <div className="mt-4">
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={invoiceSameAsDelivery}
              onChange={(event) =>
                onChange('invoiceSameAsDelivery', event.target.checked)
              }
            />
            Factuuradres is hetzelfde als leveringsadres
          </label>
        </div>

        {!invoiceSameAsDelivery && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <FormField
              label="Postcode"
              htmlFor="invoicePostcode"
              required
              error={getError('invoicePostcode')}
              warning={getWarning('invoicePostcode')}
              confidence={getConfidence('invoicePostcode')}
            >
              <input
                id="invoicePostcode"
                name="invoicePostcode"
                value={value.invoicePostcode ?? ''}
                onChange={(event) =>
                  onChange('invoicePostcode', event.target.value)
                }
                placeholder="1234 AB"
                className={inputClassName(!!getError('invoicePostcode'))}
              />
            </FormField>

            <FormField
              label="Huisnummer"
              htmlFor="invoiceHouseNumber"
              required
              error={getError('invoiceHouseNumber')}
              warning={getWarning('invoiceHouseNumber')}
              confidence={getConfidence('invoiceHouseNumber')}
            >
              <input
                id="invoiceHouseNumber"
                name="invoiceHouseNumber"
                value={value.invoiceHouseNumber ?? ''}
                onChange={(event) =>
                  onChange('invoiceHouseNumber', event.target.value)
                }
                placeholder="123"
                inputMode="numeric"
                className={inputClassName(!!getError('invoiceHouseNumber'))}
              />
            </FormField>

            <FormField
              label="Toevoeging"
              htmlFor="invoiceHouseNumberAddition"
              error={getError('invoiceHouseNumberAddition')}
              warning={getWarning('invoiceHouseNumberAddition')}
              confidence={getConfidence('invoiceHouseNumberAddition')}
            >
              <input
                id="invoiceHouseNumberAddition"
                name="invoiceHouseNumberAddition"
                value={value.invoiceHouseNumberAddition ?? ''}
                onChange={(event) =>
                  onChange('invoiceHouseNumberAddition', event.target.value)
                }
                placeholder="A / bis"
                className={inputClassName(!!getError('invoiceHouseNumberAddition'))}
              />
            </FormField>

            <FormField
              label="Straat"
              htmlFor="invoiceStreet"
              required
              error={getError('invoiceStreet')}
              warning={getWarning('invoiceStreet')}
              confidence={getConfidence('invoiceStreet')}
            >
              <input
                id="invoiceStreet"
                name="invoiceStreet"
                value={value.invoiceStreet ?? ''}
                onChange={(event) => onChange('invoiceStreet', event.target.value)}
                placeholder="Straatnaam"
                className={inputClassName(!!getError('invoiceStreet'))}
              />
            </FormField>

            <FormField
              label="Plaats"
              htmlFor="invoiceCity"
              required
              error={getError('invoiceCity')}
              warning={getWarning('invoiceCity')}
              confidence={getConfidence('invoiceCity')}
            >
              <input
                id="invoiceCity"
                name="invoiceCity"
                value={value.invoiceCity ?? ''}
                onChange={(event) => onChange('invoiceCity', event.target.value)}
                className={inputClassName(!!getError('invoiceCity'))}
              />
            </FormField>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold">Aanvullende velden (optioneel)</h3>
        <p className="mt-1 text-sm text-slate-600">
          Niet verplicht, maar handig voor een compleet dossier.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <FormField label="Afdeling" htmlFor="department">
            <input
              id="department"
              name="department"
              value={value.department ?? ''}
              onChange={(event) => onChange('department', event.target.value)}
              placeholder="Facilitair"
              className={inputClassName()}
            />
          </FormField>
          <FormField label="Netbeheerder" htmlFor="gridOperator">
            <select
              id="gridOperator"
              name="gridOperator"
              value={gridOperatorSelectValue}
              onChange={handleGridOperatorSelect}
              className={inputClassName()}
            >
              <option value="">Selecteer netbeheerder</option>
              {GRID_OPERATORS.map((operator) => (
                <option key={operator} value={operator}>
                  {operator}
                </option>
              ))}
              <option value={GRID_OPERATOR_OTHER_VALUE}>
                Anders (zelf invullen)
              </option>
            </select>
          </FormField>
          {showCustomGridOperator && (
            <FormField
              label="Netbeheerder (zelf invullen)"
              htmlFor="gridOperatorCustom"
            >
              <input
                id="gridOperatorCustom"
                name="gridOperatorCustom"
                value={customGridOperator}
                onChange={handleGridOperatorCustomInput}
                placeholder="Vul netbeheerder in"
                className={inputClassName()}
              />
              <p className="text-xs text-slate-500">
                Tip: dit staat op je energiefactuur of netbeheerderfactuur.
              </p>
            </FormField>
          )}
          <FormField label="Leverancier" htmlFor="supplier">
            <input
              id="supplier"
              name="supplier"
              value={value.supplier ?? ''}
              onChange={(event) => onChange('supplier', event.target.value)}
              placeholder="Bijv. Vattenfall (optioneel)"
              className={inputClassName()}
            />
          </FormField>
          <FormField label="Meternummer" htmlFor="meterNumber">
            <input
              id="meterNumber"
              name="meterNumber"
              value={value.meterNumber ?? ''}
              onChange={(event) => onChange('meterNumber', event.target.value)}
              placeholder="ABC12345"
              className={inputClassName()}
            />
          </FormField>
          <FormField label="Jaarverbruik hoog" htmlFor="annualUsageNormal">
            <input
              id="annualUsageNormal"
              name="annualUsageNormal"
              value={value.annualUsageNormal ?? ''}
              onChange={(event) =>
                onChange('annualUsageNormal', event.target.value)
              }
              placeholder="kWh / m3"
              className={inputClassName()}
            />
          </FormField>
          <FormField label="Jaarverbruik laag" htmlFor="annualUsageLow">
            <input
              id="annualUsageLow"
              name="annualUsageLow"
              value={value.annualUsageLow ?? ''}
              onChange={(event) =>
                onChange('annualUsageLow', event.target.value)
              }
              placeholder="kWh / m3"
              className={inputClassName()}
            />
          </FormField>
          <FormField label="Status" htmlFor="status">
            <input
              id="status"
              name="status"
              value={value.status ?? ''}
              onChange={(event) => onChange('status', event.target.value)}
              placeholder="In behandeling"
              className={inputClassName()}
            />
          </FormField>
          <FormField label="Notities" htmlFor="notes" className="sm:col-span-2">
            <textarea
              id="notes"
              name="notes"
              value={value.notes ?? ''}
              onChange={(event) => onChange('notes', event.target.value)}
              placeholder="Extra toelichting"
              rows={3}
              className={inputClassName()}
            />
          </FormField>
        </div>
      </section>
    </div>
  )
}
