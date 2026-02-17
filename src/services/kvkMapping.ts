import type { ConnectionDraft } from '../models/connection'
import type { KvkProfile, KvkSignatory } from '../types/kvk'

export const buildKvkPatch = (
  profile: KvkProfile,
  signatory?: KvkSignatory,
): Partial<ConnectionDraft> => {
  const patch: Partial<ConnectionDraft> = {
    kvkNumber: profile.kvkNumber,
    invoiceSameAsDelivery: false,
  }

  const name = profile.legalName || profile.tradeName
  if (name) {
    patch.tenaamstelling = name
  }

  if (profile.legalForm) {
    patch.legalForm = profile.legalForm
  }

  if (signatory?.name) {
    patch.authorizedSignatory = signatory.name
  }

  if (profile.address.street) patch.invoiceStreet = profile.address.street
  if (profile.address.houseNumber) {
    patch.invoiceHouseNumber = profile.address.houseNumber
  }
  if (profile.address.houseNumberAddition) {
    patch.invoiceHouseNumberAddition = profile.address.houseNumberAddition
  }
  if (profile.address.postcode) patch.invoicePostcode = profile.address.postcode
  if (profile.address.city) patch.invoiceCity = profile.address.city

  return patch
}

export const applyKvkPatch = (
  connection: ConnectionDraft,
  patch: Partial<ConnectionDraft>,
) => ({
  ...connection,
  ...patch,
})
