import { base44 } from '@/api/base44Client';

const BACKEND_URL = 'https://techrepairpro-core-1.onrender.com';

/*
========================================
GET SOT TOKEN (POR ORG)
========================================
*/
async function getSotToken(orgId) {
  const storageKey = `sot_token_${orgId}`;
  let sotToken = localStorage.getItem(storageKey);

  if (sotToken) return sotToken;

  const base44Token = await base44.auth.getAccessToken();

  if (!base44Token) {
    throw new Error('Usuario no autenticado en Base44');
  }

  const user = await base44.auth.me();

  const response = await fetch(`${BACKEND_URL}/v1/auth/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      base44_id: user.id,
      email: user.email,
      full_name: user.full_name,
      organization_id: orgId,
      role: user.role || 'admin',
    }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error('Error en auth sync');
  }

  localStorage.setItem(storageKey, data.token);

  return data.token;
}

/*
========================================
SOT FETCH REAL
========================================
*/
export async function sotFetch(path, orgId, opts = {}) {
  if (!orgId) {
    throw new Error('organization_id requerido');
  }

  try {
    const token = await getSotToken(orgId);

    const response = await fetch(`${BACKEND_URL}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });

    const resData = await response.json();

    if (!response.ok) {
      // token inválido → limpiar SOLO de esa org
      if (response.status === 401) {
        localStorage.removeItem(`sot_token_${orgId}`);
      }

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