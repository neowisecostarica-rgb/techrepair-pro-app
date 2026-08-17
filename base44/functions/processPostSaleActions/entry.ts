import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { authorizeRecordBranch } from '../_shared/operationalAuthorization.ts';

/*
=====================================
processPostSaleActions — ONF TechRepairPro v1
=====================================
Responsabilidad:
  Orquestar efectos operacionales POST venta exitosa.

  - Validar venta existe y es válida (pagada, org correcta)
  - Crear OTEvent tipo SALE_COMPLETED (solo si hay referencia_ot_id)
  - Aplicar desbloqueos operacionales autoritativos
  - Disparar transiciones de lifecycle no terminales cuando corresponda
  - Ser idempotente: no duplicar OTEvent ni repetir efectos confirmados

NO hace:
  - Crear ni modificar Venta
  - Modificar Inventario
  - Rollback financiero
  - Crear workers ni events queue

Desbloqueos implementados:
  CASO 1 — revision_diagnostico:
    Habilita el diagnóstico y resuelve el WorkflowGate comercial.
    NO mueve el lifecycle: initTechnicalActivity crea la actividad auditada
    y es el único responsable de ASIGNADA → EN_REVISION.
    
  CASO 2 — reparacion:
    COTIZADA → EN_REPARACION (via APROBADA si es necesario)
    APROBADA → EN_REPARACION

  CASO 3 — saldo_final:
    Registra/habilita el pago. La entrega fisica pertenece a deliverWorkOrder.

  CASO 4 — venta_producto:
    Solo trazabilidad, NO mueve lifecycle
=====================================
*/

// Desbloqueos operacionales por tipo_concepto y estado actual de OT
// Solo declarativo para documentación — la lógica real está abajo
const DESBLOQUEO_MAP = {
  revision_diagnostico: {}, // Desbloquea la OT; no mueve lifecycle
  reparacion:           { COTIZADA: 'APROBADA', APROBADA: 'EN_REPARACION' },
  saldo_final:          {},
  venta_producto:       {}, // No mueve lifecycle
};

// ── WF-004A: WorkflowGate resolution (COMMERCE_GATEWAY) ──────────────────────
// Tras una venta exitosa de tipo revision_diagnostico, resuelve cualquier gate
// PENDING con wait_reason=COMMERCIAL_AUTHORIZATION asociado a la OT.
const GATE_SUBJECT_TYPE = 'OrdenTrabajo';
const GATE_WAIT_REASON = 'COMMERCIAL_AUTHORIZATION';
const GATE_PROVIDER_KEY = 'COMMERCE_GATEWAY';

function buildCorrelationKey(subjectType, subjectId, waitReason) {
  return `${subjectType}:${subjectId}:${waitReason}`;
}

async function resolvePendingGates(base44, { orgId, subjectId, saleId, ventaTotal, userId }) {
  const correlationKey = buildCorrelationKey(GATE_SUBJECT_TYPE, subjectId, GATE_WAIT_REASON);
  const pending = await base44.asServiceRole.entities.WorkflowGate.filter(
    { organization_id: orgId, correlation_key: correlationKey, status: 'PENDING' }, 10
  );
  const resolved = [];
  for (const gate of (pending || [])) {
    try {
      await base44.asServiceRole.entities.WorkflowGate.update(gate.id, {
        status: 'RESOLVED',
        resolution_payload: {
          sale_id: saleId,
          venta_total: ventaTotal,
          resolved_at: new Date().toISOString(),
        },
        resolved_by_user_id: userId,
        resolved_at: new Date().toISOString(),
      });
      resolved.push(gate.id);
      console.log(`[processPostSaleActions] WorkflowGate RESOLVED — id=${gate.id}, OT=${subjectId}`);
    } catch (resolveErr) {
      console.warn(`[processPostSaleActions] WorkflowGate resolve falló (gate ${gate.id}): ${resolveErr.message}`);
    }
  }
  return resolved;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Método no permitido' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);

  // ── 1. Auth ──────────────────────────────────────────────────────────────────
  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  const authorization = await resolveAuthorizedContext(base44, user, {
    allowedRoles: ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'],
  });
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
  const orgId = authorization.organizationId;

  // ── 2. Parse body ─────────────────────────────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { sale_id } = body;
  if (!sale_id) {
    return Response.json({ error: 'sale_id es requerido' }, { status: 400 });
  }

  // ── 3. Cargar y validar Venta ─────────────────────────────────────────────────
  const ventas = await base44.asServiceRole.entities.Venta.filter({
    id: sale_id,
    organization_id: orgId,
  }, 1);

  if (!ventas || ventas.length === 0) {
    return Response.json({ error: `Venta "${sale_id}" no encontrada en esta organización` }, { status: 404 });
  }

  const venta = ventas[0];
  const branchAuthorization = authorizeRecordBranch(authorization, venta.branch_id);
  if (!branchAuthorization.ok) {
    return Response.json({ error: branchAuthorization.error, code: branchAuthorization.code }, { status: branchAuthorization.status });
  }

  // Solo procesar ventas pagadas — seguridad crítica
  if (venta.estado !== 'pagada') {
    console.warn(`[processPostSaleActions] Venta ${sale_id} ignorada — estado: ${venta.estado}`);
    return Response.json({
      success: true,
      skipped: true,
      reason: `Venta en estado "${venta.estado}" — solo se procesan ventas pagadas`,
    });
  }

  const { referencia_ot_id, tipo_concepto, total, created_by_user_id } = venta;
  const now = new Date().toISOString();

  const resultado = {
    sale_id,
    tipo_concepto,
    referencia_ot_id: referencia_ot_id || null,
    ot_event_created: false,
    lifecycle_transition: null,
    diagnostic_unlock: null,
    skipped_reason: null,
  };

  // ── 4. Si NO hay referencia_ot_id → solo trazabilidad mínima ─────────────────
  if (!referencia_ot_id) {
    console.log(`[processPostSaleActions] Venta ${sale_id} sin OT → solo registro.`);
    return Response.json({ success: true, data: { ...resultado, skipped_reason: 'sin_referencia_ot' } });
  }

  // ── 5. Cargar OT y validar ───────────────────────────────────────────────────
  const ordenes = await base44.asServiceRole.entities.OrdenTrabajo.filter({
    id: referencia_ot_id,
    organization_id: orgId,
  }, 1);

  if (!ordenes || ordenes.length === 0) {
    console.warn(`[processPostSaleActions] OT "${referencia_ot_id}" no encontrada. Venta: ${sale_id}`);
    return Response.json({
      success: true,
      data: { ...resultado, skipped_reason: 'ot_no_encontrada' },
    });
  }

  const ot = ordenes[0];
  const estadoActual = ot.estado;
  resultado.ot_estado_actual = estadoActual;

  // Estados irreversibles — no tocar lifecycle
  if (['ENTREGADA', 'CANCELADA'].includes(estadoActual)) {
    console.log(`[processPostSaleActions] OT ${referencia_ot_id} en estado irreversible "${estadoActual}" — no se toca lifecycle.`);
    resultado.skipped_reason = `ot_estado_irreversible_${estadoActual}`;
  }

  // ── 6. Crear OTEvent tipo SALE_COMPLETED (idempotente) ───────────────────────
  const tipoEvento = `SALE_COMPLETED`;
  
  // Idempotencia: verificar si ya existe OTEvent para esta venta específica
  // Filtramos por sale_id para evitar que ventas múltiples de la misma OT dupliquen eventos
  const existingEvents = await base44.asServiceRole.entities.OTEvent.filter({
    organization_id: orgId,
    orden_trabajo_id: referencia_ot_id,
    tipo: tipoEvento,
    sale_id: sale_id,
  }, 1);

  const yaExiste = existingEvents && existingEvents.length > 0;

  if (!yaExiste) {
    try {
      await base44.asServiceRole.entities.OTEvent.create({
        organization_id: orgId,
        orden_trabajo_id: referencia_ot_id,
        tipo: tipoEvento,
        sale_id: sale_id,
        venta_total: total,
        tipo_concepto: tipo_concepto,
        created_by_user_id: created_by_user_id || user.id,
        processed: false,
        created_at: now,
      });
      resultado.ot_event_created = true;
      console.log(`[processPostSaleActions] OTEvent SALE_COMPLETED creado — OT: ${referencia_ot_id}, Venta: ${sale_id}`);
    } catch (eventError) {
      // Trazabilidad no debe romper el flujo
      console.warn(`[processPostSaleActions] OTEvent creation failed (non-critical): ${eventError.message}`);
    }
  } else {
    console.warn(`[processPostSaleActions] OTEvent SALE_COMPLETED ya existe para venta ${sale_id} — idempotencia OK.`);
    resultado.ot_event_created = false;
    resultado.ot_event_idempotent = true;
  }

  // ── 7. Si estado irreversible, salir después de la trazabilidad ───────────────
  if (resultado.skipped_reason) {
    return Response.json({ success: true, data: resultado });
  }

  // ── 8. DESBLOQUEOS OPERACIONALES ─────────────────────────────────────────────
  let estadoDestino = null;
  let skipReason = null;

  if (tipo_concepto === 'revision_diagnostico') {
    // CASO 1: el pago autoriza el trabajo, pero no representa el inicio técnico.
    // Mantener ASIGNADA permite que initTechnicalActivity cree primero la actividad
    // auditable y luego ejecute la transición autoritativa a EN_REVISION.
    const yaHabilitadaPorEstaVenta = ot.diagnostico_habilitado === true
      && ot.revision_venta_id === sale_id;

    if (yaHabilitadaPorEstaVenta) {
      resultado.diagnostic_unlock = {
        success: true,
        idempotent: true,
        sale_id,
      };
    } else if (ot.diagnostico_habilitado === true && ot.revision_venta_id) {
      resultado.diagnostic_unlock = {
        success: true,
        idempotent: true,
        sale_id: ot.revision_venta_id,
        reason: 'diagnostico_ya_habilitado_por_otra_venta',
      };
    } else {
      try {
        await base44.asServiceRole.entities.OrdenTrabajo.update(referencia_ot_id, {
          diagnostico_habilitado: true,
          revision_pagada_at: ot.revision_pagada_at || now,
          revision_venta_id: ot.revision_venta_id || sale_id,
        });
        resultado.diagnostic_unlock = {
          success: true,
          idempotent: false,
          sale_id: ot.revision_venta_id || sale_id,
        };
      } catch (unlockError) {
        console.error(`[processPostSaleActions] No se pudo habilitar diagnóstico — OT: ${referencia_ot_id}, venta: ${sale_id}`, unlockError);
        return Response.json({
          success: false,
          error: 'La venta fue registrada, pero no se pudo habilitar el diagnóstico. Reintente el post-procesamiento con el mismo sale_id.',
          code: 'DIAGNOSTIC_UNLOCK_FAILED',
          data: resultado,
        }, { status: 500 });
      }
    }

    try {
      resultado.workflow_gates_resolved = await resolvePendingGates(base44, {
        orgId,
        subjectId: referencia_ot_id,
        saleId,
        ventaTotal: total,
        userId: created_by_user_id || user.id,
      });
    } catch (gateErr) {
      console.warn(`[processPostSaleActions] WorkflowGate resolution (non-critical): ${gateErr.message}`);
      resultado.workflow_gates_resolved = [];
    }

    skipReason = 'revision_diagnostico: habilitada sin transición de lifecycle';

  } else if (tipo_concepto === 'reparacion') {
    // CASO 2: pago de reparación
    if (estadoActual === 'APROBADA') {
      estadoDestino = 'EN_REPARACION';
    } else if (estadoActual === 'COTIZADA') {
      // COTIZADA → APROBADA → EN_REPARACION
      // Primero mover a APROBADA, luego EN_REPARACION se hará manualmente
      // Para mantener coherencia con el flujo real, solo movemos a APROBADA aquí
      estadoDestino = 'APROBADA';
    } else {
      skipReason = `reparacion: estado "${estadoActual}" no requiere desbloqueo automático`;
    }

  } else if (tipo_concepto === 'saldo_final') {
    // El pago habilita comercialmente. Nunca constituye evidencia de entrega fisica.
    skipReason = 'saldo_final: pago registrado; la entrega requiere deliverWorkOrder';

  } else {
    // CASO 4: venta_producto, otro — no mover lifecycle
    skipReason = `tipo_concepto "${tipo_concepto}" no dispara cambio de lifecycle`;
  }

  resultado.lifecycle_skip_reason = skipReason;

  // ── 9. Ejecutar transición si corresponde ────────────────────────────────────
  if (estadoDestino) {
    // Verificar idempotencia: si OT ya está en estado destino, no volver a mover
    if (estadoActual === estadoDestino) {
      console.log(`[processPostSaleActions] OT ${referencia_ot_id} ya está en "${estadoDestino}" — idempotencia OK.`);
      resultado.lifecycle_transition = { skipped: true, reason: 'ya_en_estado_destino', estado: estadoDestino };
    } else {
      try {
        // Llamar a transitionWorkOrderStatus como service role
        // Nota: transitionWorkOrderStatus valida roles desde UserAccount.
        // Como processPostSaleActions es llamado desde createSale (con user autenticado),
        // invocamos la función con el mismo contexto de usuario (base44.functions.invoke)
        // para que transitionWorkOrderStatus pueda resolver el rol correctamente.
        const transitionResult = await base44.functions.invoke('transitionWorkOrderStatus', {
          orden_trabajo_id: referencia_ot_id,
          newStatus: estadoDestino,
          observacion: `Desbloqueo automático post-venta — tipo: ${tipo_concepto}, venta: ${sale_id}`,
        });

        resultado.lifecycle_transition = {
          success: true,
          previous_status: estadoActual,
          new_status: estadoDestino,
          result: transitionResult?.data,
        };

        console.log(`[processPostSaleActions] Lifecycle OK — OT: ${referencia_ot_id}, ${estadoActual} → ${estadoDestino}`);

      } catch (transitionError) {
        // Fallos de lifecycle NO deben romper el resultado de la venta
        console.warn(`[processPostSaleActions] Lifecycle transition failed (non-critical): ${transitionError.message}`);
        resultado.lifecycle_transition = {
          success: false,
          error: transitionError.message,
          previous_status: estadoActual,
          target_status: estadoDestino,
        };
      }
    }
  } else {
    resultado.lifecycle_transition = { skipped: true, reason: skipReason };
  }

  console.log(`[processPostSaleActions] Completado — sale: ${sale_id}, OT: ${referencia_ot_id}, concepto: ${tipo_concepto}`);

  return Response.json({ success: true, data: resultado });
});
