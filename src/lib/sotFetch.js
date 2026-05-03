const BACKEND_URL = 'https://techrepairpro-core-1.onrender.com';

/*
========================================
SOT FETCH — Identity Bridge via middleware
El backend resuelve usuario y organización automáticamente vía cookie de sesión.

Uso:
  const data = await sotFetch('/v1/ruta', effectiveOrgId, opts);
========================================
*/
export async function sotFetch(path, orgId, opts = {}) {
  if (!orgId) {
    throw new Error('organization_id requerido');
  }

  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...opts,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-organization-id': orgId,
      ...(opts.headers || {}),
    },
  });

  const resData = await response.json();

  if (!response.ok) {
    throw new Error(resData.error || `Error ${response.status}`);
  }

  return resData.data;
}