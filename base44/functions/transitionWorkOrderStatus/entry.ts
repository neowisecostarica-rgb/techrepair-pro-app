import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── STATE MACHINE OFICIAL ────────────────────────────────────────────────────
// Fuente de verdad: DISCUSS semántico ONF TechRepairPro
const ALLOWED_TRANSITIONS = {
  EN_COLA_REVISION: ['ASIGNADA', 'CANCELADA'],
  ASIGNADA:         ['EN_REVISION', 'CANCELADA'],
  EN_REVISION:      ['DIAGNOSTICADA', 'CANCELADA'],
  DIAGNOSTICADA:    ['COTIZADA', 'APROBADA', 'CANCELADA'],
  COTIZADA:         ['APROBADA', 'CANCELADA'],
  APROBADA:         ['EN_REPARACION', 'CANCELADA'],
  EN_REPARACION:    ['PRUEBAS', 'CANCELADA'],
  PRUEBAS:          ['FINALIZADA', 'EN_REPARACION'],
  FINALIZADA:       ['ENTREGADA'],
  ENTREGADA:        [], // irreversible
  CANCELADA:        [], // irreversible
};

// Estados que bloquean CUALQUIER modificación
const IRREVERSIBLE_STATES = ['ENTREGADA', 'CANCELADA'];

// Roles autorizados por transición destino
// undefined = cualquier rol autenticado puede hacerlo (se restringe más abajo si aplica)
const AUTHORIZED_ROLES_FOR_TARGET = {
  ASIGNADA:      ['ORG_ADMIN', 'BRANCH_ADMIN'],
  EN_REVISION:   ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'],
  DIAGNOSTICADA: ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'],
  COTIZADA:      ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'],
  APROBADA:      ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'],
  EN_REPARACION: ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'],
  PRUEBAS:       ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'],
  FINALIZADA:    ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'],
  ENTREGADA:     ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'],
  CANCELADA:     ['ORG_ADMIN', 'BRANCH_ADMIN'],
};

// Validaciones de datos mínimos requeridos por transición destino
// Retorna null si OK, o string de error si falla
function validatePayloadForTarget(targetStatus, ot, extra) {
  switch (targetStatus) {
    case 'ASIGNADA':
      if (!extra?.tecnico_asignado_id && !ot.tecnico_asignado_id) {
        return 'Se requiere tecnico_asignado_id para asignar la OT';
      }
      break;
    case 'EN_REVISION':
      if (!ot.tecnico_asignado_id && !extra?.tecnico_asignado_id) {
        return 'La OT debe tener un técnico asignado para iniciar revisión';
      }
      break;
    case 'DIAGNOSTICADA':
      if (!ot.tecnico_asignado_id) {
        return 'La OT debe tener un técnico asignado para marcar como diagnosticada';
      }
      break;
    case 'APROBADA':
      // Validación soft: se recomienda cliente_aprobado, pero puede venir como extra
      // No bloqueamos hard aquí porque la aprobación viene del portal o ventas
      break;
    case 'EN_REPARACION':
      if (!ot.tecnico_asignado_id) {
        return 'La OT debe tener un técnico asignado para iniciar reparación';
      }
      break;
    case 'ENTREGADA':
      // La validación de pago se hace en EntregarOT antes de llamar esta función
      // Aquí solo validamos el estado base
      break;
    default:
      break;
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── 1. Auth ────────────────────────────────────────────────────────────────
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'No autenticado' }, { status: 401 });
    }

    // ── 2. Resolver organization_id ───────────────────────────────────────────
    const orgId = user.organization_id || user.impersonating_org_id || user.data?.impersonating_org_id;
    if (!orgId) {
      return Response.json({ error: 'organization_id no resuelto para este usuario' }, { status: 403 });
    }

    // ── 3. Resolver rol efectivo ──────────────────────────────────────────────
    // Para SUPER_ADMIN en impersonación, permitir todas las transiciones
    const isSuperAdmin = user.is_super_admin === true || user.data?.is_super_admin === true;
    let effectiveRole = user.role; // rol de Base44 app level

    // Si no es super_admin, buscar rol en UserAccount
    if (!isSuperAdmin) {
      const accounts = await base44.asServiceRole.entities.UserAccount.filter({
        user_id: user.id,
        organization_id: orgId,
      }, 1);

      if (!accounts || accounts.length === 0) {
        return Response.json({ error: 'Usuario sin cuenta activa en esta organización' }, { status: 403 });
      }

      const account = accounts[0];
      if (account.status === 'suspended') {
        return Response.json({ error: 'Cuenta suspendida' }, { status: 403 });
      }

      effectiveRole = account.role; // ORG_ADMIN, BRANCH_ADMIN, TECHNICIAN, SALES, etc.
    }

    // ── 4. Parsear body ───────────────────────────────────────────────────────
    const body = await req.json();
    const {
      orden_trabajo_id,
      newStatus,
      observacion,
      // Datos adicionales opcionales para ciertas transiciones
      tecnico_asignado_id,
      tecnico_asignado_email,
    } = body;

    if (!orden_trabajo_id) {
      return Response.json({ error: 'orden_trabajo_id es obligatorio' }, { status: 400 });
    }
    if (!newStatus) {
      return Response.json({ error: 'newStatus es obligatorio' }, { status: 400 });
    }
    if (!ALLOWED_TRANSITIONS.hasOwnProperty(newStatus)) {
      return Response.json({
        error: `Estado destino inválido: "${newStatus}". Estados válidos: ${Object.keys(ALLOWED_TRANSITIONS).join(', ')}`,
      }, { status: 400 });
    }

    // ── 5. Cargar OT y validar ownership ─────────────────────────────────────
    const ordenes = await base44.asServiceRole.entities.OrdenTrabajo.filter({
      id: orden_trabajo_id,
      organization_id: orgId,
    }, 1);

    if (!ordenes || ordenes.length === 0) {
      return Response.json({ error: 'Orden de trabajo no encontrada en esta organización' }, { status: 404 });
    }

    const ot = ordenes[0];
    const currentStatus = ot.estado;

    // ── 6. Bloqueo de estados irreversibles ───────────────────────────────────
    if (IRREVERSIBLE_STATES.includes(currentStatus)) {
      return Response.json({
        error: `La OT está en estado "${currentStatus}" y no puede ser modificada. Este estado es irreversible.`,
        current_status: currentStatus,
      }, { status: 422 });
    }

    // ── 7. Validar transición permitida en state machine ──────────────────────
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      return Response.json({
        error: `Transición no permitida: "${currentStatus}" → "${newStatus}". Transiciones válidas desde "${currentStatus}": [${allowed.join(', ') || 'ninguna'}]`,
        current_status: currentStatus,
        target_status: newStatus,
        allowed_targets: allowed,
      }, { status: 422 });
    }

    // ── 8. Validar rol para el estado destino ─────────────────────────────────
    if (!isSuperAdmin) {
      const rolesPermitidos = AUTHORIZED_ROLES_FOR_TARGET[newStatus];
      if (rolesPermitidos && !rolesPermitidos.includes(effectiveRole)) {
        return Response.json({
          error: `Tu rol "${effectiveRole}" no tiene permiso para mover la OT a "${newStatus}". Roles permitidos: [${rolesPermitidos.join(', ')}]`,
          required_roles: rolesPermitidos,
          user_role: effectiveRole,
        }, { status: 403 });
      }
    }

    // ── 9. Validar datos mínimos requeridos ───────────────────────────────────
    const extra = { tecnico_asignado_id, tecnico_asignado_email };
    const validationError = validatePayloadForTarget(newStatus, ot, extra);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 422 });
    }

    // ── 10. Construir payload de actualización ────────────────────────────────
    const now = new Date().toISOString();
    const updatePayload = {
      estado: newStatus,
      ultima_actividad: observacion || `Estado cambiado a ${newStatus}`,
      ultima_actividad_at: now,
    };

    // Datos adicionales por transición
    if (newStatus === 'ASIGNADA' && tecnico_asignado_id) {
      updatePayload.tecnico_asignado_id = tecnico_asignado_id;
      if (tecnico_asignado_email) {
        updatePayload.tecnico_asignado_email = tecnico_asignado_email;
      }
    }
    if (newStatus === 'EN_REVISION') {
      updatePayload.fecha_revision_inicio = updatePayload.fecha_revision_inicio || now;
    }
    if (newStatus === 'DIAGNOSTICADA') {
      updatePayload.fecha_diagnostico = now;
    }
    if (newStatus === 'FINALIZADA') {
      updatePayload.fecha_cierre = now;
    }

    // ── 11. Ejecutar actualización ────────────────────────────────────────────
    const updatedOT = await base44.asServiceRole.entities.OrdenTrabajo.update(orden_trabajo_id, updatePayload);

    // ── 12. OTEvent oficial — ownership: transitionWorkOrderStatus ───────────────
    // Modelo aprobado ONF-v2 Bloque 0B.1a
    //
    // EVENTOS CANÓNICOS (idempotencia estricta: 1 por OT):
    //   FINALIZADA → solo cuando newStatus es FINALIZADA
    //   ENTREGADA  → solo cuando newStatus es ENTREGADA
    //   CANCELADA  → solo cuando newStatus es CANCELADA
    //
    // EVENTOS TRANSICIÓN (siempre se crean, no son idempotentes por diseño):
    //   TRANSITION_ASIGNADA, TRANSITION_EN_REVISION, TRANSITION_DIAGNOSTICADA,
    //   TRANSITION_COTIZADA, TRANSITION_APROBADA, TRANSITION_EN_REPARACION, TRANSITION_PRUEBAS
    //
    // CREATED → ownership exclusivo de createWorkOrder (Bloque 0B.1a)
    // NO existen: TRANSITION_FINALIZADA, TRANSITION_ENTREGADA, TRANSITION_CANCELADA
    // processPostSaleActions sigue siendo dueño exclusivo de SALE_COMPLETED

    const CANONICAL_EVENTS = ['FINALIZADA', 'ENTREGADA', 'CANCELADA'];
    const TRANSITION_EVENT_MAP = {
      ASIGNADA:      'TRANSITION_ASIGNADA',
      EN_REVISION:   'TRANSITION_EN_REVISION',
      DIAGNOSTICADA: 'TRANSITION_DIAGNOSTICADA',
      COTIZADA:      'TRANSITION_COTIZADA',
      APROBADA:      'TRANSITION_APROBADA',
      EN_REPARACION: 'TRANSITION_EN_REPARACION',
      PRUEBAS:       'TRANSITION_PRUEBAS',
    };

    try {
      const isCanonical = CANONICAL_EVENTS.includes(newStatus);
      const transitionType = TRANSITION_EVENT_MAP[newStatus];

      // ── A. CANÓNICOS (FINALIZADA, ENTREGADA, CANCELADA): idempotencia estricta ─
      // NOTA: CREATED es ownership exclusivo de createWorkOrder (Bloque 0B.1a)
      if (isCanonical) {
        const existingCanonical = await base44.asServiceRole.entities.OTEvent.filter({
          orden_trabajo_id: orden_trabajo_id,
          tipo: newStatus,
        }, 1);
        if (!existingCanonical || existingCanonical.length === 0) {
          await base44.asServiceRole.entities.OTEvent.create({
            organization_id: orgId,
            orden_trabajo_id: orden_trabajo_id,
            tipo: newStatus,
            created_by_user_id: user.id,
            processed: false,
            created_at: now,
          });
          console.log(`[transitionWorkOrderStatus] OTEvent canónico ${newStatus} — OT: ${orden_trabajo_id}`);
        } else {
          console.log(`[transitionWorkOrderStatus] OTEvent canónico ${newStatus} ya existe (idempotencia) — OT: ${orden_trabajo_id}`);
        }
      }

      // ── C. TRANSICIÓN: eventos intermedios, sin idempotencia (permiten historial) ─
      if (transitionType) {
        await base44.asServiceRole.entities.OTEvent.create({
          organization_id: orgId,
          orden_trabajo_id: orden_trabajo_id,
          tipo: transitionType,
          created_by_user_id: user.id,
          processed: false,
          created_at: now,
        });
        console.log(`[transitionWorkOrderStatus] OTEvent ${transitionType} — OT: ${orden_trabajo_id}`);
      }

    } catch (traceError) {
      // Trazabilidad no debe romper el flujo principal
      console.warn('[transitionWorkOrderStatus] trazabilidad_fallida:', traceError.message);
    }

    console.log(`[transitionWorkOrderStatus] OK — OT: ${orden_trabajo_id}, ${currentStatus} → ${newStatus}, usuario: ${user.email}, rol: ${effectiveRole}`);

    return Response.json({
      success: true,
      orden_trabajo_id,
      previous_status: currentStatus,
      new_status: newStatus,
      updated_at: now,
      updated_by: user.email,
      updated_by_role: effectiveRole,
      orden_trabajo: updatedOT,
    });

  } catch (error) {
    console.error('[transitionWorkOrderStatus] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});