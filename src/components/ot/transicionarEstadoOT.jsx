import { base44 } from '@/api/base44Client';

/**
 * Helper centralizado para transiciones de estado de OrdenTrabajo
 * Valida transiciones permitidas, evita inconsistencias y registra auditoría
 * 
 * P0.2: También gestiona cambios de estado_atencion para centralizar la lógica.
 */

const TRANSICIONES_PERMITIDAS = {
  EN_COLA_REVISION: ['ASIGNADA', 'CANCELADA'],
  ASIGNADA: ['EN_REVISION', 'EN_COLA_REVISION', 'CANCELADA'],
  EN_REVISION: ['DIAGNOSTICADA', 'ASIGNADA', 'CANCELADA'],
  DIAGNOSTICADA: ['COTIZADA', 'EN_REVISION', 'CANCELADA'],
  COTIZADA: ['EN_REPARACION', 'DIAGNOSTICADA', 'CANCELADA'],
  EN_REPARACION: ['FINALIZADA', 'COTIZADA', 'CANCELADA'],
  FINALIZADA: ['ENTREGADA'],
  ENTREGADA: [],
  CANCELADA: [],
};

// Estados de atención permitidos
const ESTADOS_ATENCION_PERMITIDOS = ['ACTIVO', 'PAUSADO', 'ESPERANDO'];

/**
 * Transicionar estado de una OrdenTrabajo
 * 
 * RETROCOMPATIBILIDAD (P0.1):
 * - Firma A: transicionarEstadoOT(otId, nuevoEstado, context)
 * - Firma B: transicionarEstadoOT({ ordenTrabajoId, nuevoEstado, effectiveOrgId, userId, userEmail, motivo })
 * 
 * @param {string|Object} otIdOrParams - ID de la orden de trabajo o objeto con parámetros
 * @param {string} nuevoEstado - Nuevo estado deseado (si primer param es string)
 * @param {Object} context - Contexto adicional (userId, userEmail, organizationId, motivo) (si primer param es string)
 * @returns {Promise<Object>} - Orden actualizada
 */
export async function transicionarEstadoOT(otIdOrParams, nuevoEstado, context = {}) {
  // P0.1: Detectar firma utilizada
  let otId, estadoNuevo, ctx;

  if (typeof otIdOrParams === 'object' && otIdOrParams !== null) {
    // Firma B: objeto con parámetros
    otId = otIdOrParams.ordenTrabajoId;
    estadoNuevo = otIdOrParams.nuevoEstado;
    ctx = {
      userId: otIdOrParams.userId,
      userEmail: otIdOrParams.userEmail,
      organizationId: otIdOrParams.effectiveOrgId || otIdOrParams.organizationId,
      motivo: otIdOrParams.motivo || ''
    };
  } else {
    // Firma A: parámetros tradicionales
    otId = otIdOrParams;
    estadoNuevo = nuevoEstado;
    ctx = context;
  }

  // Guard: validar que otId sea string válido
  if (typeof otId !== 'string' || !otId) {
    throw new Error(`ID de orden de trabajo inválido. Se esperaba un string, se recibió: ${typeof otId}`);
  }

  const { userId, userEmail, organizationId, motivo = '' } = ctx;

  // 1. Obtener OT actual
  const ordenActual = await base44.entities.OrdenTrabajo.get(otId);
  if (!ordenActual) {
    throw new Error(`Orden de trabajo ${otId} no encontrada`);
  }

  const estadoActual = ordenActual.estado;

  // 2. Idempotencia: si ya está en el estado deseado, no hacer nada
  if (estadoActual === estadoNuevo) {
    return ordenActual;
  }

  // 3. Validar transición permitida
  const transicionesPermitidas = TRANSICIONES_PERMITIDAS[estadoActual];
  if (!transicionesPermitidas || !transicionesPermitidas.includes(estadoNuevo)) {
    throw new Error(
      `Transición inválida: ${estadoActual} → ${estadoNuevo}. ` +
      `Transiciones permitidas desde ${estadoActual}: ${transicionesPermitidas?.join(', ') || 'ninguna'}`
    );
  }

  // 4. Validaciones adicionales según transición
  if (estadoNuevo === 'DIAGNOSTICADA') {
    // Verificar que existe diagnóstico técnico completo
    const diagnosticos = await base44.entities.DiagnosticoTecnico.filter({
      organization_id: ordenActual.organization_id,
      orden_trabajo_id: otId,
      estado: 'listo_aprobacion',
      bloqueado: true
    });

    if (diagnosticos.length === 0) {
      throw new Error('No se puede marcar como DIAGNOSTICADA sin un diagnóstico técnico completo y bloqueado');
    }
  }

  if (estadoNuevo === 'COTIZADA') {
    // Verificar que existe cotización
    const cotizaciones = await base44.entities.Cotizacion.filter({
      organization_id: ordenActual.organization_id,
      orden_trabajo_id: otId,
    });

    if (cotizaciones.length === 0) {
      throw new Error('No se puede marcar como COTIZADA sin al menos una cotización creada');
    }
  }

  if (estadoNuevo === 'ENTREGADA') {
    // FASE 4: Validaciones obligatorias pre-entrega
    // 1. No debe haber actividades en progreso
    const actividadesActivas = await base44.entities.ActividadTecnica.filter({
      organization_id: ordenActual.organization_id,
      orden_trabajo_id: otId,
      estado: 'en_progreso',
      soft_deleted: false
    });

    if (actividadesActivas.length > 0) {
      throw new Error('No se puede entregar: hay actividades técnicas en progreso');
    }

    // 2. No debe estar ACTIVO el trabajo
    if (ordenActual.estado_atencion === 'ACTIVO') {
      throw new Error('No se puede entregar: el trabajo está activo. Debe pausarse o finalizarse primero');
    }

    // 3. Validar que viene de FINALIZADA (único estado permitido)
    if (estadoActual !== 'FINALIZADA') {
      throw new Error('Solo se pueden entregar OT que estén en estado FINALIZADA');
    }
  }

  // 5. Actualizar OT
  const ordenActualizada = await base44.entities.OrdenTrabajo.update(otId, {
    estado: estadoNuevo,
    ultima_actividad: motivo || `Transición: ${estadoActual} → ${estadoNuevo}`,
    ultima_actividad_at: new Date().toISOString()
  });

  // P0.3: Auditoría NO bloqueante (best-effort, asíncrona)
  base44.entities.SuperAdminAudit.create({
    super_admin_id: userId || 'system',
    super_admin_email: userEmail || 'system',
    action: 'ot_state_transition',
    target_organization_id: organizationId || ordenActual.organization_id,
    context: `OT ${ordenActual.codigo_ot || otId}: ${estadoActual} → ${estadoNuevo}. Motivo: ${motivo || 'N/A'}`
  }).catch(auditError => {
    // P0.3: Solo log, nunca bloquear la transición
    console.warn('[AUDIT] Error no crítico al registrar auditoría de transición:', auditError.message);
  });

  return ordenActualizada;
}

/**
 * P0.2: Helper para cambiar estado_atencion
 * Centraliza la lógica de cambios de estado de atención del técnico.
 */
export async function cambiarEstadoAtencionOT({
  ordenTrabajoId,
  nuevoEstadoAtencion,
  motivoPausa = null,
  observaciones = null,
  effectiveOrgId,
  userId,
  userEmail
}) {
  // Validar estado de atención
  if (!ESTADOS_ATENCION_PERMITIDOS.includes(nuevoEstadoAtencion)) {
    throw new Error(`Estado de atención no válido: ${nuevoEstadoAtencion}`);
  }

  // Obtener OT actual
  const ot = await base44.entities.OrdenTrabajo.get(ordenTrabajoId);
  if (!ot) {
    throw new Error(`Orden de trabajo ${ordenTrabajoId} no encontrada`);
  }

  // Validación: Si se va a pausar, motivo_pausa es obligatorio
  if (nuevoEstadoAtencion === 'PAUSADO' && !motivoPausa) {
    throw new Error('El motivo de pausa es obligatorio');
  }

  // Preparar datos de actualización
  const updateData = {
    estado_atencion: nuevoEstadoAtencion,
    ultima_actividad: observaciones || `Estado de atención cambiado a ${nuevoEstadoAtencion}`,
    ultima_actividad_at: new Date().toISOString()
  };

  if (nuevoEstadoAtencion === 'PAUSADO' && motivoPausa) {
    updateData.motivo_pausa = motivoPausa;
  }

  // Actualizar OT
  const otActualizada = await base44.entities.OrdenTrabajo.update(ordenTrabajoId, updateData);

  // P0.3: Auditoría NO bloqueante (best-effort, asíncrona)
  base44.entities.SuperAdminAudit.create({
    super_admin_id: userId || 'system',
    super_admin_email: userEmail || 'system',
    action: 'ot_estado_atencion_cambio',
    target_organization_id: effectiveOrgId,
    context: `OT ${ot.codigo_ot}: estado_atencion ${ot.estado_atencion || 'N/A'} → ${nuevoEstadoAtencion}. Motivo: ${motivoPausa || 'N/A'}`
  }).catch(auditError => {
    // P0.3: Solo log, nunca bloquear el cambio de estado
    console.warn('[AUDIT] Error no crítico al registrar auditoría de estado_atencion:', auditError.message);
  });

  return otActualizada;
}