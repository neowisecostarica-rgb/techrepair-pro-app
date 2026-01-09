/**
 * Genera un código interno único para productos de inventario
 * Formato: PROD-{orgPrefix}-{timestamp}-{random}
 */
export function generarCodigoInterno(organizationId) {
  // Extraer prefijo de la org (primeros 4 caracteres)
  const orgPrefix = organizationId.slice(0, 4).toUpperCase();
  
  // Timestamp corto (últimos 8 dígitos)
  const timestamp = Date.now().toString().slice(-8);
  
  // Random corto (4 caracteres)
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  
  return `PROD-${orgPrefix}-${timestamp}-${random}`;
}

/**
 * Valida que un código sea único en la organización
 */
export async function validarCodigoUnico(base44, codigo, organizationId, excludeId = null) {
  const existing = await base44.entities.Inventario.filter({
    organization_id: organizationId,
    codigo_interno: codigo
  });
  
  // Si hay resultados y no es el mismo item que estamos editando
  return existing.length === 0 || (excludeId && existing[0].id === excludeId);
}