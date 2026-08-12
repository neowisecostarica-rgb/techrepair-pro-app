import { base44 } from '@/api/base44Client';

const ROUTES = Object.freeze({
  work_order: 'PortalEstadoOrden',
  quote: 'PortalCotizacion',
  warranty: 'PortalGarantia',
  receipt: 'PortalComprobante',
});

export async function issuePublicLink(type, resourceId, baseUrl = window.location.origin) {
  if (!ROUTES[type] || !resourceId) throw new Error('PUBLIC_LINK_REQUEST_INVALID');
  const response = await base44.functions.invoke('issuePublicDocumentToken', {
    type,
    resource_id: resourceId,
    correlation_id: crypto.randomUUID(),
  });
  const result = response?.data || response;
  if (!result?.token) throw new Error(result?.error || 'No se pudo emitir el enlace publico');
  return `${baseUrl || window.location.origin}/${ROUTES[type]}?token=${encodeURIComponent(result.token)}`;
}
