import { base44 } from '@/api/base44Client';

/**
 * VALIDACIONES CANÓNICAS POS - DISCUSS APROBADO
 * Implementa todas las validaciones anti-bugs agrupadas
 */

/**
 * 1️⃣ Validar integridad Cliente ↔ OT
 * Bloquea cobros si la OT no pertenece al cliente
 */
export async function validarClienteOT(clienteId, otId) {
  if (!clienteId || !otId) {
    return { valido: true }; // Si no hay ambos, no aplica validación
  }

  const ots = await base44.entities.OrdenTrabajo.filter({ id: otId });
  const ot = ots[0];

  if (!ot) {
    return {
      valido: false,
      mensaje: 'Orden de Trabajo no encontrada'
    };
  }

  if (ot.cliente_id !== clienteId) {
    return {
      valido: false,
      mensaje: 'ERROR CRÍTICO: La OT no pertenece al cliente seleccionado. Operación bloqueada.'
    };
  }

  return { valido: true };
}

/**
 * 2️⃣ Validar estados válidos para cobro
 * Bloquea cobros a OTs ENTREGADAS o CANCELADAS
 */
export async function validarEstadoOTParaCobro(otId) {
  if (!otId) {
    return { valido: true }; // Si no hay OT, no aplica
  }

  const ots = await base44.entities.OrdenTrabajo.filter({ id: otId });
  const ot = ots[0];

  if (!ot) {
    return {
      valido: false,
      mensaje: 'Orden de Trabajo no encontrada'
    };
  }

  if (['ENTREGADA', 'CANCELADA'].includes(ot.estado)) {
    return {
      valido: false,
      mensaje: `No se puede cobrar una OT en estado ${ot.estado}`
    };
  }

  return { valido: true, ot };
}

/**
 * 3️⃣ Validar aprobación cliente para reparación
 * Bloquea cobro de reparación sin aprobación
 */
export async function validarAprobacionClienteParaReparacion(otId, tipoConcepto) {
  if (tipoConcepto !== 'reparacion') {
    return { valido: true }; // Solo aplica a reparaciones
  }

  if (!otId) {
    return {
      valido: false,
      mensaje: 'No se puede cobrar reparación sin OT asociada'
    };
  }

  const ots = await base44.entities.OrdenTrabajo.filter({ id: otId });
  const ot = ots[0];

  if (!ot) {
    return {
      valido: false,
      mensaje: 'Orden de Trabajo no encontrada'
    };
  }

  if (!ot.cliente_aprobado) {
    return {
      valido: false,
      mensaje: 'No se puede cobrar reparación sin aprobación del cliente'
    };
  }

  return { valido: true };
}

/**
 * 4️⃣ Control de cotizaciones duplicadas
 * Permite solo UNA cotización activa por OT
 */
export async function validarCotizacionUnica(otId, organizationId) {
  if (!otId) {
    return { valido: true }; // Sin OT, no aplica
  }

  const cotizaciones = await base44.entities.Cotizacion.filter({
    organization_id: organizationId,
    orden_trabajo_id: otId,
    estado: 'enviada' // Solo las enviadas cuentan como activas
  });

  if (cotizaciones.length > 0) {
    return {
      valido: false,
      mensaje: 'Ya existe una cotización activa para esta OT. Debe cancelarse o aprobarse antes de crear una nueva.',
      cotizacionesActivas: cotizaciones
    };
  }

  return { valido: true };
}

/**
 * 5️⃣ Habilitar diagnóstico tras pago de revisión
 * Marca la OT como habilitada para diagnóstico técnico
 */
export async function habilitarDiagnosticoTrasPago(otId, ventaId) {
  if (!otId) return;

  const ahora = new Date().toISOString();

  await base44.entities.OrdenTrabajo.update(otId, {
    diagnostico_habilitado: true,
    revision_pagada_at: ahora,
    revision_venta_id: ventaId
  });
}

/**
 * VALIDADOR MAESTRO
 * Ejecuta todas las validaciones necesarias según el tipo de venta
 */
export async function validarVentaPOS({
  clienteId,
  otId,
  tipoConcepto,
  organizationId
}) {
  // 1. Validar Cliente ↔ OT
  const validacionCliente = await validarClienteOT(clienteId, otId);
  if (!validacionCliente.valido) {
    return validacionCliente;
  }

  // 2. Validar estado OT
  const validacionEstado = await validarEstadoOTParaCobro(otId);
  if (!validacionEstado.valido) {
    return validacionEstado;
  }

  // 3. Validar aprobación para reparación
  const validacionAprobacion = await validarAprobacionClienteParaReparacion(otId, tipoConcepto);
  if (!validacionAprobacion.valido) {
    return validacionAprobacion;
  }

  return { valido: true, ot: validacionEstado.ot };
}