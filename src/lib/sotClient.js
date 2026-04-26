/**
 * SOT Client — Auth Bridge: Frontend → Backend SOT
 *
 * Centraliza todas las llamadas al backend externo (techrepairpro-core).
 * Inyecta automáticamente:
 *   - Authorization: Bearer <token>   (obtenido desde appParams o localStorage)
 *   - x-organization-id: <orgId>      (efectiveOrgId del tenant)
 */

import { appParams } from '@/lib/app-params';

const BACKEND_URL = 'https://techrepairpro-core-1.onrender.com';

/**
 * Obtiene el token JWT del usuario autenticado.
 * Prioriza appParams.token (más confiable), luego localStorage como fallback.
 */
function getAuthToken() {
  return appParams.token
    || localStorage.getItem('base44_access_token')
    || localStorage.getItem('base44_access__token')
    || null;
}

/**
 * Wrapper de fetch hacia el backend SOT con headers de auth inyectados.
 *
 * @param {string} path - Ruta relativa, ej: '/v1/clients'
 * @param {string} organizationId - effectiveOrgId del tenant
 * @param {RequestInit} options - Opciones de fetch (method, body, etc.)
 * @returns {Promise<any>} - El objeto 'data' de la respuesta JSON
 */
export async function sotFetch(path, organizationId, options = {}) {
  const token = getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    'x-organization-id': organizationId,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers,
  });

  const resData = await response.json();

  if (!response.ok) {
    throw new Error(resData.error || `Error ${response.status} en ${path}`);
  }

  return resData.data ?? resData;
}

export { BACKEND_URL };