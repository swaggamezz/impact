import type { ConnectionDraft } from '../models/connection'
import type { KvkProfile, KvkSignatory } from '../types/kvk'

const pickInvoiceAddress = (profile: KvkProfile) =>
  profile.postalAddress ?? profile.mainVisitingAddress

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
  if (profile.legalName) {
    patch.legalName = profile.legalName
  }
  if (profile.tradeName || profile.tradeNames?.length) {
    patch.tradeName = profile.tradeName ?? profile.tradeNames?.[0]
  }
  if (profile.legalForm) {
    patch.legalForm = profile.legalForm
  }
  if (profile.companyActive) {
    patch.companyActive = profile.companyActive
  }

  if (profile.contactEmail) patch.contactEmail = profile.contactEmail
  if (profile.contactPhone) patch.contactPhone = profile.contactPhone
  if (profile.website) patch.website = profile.website
  if (profile.invoiceEmail) patch.invoiceEmail = profile.invoiceEmail
  if (profile.vatNumber) patch.vatNumber = profile.vatNumber

  if (signatory?.name) {
    patch.authorizedSignatory = signatory.name
  }
  if (signatory?.role) {
    patch.authorizedSignatoryRole = signatory.role
  }

  const address = pickInvoiceAddress(profile)
  if (address?.street) patch.invoiceStreet = address.street
  if (address?.houseNumber) {
    patch.invoiceHouseNumber = address.houseNumber
  }
  if (address?.addition) {
    patch.invoiceHouseNumberAddition = address.addition
  }
  if (address?.postcode) patch.invoicePostcode = address.postcode
  if (address?.city) patch.invoiceCity = address.city

  return patch
}

export const applyKvkPatch = (
  connection: ConnectionDraft,
  patch: Partial<ConnectionDraft>,
) => ({
  ...connection,
  ...patch,
})
