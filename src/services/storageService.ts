import type { ConnectionDraft } from '../models/connection'
import { TELEMETRY_CODE_UNKNOWN, createDraftConnection } from '../models/connection'

const DB_NAME = 'impact-energy'
const DB_VERSION = 1
const STORE_CONNECTIONS = 'connections'
const FALLBACK_KEY = 'impact-energy.connections'

export type StorageMode = 'indexeddb' | 'localstorage'

const canUseIndexedDb = () =>
  typeof indexedDB !== 'undefined' && typeof indexedDB.open === 'function'

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const waitForTransaction = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () =>
      reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    tx.onerror = () =>
      reject(tx.error ?? new Error('IndexedDB transaction failed'))
  })

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_CONNECTIONS)) {
        db.createObjectStore(STORE_CONNECTIONS, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const readLocalStorage = (): ConnectionDraft[] => {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ConnectionDraft[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeLocalStorage = (connections: ConnectionDraft[]) => {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(connections))
}

const toStringValue = (value: unknown) =>
  typeof value === 'string' ? value : value === undefined || value === null ? undefined : String(value)

const normalizeLegacyTelemetryType = (value?: string) => {
  if (!value) return value
  const normalized = value.trim().toLowerCase()
  if (
    normalized === 'ja' ||
    normalized === 'nee' ||
    normalized === 'yes' ||
    normalized === 'no'
  ) {
    return 'Onbekend'
  }
  return value
}

const normalizeTelemetryCode = (value?: string) => {
  if (!value) return value
  const normalized = value.trim()
  if (!normalized) return undefined
  const normalizedLower = normalized.toLowerCase()
  if (
    normalizedLower === 'onbekend' ||
    normalizedLower === 'unknown' ||
    normalizedLower === 'nvt' ||
    normalizedLower === 'n.v.t.' ||
    normalizedLower === 'ja' ||
    normalizedLower === 'nee' ||
    normalizedLower === 'yes' ||
    normalizedLower === 'no'
  ) {
    return TELEMETRY_CODE_UNKNOWN
  }
  return normalized.toUpperCase().replace(/\s+/g, '')
}

const normalizeIban = (value?: string) => {
  if (!value) return value
  const normalized = value.replace(/\s+/g, '').toUpperCase()
  return normalized || undefined
}

const normalizeCompanyActive = (value?: string) => {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (['active', 'actief', 'ja', 'true', '1'].includes(normalized)) {
    return 'active'
  }
  if (['inactive', 'inactief', 'nee', 'false', '0', 'closed', 'gesloten'].includes(normalized)) {
    return 'inactive'
  }
  if (['unknown', 'onbekend', 'nvt', 'n.v.t.'].includes(normalized)) {
    return 'unknown'
  }
  return undefined
}

const migrateConnection = (raw: ConnectionDraft): ConnectionDraft => {
  const data = raw as Record<string, unknown>
  const next: ConnectionDraft = { ...(raw ?? {}) }

  const legacyTenaamstelling =
    toStringValue(data.tenaamstelling) ??
    toStringValue(data.connectionName) ??
    toStringValue(data.customerName)
  if (legacyTenaamstelling && !next.tenaamstelling) {
    next.tenaamstelling = legacyTenaamstelling
  }

  const legacyLegalName =
    toStringValue(data.legalName) ??
    toStringValue(data.juridischeNaam) ??
    toStringValue(data.statutaireNaam)
  if (legacyLegalName && !next.legalName) {
    next.legalName = legacyLegalName
  }

  const legacyTradeName =
    toStringValue(data.tradeName) ??
    toStringValue(data.handelsnaam) ??
    toStringValue(data.trade_name)
  if (legacyTradeName && !next.tradeName) {
    next.tradeName = legacyTradeName
  }

  if (!next.legalName && next.tenaamstelling) {
    next.legalName = next.tenaamstelling
  }

  const legacyCompanyActive =
    normalizeCompanyActive(toStringValue(data.companyActive)) ??
    normalizeCompanyActive(toStringValue(data.active))
  if (legacyCompanyActive && !next.companyActive) {
    next.companyActive = legacyCompanyActive
  }

  const legacyAuthorizedRole =
    toStringValue(data.authorizedSignatoryRole) ??
    toStringValue(data.tekenbevoegdeRol) ??
    toStringValue(data.signatoryRole)
  if (legacyAuthorizedRole && !next.authorizedSignatoryRole) {
    next.authorizedSignatoryRole = legacyAuthorizedRole
  }

  const legacyContactEmail =
    toStringValue(data.contactEmail) ??
    toStringValue(data.email) ??
    toStringValue(data.contact_email)
  if (legacyContactEmail && !next.contactEmail) {
    next.contactEmail = legacyContactEmail
  }

  const legacyContactPhone =
    toStringValue(data.contactPhone) ??
    toStringValue(data.telefoon) ??
    toStringValue(data.phone)
  if (legacyContactPhone && !next.contactPhone) {
    next.contactPhone = legacyContactPhone
  }

  const legacyWebsite =
    toStringValue(data.website) ??
    toStringValue(data.web) ??
    toStringValue(data.url)
  if (legacyWebsite && !next.website) {
    next.website = legacyWebsite
  }

  const legacyInvoiceEmail =
    toStringValue(data.invoiceEmail) ??
    toStringValue(data.factuurEmail) ??
    toStringValue(data.billingEmail)
  if (legacyInvoiceEmail && !next.invoiceEmail) {
    next.invoiceEmail = legacyInvoiceEmail
  }

  const legacyVatNumber =
    toStringValue(data.vatNumber) ??
    toStringValue(data.btwNummer) ??
    toStringValue(data.vat)
  if (legacyVatNumber && !next.vatNumber) {
    next.vatNumber = legacyVatNumber
  }

  const legacyStreet =
    toStringValue(data.deliveryStreet) ?? toStringValue(data.street)
  const legacyHouseNumber =
    toStringValue(data.deliveryHouseNumber) ??
    toStringValue(data.houseNumber)
  const legacyHouseAddition =
    toStringValue(data.deliveryHouseNumberAddition) ??
    toStringValue(data.houseNumberAddition)
  const legacyPostcode =
    toStringValue(data.deliveryPostcode) ?? toStringValue(data.postcode)
  const legacyCity = toStringValue(data.deliveryCity) ?? toStringValue(data.city)

  if (legacyStreet && !next.deliveryStreet) next.deliveryStreet = legacyStreet
  if (legacyHouseNumber && !next.deliveryHouseNumber) {
    next.deliveryHouseNumber = legacyHouseNumber
  }
  if (legacyHouseAddition && !next.deliveryHouseNumberAddition) {
    next.deliveryHouseNumberAddition = legacyHouseAddition
  }
  if (legacyPostcode && !next.deliveryPostcode) {
    next.deliveryPostcode = legacyPostcode
  }
  if (legacyCity && !next.deliveryCity) next.deliveryCity = legacyCity

  const invoiceSameRaw = data.invoiceSameAsDelivery
  if (typeof invoiceSameRaw === 'boolean') {
    next.invoiceSameAsDelivery = invoiceSameRaw
  } else if (next.invoiceSameAsDelivery === undefined) {
    const hasInvoiceAddress = [
      toStringValue(data.invoiceStreet),
      toStringValue(data.invoiceHouseNumber),
      toStringValue(data.invoicePostcode),
      toStringValue(data.invoiceCity),
    ].some((value) => value && value.trim())
    next.invoiceSameAsDelivery = !hasInvoiceAddress
  }

  if (!next.id) {
    const generated = createDraftConnection(next.source ?? 'MANUAL')
    next.id = generated.id
    next.createdAt = next.createdAt ?? generated.createdAt
    next.source = next.source ?? generated.source
  }

  const legacyTelemetryType =
    toStringValue(data.telemetryType) ?? toStringValue(data.telemetry)
  if (legacyTelemetryType && !next.telemetryType) {
    next.telemetryType = normalizeLegacyTelemetryType(legacyTelemetryType)
  }

  if (next.telemetryType) {
    next.telemetryType = normalizeLegacyTelemetryType(next.telemetryType)
  }

  const legacyTelemetryCode =
    toStringValue(data.telemetryCode) ??
    toStringValue(data.telemetry_code) ??
    toStringValue(data.telemetriecode) ??
    toStringValue(data.meetcode) ??
    toStringValue(data.telemetryCodeOrMeetcode)
  if (legacyTelemetryCode && !next.telemetryCode) {
    next.telemetryCode = normalizeTelemetryCode(legacyTelemetryCode)
  }

  if (!next.telemetryCode && next.telemetryType) {
    next.telemetryCode = TELEMETRY_CODE_UNKNOWN
  }
  next.telemetryCode =
    normalizeTelemetryCode(next.telemetryCode) ?? TELEMETRY_CODE_UNKNOWN

  const legacyIban =
    toStringValue(data.iban) ??
    toStringValue(data.IBAN) ??
    toStringValue(data.rekeningnummer) ??
    toStringValue(data.accountNumber)
  if (legacyIban && !next.iban) {
    next.iban = normalizeIban(legacyIban)
  }
  next.iban = normalizeIban(next.iban) ?? ''

  delete (next as Record<string, unknown>).telemetry

  return next
}

const migrateConnections = (connections: ConnectionDraft[]) =>
  connections.map(migrateConnection)

const withStore = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => Promise<T>,
) => {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE_CONNECTIONS, mode)
    const store = tx.objectStore(STORE_CONNECTIONS)
    const result = await action(store)
    await waitForTransaction(tx)
    return result
  } finally {
    db.close()
  }
}

export const getStorageMode = (): StorageMode =>
  canUseIndexedDb() ? 'indexeddb' : 'localstorage'

export const getAllConnections = async (): Promise<ConnectionDraft[]> => {
  if (!canUseIndexedDb()) {
    return migrateConnections(readLocalStorage())
  }

  try {
    const results = await withStore('readonly', (store) =>
      requestToPromise(store.getAll()),
    )
    return migrateConnections(results)
  } catch {
    return migrateConnections(readLocalStorage())
  }
}

export const getConnectionById = async (
  id: string,
): Promise<ConnectionDraft | undefined> => {
  if (!canUseIndexedDb()) {
    const existing = readLocalStorage().find((item) => item.id === id)
    return existing ? migrateConnection(existing) : undefined
  }

  try {
    const existing = await withStore('readonly', (store) =>
      requestToPromise(store.get(id)),
    )
    return existing ? migrateConnection(existing) : undefined
  } catch {
    const existing = readLocalStorage().find((item) => item.id === id)
    return existing ? migrateConnection(existing) : undefined
  }
}

export const saveConnection = async (connection: ConnectionDraft) => {
  const normalized = migrateConnection(connection)
  if (!canUseIndexedDb()) {
    const connections = readLocalStorage()
    const next = connections.filter((item) => item.id !== normalized.id)
    writeLocalStorage([...next, normalized])
    return
  }

  try {
    await withStore('readwrite', (store) =>
      requestToPromise(store.put(normalized)),
    )
  } catch {
    const connections = readLocalStorage()
    const next = connections.filter((item) => item.id !== normalized.id)
    writeLocalStorage([...next, normalized])
  }
}

export const saveConnections = async (connections: ConnectionDraft[]) => {
  const normalized = migrateConnections(connections)
  if (!canUseIndexedDb()) {
    writeLocalStorage(normalized)
    return
  }

  try {
    await withStore('readwrite', async (store) => {
      await Promise.all(
        normalized.map((connection) =>
          requestToPromise(store.put(connection)),
        ),
      )
      return undefined
    })
  } catch {
    writeLocalStorage(normalized)
  }
}

export const setConnections = async (connections: ConnectionDraft[]) => {
  const normalized = migrateConnections(connections)
  if (!canUseIndexedDb()) {
    writeLocalStorage(normalized)
    return
  }

  try {
    await withStore('readwrite', async (store) => {
      await requestToPromise(store.clear())
      await Promise.all(
        normalized.map((connection) =>
          requestToPromise(store.put(connection)),
        ),
      )
      return undefined
    })
  } catch {
    writeLocalStorage(normalized)
  }
}

export const deleteConnection = async (id: string) => {
  if (!canUseIndexedDb()) {
    const connections = readLocalStorage()
    writeLocalStorage(connections.filter((item) => item.id !== id))
    return
  }

  try {
    await withStore('readwrite', (store) =>
      requestToPromise(store.delete(id)),
    )
  } catch {
    const connections = readLocalStorage()
    writeLocalStorage(connections.filter((item) => item.id !== id))
  }
}

export const clearAllConnections = async () => {
  if (!canUseIndexedDb()) {
    localStorage.removeItem(FALLBACK_KEY)
    return
  }

  try {
    await withStore('readwrite', (store) =>
      requestToPromise(store.clear()),
    )
  } catch {
    localStorage.removeItem(FALLBACK_KEY)
  }
}
