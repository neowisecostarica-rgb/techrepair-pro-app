/**
 * ═══════════════════════════════════════════════════════════════════════════
 * updateCustodiaData — P1-A.3-I2
 * ═══════════════════════════════════════════════════════════════════════════
 * Persistencia operativa de custodia sobre OrdenTrabajo.
 * SOT: OrdenTrabajo (sin nuevas entidades).
 * Auditoría: OTEvent (tipos CUSTODIA_*).
 * NO modifica workflow principal. NO llama transitionWorkOrderStatus.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Acciones soportadas:
 *   REGISTRAR_CONTACTO  → fecha_ultimo_contacto, abandono_observaciones
 *   DECLARAR_ABANDONO   → estado_custodia=ABANDONO_DECLARADO, fecha_abandono, abandono_observaciones
 *   MARCAR_DISPOSICION  → estado_custodia=DISPOSICION_FINAL, abandono_observaciones
 *
 * Guardrails:
 *   - OT.estado debe ser FINALIZADA
 *   - ENTREGADA y CANCELADA rechazadas
 *   - MARCAR_DISPOSICION requiere estado_custodia === ABANDONO_DECLARADO
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const VALID_ACTIONS = ['REGISTRAR_CONTACTO', 'DECLARAR_ABANDONO', 'MARCAR_DISPOSICION'];

const ACTION_TO_EVENT = {
  REGISTRAR_CONTACTO: 'CUSTODIA_CONTACTO',
  DECLARAR_ABANDONO:  'CUSTODIA_ABANDONO',
  MARCAR_DISPOSICION: 'CUSTODIA_DISPOSICION',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Autenticación ──────────────────────────────────────────────────────
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { orden_trabajo_id, action, observaciones } = body;

    // ── Validación de payload ──────────────────────────────────────────────
    if (!orden_trabajo_id) {
      return Response.json({ error: 'orden_trabajo_id requerido' }, { status: 400 });
    }
    if (!VALID_ACTIONS.includes(action)) {
      return Response.json({
        error: `Acción inválida. Acciones válidas: ${VALID_ACTIONS.join(', ')}`,
      }, { status: 400 });
    }

    // ── Leer OT actual ─────────────────────────────────────────────────────
    const ots = await base44.asServiceRole.entities.OrdenTrabajo.filter({ id: orden_trabajo_id });
    const ot = ots[0];

    if (!ot) {
      return Response.json({ error: 'OT no encontrada' }, { status: 404 });
    }

    // ── Guardrail: solo FINALIZADA ─────────────────────────────────────────
    if (ot.estado !== 'FINALIZADA') {
      return Response.json({
        error: `Acciones de custodia solo permitidas en estado FINALIZADA. Estado actual: ${ot.estado}`,
      }, { status: 422 });
    }

    // ── Guardrail: DISPOSICION_FINAL requiere ABANDONO_DECLARADO previo ────
    if (action === 'MARCAR_DISPOSICION' && ot.estado_custodia !== 'ABANDONO_DECLARADO') {
      return Response.json({
        error: `MARCAR_DISPOSICION requiere que el equipo esté en ABANDONO_DECLARADO. Estado actual: ${ot.estado_custodia || 'NORMAL'}`,
      }, { status: 422 });
    }

    // ── Construir payload de actualización por acción ──────────────────────
    const now = new Date().toISOString();
    let updatePayload = {};

    if (action === 'REGISTRAR_CONTACTO') {
      updatePayload = {
        fecha_ultimo_contacto: now,
        ...(observaciones ? { abandono_observaciones: observaciones } : {}),
      };
    } else if (action === 'DECLARAR_ABANDONO') {
      updatePayload = {
        estado_custodia: 'ABANDONO_DECLARADO',
        fecha_abandono: now,
        ...(observaciones ? { abandono_observaciones: observaciones } : {}),
      };
    } else if (action === 'MARCAR_DISPOSICION') {
      updatePayload = {
        estado_custodia: 'DISPOSICION_FINAL',
        ...(observaciones ? { abandono_observaciones: observaciones } : {}),
      };
    }

    // ── Actualizar OrdenTrabajo ────────────────────────────────────────────
    await base44.asServiceRole.entities.OrdenTrabajo.update(orden_trabajo_id, updatePayload);

    // ── Registrar evento de auditoría en OTEvent ───────────────────────────
    const eventTipo = ACTION_TO_EVENT[action];
    await base44.asServiceRole.entities.OTEvent.create({
      organization_id: ot.organization_id,
      orden_trabajo_id,
      tipo: eventTipo,
      created_by_user_id: user.id,
      created_at: now,
      ...(observaciones ? { detalle: observaciones } : {}),
    });

    return Response.json({
      success: true,
      action,
      event_tipo: eventTipo,
      orden_trabajo_id,
      updated_at: now,
    });

  } catch (error) {
    return Response.json({ error: String(error.message || error) }, { status: 500 });
  }
});