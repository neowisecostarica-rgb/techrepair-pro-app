const BACKEND_URL = 'https://techrepairpro-core-1.onrender.com';

/*
========================================
SOT FETCH — Identity Bridge via middleware
El token se recibe como parámetro desde el componente React.
El backend resuelve users/memberships automáticamente.

Uso:
  const token = await base44.auth.getAccessToken();
  const data = await sotFetch('/v1/ruta', effectiveOrgId, token, opts);
========================================
*/
export async function sotFetch(path, orgId, token, opts = {}) {
  if (!orgId) {
    throw new Error('organization_id requerido');
  }

  if (!token) {
    throw new Error('token requerido');
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
    throw new Error(resData.error || `Error ${response.status}`);
  }

  return resData.data;
}