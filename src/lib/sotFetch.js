import { base44 } from '@/api/base44Client';

const BACKEND_URL = 'https://techrepairpro-core-1.onrender.com';

/**
 * sotFetch — fetch centralizado con auth hacia el backend SOT.
 * Obtiene el token de Base44 de forma oficial y lo incluye en cada request.
 *
 * @param {string} path       - ruta relativa, ej: '/v1/clients'
 * @param {string} orgId      - effectiveOrgId del tenant
 * @param {RequestInit} opts  - opciones fetch adicionales (method, body, etc.)
 * @returns {Promise<any>}    - resData.data del response JSON
 */
export async function sotFetch(path, orgId, opts = {}) {
  if (!orgId) {
    throw new Error('sotFetch: organization_id es requerido');
  }

  const token = await base44.auth.getAccessToken();
  if (!token) {
    throw new Error('sotFetch: no hay sesión activa. El usuario debe autenticarse.');
  }

  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-organization-id': orgId,
      ...(opts.headers || {}),
    },
  });

  const resData = await response.json();

  if (!response.ok) {
    throw new Error(resData.error || `Error ${response.status} desde el backend`);
  }

  return resData.data;
}