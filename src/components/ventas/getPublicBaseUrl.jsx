/**
 * Helper para obtener la URL base de portales públicos
 * Respeta white-label si está configurado
 * 
 * @param {Object} organization - Organization entity
 * @returns {string} URL base para links públicos
 */
export function getPublicBaseUrl(organization) {
  return organization?.public_base_url || window.location.origin;
}