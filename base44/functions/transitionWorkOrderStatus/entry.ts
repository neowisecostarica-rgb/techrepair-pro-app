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
      // GUARDA DOCUMENTAL P0.2-C: Requiere DiagnosticoDocumento emitido
      if (extra?._doc_emitido_verificado !== true) {
        return 'DIAGNOSTICADA_SIN_DOCUMENTO';
      }
      break;
    case 'APROBADA':
      break;
    case 'EN_REPARACION':
      if (!ot.tecnico_asignado_id) {
        return 'La OT debe tener un técnico asignado para iniciar reparación';
      }
      // GUARDA COMERCIAL P0.2-C: Requiere aprobación del cliente
      if (extra?._aprobacion_cliente_verificada !== true) {
        return 'EN_REPARACION_SIN_APROBACION';
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

    // ── 1. Auth — obtener runtimeUser del contexto de ejecución inmediato ──────
    const runtimeUser = await base44.auth.me();
    console.log(`[DIAG:transition] ===== INICIO FUNCIÓN =====`);
    console.log(`[DIAG:transition] RAW runtimeUser completo:`, JSON.stringify(runtimeUser, null, 2));
    console.log(`[DIAG:transition] runtimeUser.id:`, runtimeUser?.id);
    console.log(`[DIAG:transition] runtimeUser.email:`, runtimeUser?.email);
    console.log(`[DIAG:transition] runtimeUser.role (base44 app level):`, runtimeUser?.role);
    console.log(`[DIAG:transition] runtimeUser.organization_id:`, runtimeUser?.organization_id);
    console.log(`[DIAG:transition] runtimeUser.impersonating_org_id:`, runtimeUser?.impersonating_org_id);
    console.log(`[DIAG:transition] runtimeUser.is_super_admin:`, runtimeUser?.is_super_admin);
    console.log(`[DIAG:transition] runtimeUser.data completo:`, JSON.stringify(runtimeUser?.data, null, 2));

    if (!runtimeUser) {
      return Response.json({ error: 'No autenticado' }, { status: 401 });
    }

    // ── 2. Parsear body y detectar _callingUserContext ─────────────────────────
    // IMPORTANTE: el body se parsea ANTES de resolver identidad para poder detectar
    // si la llamada proviene de un contexto service role (otra función de backend).
    const body = await req.json();
    const {
      orden_trabajo_id,
      newStatus,
      observacion,
      tecnico_asignado_id,
      tecnico_asignado_email,
      _callingUserContext,
    } = body;

    // ── 3. Resolver identidad efectiva ────────────────────────────────────────
    // Si _callingUserContext está presente, la llamada proviene de otra función de backend
    // vía base44.asServiceRole.functions.invoke(). En ese caso, runtimeUser es el service role
    // y _callingUserContext contiene la identidad real del usuario que inició la acción.
    // Si NO está presente, la llamada es directa desde frontend: usar runtimeUser y su UserAccount.
    let effectiveUser;
    let orgId;
    let effectiveRole;
    let isSuperAdmin;

    if (_callingUserContext) {
      // ── Rama A: Invocación desde otra función de backend (service role) ──────
      console.log(`[DIAG:transition] _callingUserContext DETECTADO — usando identidad del llamante original`);
      console.log(`[DIAG:transition] _callingUserContext:`, JSON.stringify(_callingUserContext, null, 2));

      effectiveUser  = _callingUserContext;
      orgId          = _callingUserContext.organization_id;
      effectiveRole  = _callingUserContext.role;
      isSuperAdmin   = _callingUserContext.is_super_admin === true;

      if (!orgId) {
        console.error(`[DIAG:transition] *** 403: _callingUserContext.organization_id ausente ***`);
        return Response.json({ error: 'organization_id ausente en _callingUserContext' }, { status: 403 });
      }
      if (!effectiveRole) {
        console.error(`[DIAG:transition] *** 403: _callingUserContext.role ausente ***`);
        return Response.json({ error: 'role ausente en _callingUserContext' }, { status: 403 });
      }

      console.log(`[DIAG:transition] [Rama A] effectiveUser.id=${effectiveUser.id}, orgId=${orgId}, effectiveRole=${effectiveRole}, isSuperAdmin=${isSuperAdmin}`);

    } else {
      // ── Rama B: Invocación directa desde frontend — usar UserAccount como SOT ──
      // runtimeUser se usa ÚNICAMENTE para identificar al usuario (id, email).
      // organization_id, role y branch_id se resuelven SIEMPRE desde UserAccount.
      console.log(`[DIAG:transition] Sin _callingUserContext — resolviendo identidad desde UserAccount (SOT)`);

      isSuperAdmin = runtimeUser.is_super_admin === true || runtimeUser.data?.is_super_admin === true;
      console.log(`[DIAG:transition] isSuperAdmin:`, isSuperAdmin);

      if (isSuperAdmin) {
        // SUPER_ADMIN: usar org del token de impersonación
        orgId = runtimeUser.impersonating_org_id || runtimeUser.organization_id;
        effectiveRole = 'SUPER_ADMIN';
        effectiveUser = runtimeUser;
        console.log(`[DIAG:transition] isSuperAdmin=true — orgId desde token:`, orgId);
      } else {
        // USUARIO NORMAL: UserAccount es la ÚNICA fuente de verdad para orgId y role
        // Usar hint del token (impersonating_org_id o organization_id) para seleccionar
        // la cuenta correcta en caso de usuarios multi-org.
        const orgHint = runtimeUser.impersonating_org_id || runtimeUser.organization_id || null;
        console.log(`[DIAG:transition] orgHint del token (solo para selección):`, orgHint);

        const userAccounts = await base44.asServiceRole.entities.UserAccount.filter({
          user_id: runtimeUser.id,
        }, 5);
        console.log(`[DIAG:transition] UserAccount.filter({ user_id: '${runtimeUser?.id}' }) → count:`, userAccounts?.length);
        console.log(`[DIAG:transition] UserAccount resultado completo:`, JSON.stringify(userAccounts, null, 2));

        if (!userAccounts || userAccounts.length === 0) {
          console.error(`[DIAG:transition] *** 403: UserAccount no encontrado — user_id=${runtimeUser?.id} ***`);
          return Response.json({ error: 'UserAccount no encontrado para este usuario' }, { status: 403 });
        }

        // Seleccionar cuenta: preferir la que coincide con el hint del token, sino tomar la primera
        let account = null;
        if (orgHint) {
          account = userAccounts.find(a => a.organization_id === orgHint) || userAccounts[0];
        } else {
          account = userAccounts[0];
        }
        console.log(`[DIAG:transition] UserAccount seleccionado:`, JSON.stringify(account, null, 2));

        if (account.status === 'suspended') {
          console.error(`[DIAG:transition] *** 403: cuenta suspendida — user_id=${runtimeUser?.id} ***`);
          return Response.json({ error: 'Cuenta suspendida' }, { status: 403 });
        }

        orgId = account.organization_id;
        effectiveRole = account.role;
        effectiveUser = runtimeUser;

        console.log(`[DIAG:transition] orgId FINAL (desde UserAccount):`, orgId);
        console.log(`[DIAG:transition] effectiveRole FINAL (desde UserAccount):`, effectiveRole);
      }

      if (!orgId) {
        console.error(`[DIAG:transition] *** 403: orgId no resuelto tras consulta UserAccount ***`);
        return Response.json({ error: 'organization_id no resuelto para este usuario' }, { status: 403 });
      }

      console.log(`[DIAG:transition] [Rama B] effectiveUser.id=${effectiveUser?.id}, orgId=${orgId}, effectiveRole=${effectiveRole}, isSuperAdmin=${isSuperAdmin}`);
    }

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

    // ── GUARDA P0.2-C: DIAGNOSTICADA requiere DiagnosticoDocumento emitido ───
    if (newStatus === 'DIAGNOSTICADA') {
      // Buscar DiagnosticoTecnico activo de esta OT
      const diagActivos = await base44.asServiceRole.entities.DiagnosticoTecnico.filter({
        orden_trabajo_id: orden_trabajo_id,
        bloqueado: false,
      }, 1);
      const diagId = diagActivos?.[0]?.id;

      if (!diagId) {
        return Response.json({
          error: 'No existe un diagnóstico técnico activo para esta OT. El técnico debe completar el diagnóstico antes de continuar.',
          code: 'DIAGNOSTICADA_SIN_DIAGNOSTICO_TECNICO',
        }, { status: 422 });
      }

      const docs = await base44.asServiceRole.entities.DiagnosticoDocumento.filter({
        diagnostico_id: diagId,
      }, 5);
      const docEmitido = docs?.find(d => d.estado === 'EMITIDO' || d.estado === 'ENVIADO');

      if (!docEmitido) {
        return Response.json({
          error: 'Se requiere emitir el Documento de Diagnóstico antes de marcar la OT como DIAGNOSTICADA. Ve al Expediente → Panel Operativo → Emitir Documento.',
          code: 'DIAGNOSTICADA_SIN_DOCUMENTO_EMITIDO',
        }, { status: 422 });
      }
      extra._doc_emitido_verificado = true;
    }

    // ── GUARDA P0.2-C: EN_REPARACION requiere aprobación del cliente ──────────
    if (newStatus === 'EN_REPARACION') {
      const diagActivos = await base44.asServiceRole.entities.DiagnosticoTecnico.filter({
        orden_trabajo_id: orden_trabajo_id,
        bloqueado: false,
      }, 1);
      const diagId = diagActivos?.[0]?.id;

      if (diagId) {
        const docs = await base44.asServiceRole.entities.DiagnosticoDocumento.filter({
          diagnostico_id: diagId,
        }, 5);
        const docConAprobacion = docs?.find(d => d.aprobacion_status === 'APROBADA');

        if (!docConAprobacion) {
          return Response.json({
            error: 'Se requiere la aprobación del cliente antes de iniciar la reparación. Registra la aprobación en el Expediente → Panel Operativo.',
            code: 'EN_REPARACION_SIN_APROBACION_CLIENTE',
          }, { status: 422 });
        }
        extra._aprobacion_cliente_verificada = true;
      }
    }

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

    // ── 11.5 Cierre de ActividadTecnica (efecto secundario de DIAGNOSTICADA) ──
    // El evento oficial que finaliza el trabajo técnico es la transición exitosa a DIAGNOSTICADA.
    // El motor de transición es el único propietario de este cierre (SRP).
    if (newStatus === 'DIAGNOSTICADA') {
      try {
        const actividadesAbiertas = await base44.asServiceRole.entities.ActividadTecnica.filter({
          orden_trabajo_id: orden_trabajo_id,
          estado: 'abierto',
        }, 10);

        if (actividadesAbiertas && actividadesAbiertas.length > 0) {
          for (const actividad of actividadesAbiertas) {
            await base44.asServiceRole.entities.ActividadTecnica.update(actividad.id, {
              estado: 'cerrado',
              fecha_fin: now,
            });
          }
          console.log(`[transitionWorkOrderStatus] ActividadTecnica cerrada(s): ${actividadesAbiertas.length} — OT: ${orden_trabajo_id}`);
        } else {
          console.log(`[transitionWorkOrderStatus] Sin actividades abiertas para cerrar — OT: ${orden_trabajo_id}`);
        }
      } catch (actErr) {
        // Non-blocking: el cierre de actividad no puede revertir la transición ya exitosa
        console.warn(`[transitionWorkOrderStatus] Fallo al cerrar ActividadTecnica (non-blocking): ${actErr.message}`);
      }
    }

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
          created_by_user_id: effectiveUser.id,
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
        created_by_user_id: effectiveUser.id,
        processed: false,
        created_at: now,
      });
        console.log(`[transitionWorkOrderStatus] OTEvent ${transitionType} — OT: ${orden_trabajo_id}`);
      }

    } catch (traceError) {
      console.warn('[transitionWorkOrderStatus] trazabilidad_fallida:', traceError.message);
    }

    console.log(`[transitionWorkOrderStatus] OK — OT: ${orden_trabajo_id}, ${currentStatus} → ${newStatus}, usuario: ${effectiveUser.email}, rol: ${effectiveRole}`);
    console.log(`[DIAG:transition] ===== RESPUESTA EXITOSA — effectiveUser.id=${effectiveUser?.id}, email=${effectiveUser?.email}, effectiveRole=${effectiveRole}, orgId=${orgId} =====`);

    return Response.json({
      success: true,
      orden_trabajo_id,
      previous_status: currentStatus,
      new_status: newStatus,
      updated_at: now,
      updated_by: effectiveUser.email,
      updated_by_role: effectiveRole,
      orden_trabajo: updatedOT,
    });

  } catch (error) {
    console.error('[transitionWorkOrderStatus] Error:', error.message);
    console.error(`[DIAG:transition] *** CATCH — error.stack:`, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});