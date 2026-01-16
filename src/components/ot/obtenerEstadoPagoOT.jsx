import { base44 } from '@/api/base44Client';

/**
 * P0.1 - FUENTE ÚNICA DE VERDAD: Estado de Pago de OT
 * 
 * Deriva el estado de pago EXCLUSIVAMENTE desde Ventas.
 * NO se almacena en OT.
 * 
 * @param {string} otId - ID de la Orden de Trabajo
 * @param {string} organizationId - ID de la organización
 * @returns {Promise<{status: "PAGADO"|"PENDIENTE", ventasRelacionadas: Array}>}
 */
export async function obtenerEstadoPagoOT(otId, organizationId) {
  if (!otId || !organizationId) {
    return { status: 'PENDIENTE', ventasRelacionadas: [] };
  }

  try {
    // Buscar ventas asociadas a esta OT
    const ventas = await base44.entities.Venta.filter({
      organization_id: organizationId,
      referencia_ot_id: otId
    });

    // Filtrar solo ventas pagadas (estado = 'pagada')
    const ventasPagadas = ventas.filter(v => v.estado === 'pagada');

    // REGLA: Si existe al menos una venta pagada → PAGADO
    // De lo contrario → PENDIENTE
    if (ventasPagadas.length > 0) {
      return { status: 'PAGADO', ventasRelacionadas: ventas };
    }

    return { status: 'PENDIENTE', ventasRelacionadas: ventas };
  } catch (error) {
    console.error('[Estado Pago OT] Error al consultar ventas:', error);
    return { status: 'PENDIENTE', ventasRelacionadas: [] };
  }
}

/**
 * Hook React para obtener estado de pago en componentes
 * (opcional, para uso con react-query)
 */
export function useEstadoPagoOT(otId, organizationId) {
  const [estado, setEstado] = React.useState({ status: 'PENDIENTE', ventasRelacionadas: [] });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!otId || !organizationId) {
      setEstado({ status: 'PENDIENTE', ventasRelacionadas: [] });
      setLoading(false);
      return;
    }

    obtenerEstadoPagoOT(otId, organizationId).then(resultado => {
      setEstado(resultado);
      setLoading(false);
    });
  }, [otId, organizationId]);

  return { ...estado, loading };
}