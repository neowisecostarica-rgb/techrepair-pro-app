// Isolated candidate: no runtime imports or data changes.
// Initial scope for verification, not a list of markets approved for launch.
export const VERIFIED_CANDIDATE_CURRENCIES = Object.freeze(['CRC','USD','MXN','EUR']);
const locales = Object.freeze({es:'es-CR',en:'en-US',pt:'pt-BR',fr:'fr-FR',no:'nb-NO'});
export function requireCurrency(value) {
  if (!VERIFIED_CANDIDATE_CURRENCIES.includes(value)) throw new Error('CURRENCY_UNVERIFIED');
  return value;
}
export function requireDocumentCurrency(doc) {
  return requireCurrency(doc?.currency);
}
export function assertSameCurrency(...documents) {
  if (!documents.length) throw new Error('CURRENCY_UNVERIFIED');
  const currency = requireDocumentCurrency(documents[0]);
  if (documents.some(doc => requireDocumentCurrency(doc) !== currency)) {
    throw new Error('CURRENCY_MISMATCH');
  }
  return currency;
}
// Never use an organization's current currency or browser locale to relabel a historical document.
export function formatDocumentAmount(doc, amount, locale = 'es') {
  const currency = requireDocumentCurrency(doc);
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new Error('INVALID_AMOUNT');
  return new Intl.NumberFormat(locales[locale] ?? locales.es, {
    style:'currency',currency,currencyDisplay:'code',minimumFractionDigits:2,maximumFractionDigits:2
  }).format(amount);
}
export function formatPdfAmount(doc, amount) {
  const currency = requireDocumentCurrency(doc);
  if (typeof amount !== 'number' || !Number.isFinite(amount) || Math.abs(amount) >= 1e21) throw new Error('INVALID_AMOUNT');
  return currency + ' ' + amount.toFixed(2);
}
// A snapshot candidate for new records only, derived from canonical server-side tenant.
// Caller must authenticate and authorize the tenant before use; this is not an auth check.
export function deriveNewDocumentCurrency(authorizedOrg, documentOrgId, originDocument = null) {
  if (!documentOrgId || authorizedOrg?.id !== documentOrgId) throw new Error('CURRENCY_TENANT_MISMATCH');
  const currency = requireCurrency(authorizedOrg.currency);
  if (originDocument) {
    if (originDocument.organization_id !== documentOrgId) throw new Error('CURRENCY_TENANT_MISMATCH');
    assertSameCurrency({currency}, originDocument);
  }
  return currency;
}
