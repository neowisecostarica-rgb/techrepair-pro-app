import { base44 } from '@/api/base44Client';

const BACKEND_URL = 'https://techrepairpro-core-1.onrender.com';

/*
========================================
SOT FETCH — Identity Bridge via middleware
El token de Base44 se pasa directamente.
El backend resuelve users/memberships automáticamente.
========================================
*/
export async function sotFetch(path, orgId, opts = {}) {
  if (!orgId) {
    throw new Error('organization_id requerido');
  }

  try {
    const token = await base44.auth.getAccessToken();

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

  } catch (error) {
    console.error('SOT FETCH ERROR:', {
      path,
      orgId,
      message: error.message,
    });

    throw error;
  }
}