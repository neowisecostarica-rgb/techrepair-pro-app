import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── STATE MACHINE OFICIAL ────────────────────────────────────────────────────
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
  ENTREGADA:        [],
  CANCELADA:        [],
};

const IRREVERSIBLE_STATES = ['ENTREGADA', 'CANCELADA'];

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
      break;
    case 'EN_REPARACION':
      if (!ot.tecnico_asignado_id) {
        return 'La OT debe tener un técnico asignado para iniciar reparación';
      }
      break;
    case 'ENTREGADA':
      if (!extra?.ventas_pagadas_verificadas) {
        return 'ENTREGADA: se requiere al menos una Venta en estado "pagada" asociada a esta OT';
      }
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
    console.log(`[DIAG:transition] ===== INICIO FUNCIÓN =====`);
    console.log(`[DIAG:transition] RAW user completo:`, JSON.stringify(user, null, 2));
    console.log(`[DIAG:transition] user.id:`, user?.id);
    console.log(`[DIAG:transition] user.email:`, user?.email);
    console.log(`[DIAG:transition] user.role (base44 app level):`, user?.role);
    console.log(`[DIAG:transition] user.organization_id:`, user?.organization_id);
    console.log(`[DIAG:transition] user.impersonating_org_id:`, user?.impersonating_org_id);
    console.log(`[DIAG:transition] user.is_super_admin:`, user?.is_super_admin);
    console.log(`[DIAG:transition] user.data completo:`, JSON.stringify(user?.data, null, 2));

    if (!user) {
      return Response.json({ error: 'No autenticado' }, { status: 401 });
    }

    // ── 2. Resolver organization_id ───────────────────────────────────────────
    let orgId = user.impersonating_org_id || user.organization_id || user.data?.impersonating_org_id;
    console.log(`[DIAG:transition] orgId paso1 (impersonating||org_id||data.impersonating):`, orgId);

    if (!orgId && user.id) {
      const fallbackAccounts = await base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id }, 1);
      console.log(`[DIAG:transition] fallback UserAccount.filter({ user_id: '${user?.id}' }) → count:`, fallbackAccounts?.length);
      console.log(`[DIAG:transition] fallback UserAccount resultado:`, JSON.stringify(fallbackAccounts, null, 2));
      if (fallbackAccounts && fallbackAccounts.length > 0) orgId = fallbackAccounts[0].organization_id || null;
    }

    console.log(`[DIAG:transition] orgId FINAL resuelto:`, orgId);

    if (!orgId) {
      console.error(`[DIAG:transition] *** 403: orgId no resuelto ***`);
      return Response.json({ error: 'organization_id no resuelto para este usuario' }, { status: 403 });
    }

    // ── 3. Resolver rol efectivo ──────────────────────────────────────────────
    const isSuperAdmin = user.is_super_admin === true || user.data?.is_super_admin === true;
    let effectiveRole = user.role;
    console.log(`[DIAG:transition] isSuperAdmin:`, isSuperAdmin);
    console.log(`[DIAG:transition] effectiveRole inicial (user.role):`, effectiveRole);

    if (!isSuperAdmin) {
      const accounts = await base44.asServiceRole.entities.UserAccount.filter({
        user_id: user.id,
        organization_id: orgId,
      }, 1);
      console.log(`[DIAG:transition] UserAccount.filter({ user_id: '${user?.id}', organization_id: '${orgId}' }) → count:`, accounts?.length);
      console.log(`[DIAG:transition] UserAccount resultado completo:`, JSON.stringify(accounts, null, 2));

      if (!accounts || accounts.length === 0) {
        console.error(`[DIAG:transition] *** 403: accounts.length===0 — user_id=${user?.id}, orgId=${orgId} ***`);
        return Response.json({ error: 'Usuario sin cuenta activa en esta organización' }, { status: 403 });
      }

      const account = accounts[0];
      if (account.status === 'suspended') {
        console.error(`[DIAG:transition] *** 403: cuenta suspendida — user_id=${user?.id} ***`);
        return Response.json({ error: 'Cuenta suspendida' }, { status: 403 });
      }

      effectiveRole = account.role;
      console.log(`[DIAG:transition] effectiveRole FINAL (de UserAccount):`, effectiveRole);
    } else {
      console.log(`[DIAG:transition] isSuperAdmin=true — saltando lookup de UserAccount`);
    }

    // ── 4. Parsear body ───────────────────────────────────────────────────────
    const body = await req.json();
    const {
      orden_trabajo_id,
      newStatus,
      observacion,
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
      console.log(`[DIAG:transition] Validando rol para target '${newStatus}' — rolesPermitidos:`, rolesPermitidos, `— effectiveRole:`, effectiveRole);
      if (rolesPermitidos && !rolesPermitidos.includes(effectiveRole)) {
        console.error(`[DIAG:transition] *** 403: rol '${effectiveRole}' no permitido para '${newStatus}' — rolesPermitidos: [${rolesPermitidos.join(', ')}] ***`);
        return Response.json({
          error: `Tu rol "${effectiveRole}" no tiene permiso para mover la OT a "${newStatus}". Roles permitidos: [${rolesPermitidos.join(', ')}]`,
          required_roles: rolesPermitidos,
          user_role: effectiveRole,
        }, { status: 403 });
      }
    }

    // ── 9. Validar datos mínimos requeridos ───────────────────────────────────
    const extra = { tecnico_asignado_id, tecnico_asignado_email };

    if (newStatus === 'ENTREGADA') {
      const ventasPagadas = await base44.asServiceRole.entities.Venta.filter({
        organization_id: orgId,
        referencia_ot_id: orden_trabajo_id,
        estado: 'pagada',
      }, 1);

      if (!ventasPagadas || ventasPagadas.length === 0) {
        console.warn(`[transitionWorkOrderStatus] BLOQUEADO ENTREGADA — sin venta pagada. OT: ${orden_trabajo_id}`);
        return Response.json({
          error: 'No se puede entregar la OT: no existe ninguna Venta en estado "pagada" asociada a esta orden de trabajo. Realice el cobro en el Punto de Venta antes de continuar.',
          code: 'ENTREGADA_SIN_PAGO',
          orden_trabajo_id,
        }, { status: 422 });
      }

      extra.ventas_pagadas_verificadas = true;
    }

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

    // ── 12. OTEvent ───────────────────────────────────────────────────────────
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
      console.warn('[transitionWorkOrderStatus] trazabilidad_fallida:', traceError.message);
    }

    console.log(`[transitionWorkOrderStatus] OK — OT: ${orden_trabajo_id}, ${currentStatus} → ${newStatus}, usuario: ${user.email}, rol: ${effectiveRole}`);
    console.log(`[DIAG:transition] ===== RESPUESTA EXITOSA — user.id=${user?.id}, email=${user?.email}, effectiveRole=${effectiveRole}, orgId=${orgId} =====`);

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
    console.error(`[DIAG:transition] *** CATCH — error.stack:`, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});