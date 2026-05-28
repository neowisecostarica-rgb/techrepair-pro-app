/**
 * SFHS — Semantic File Header System
 * ============================================================
 * ARCHIVO:       functions/reassignWorkOrderTechnician.js
 * PROPÓSITO:     Reasignar el técnico responsable de una OrdenTrabajo.
 *                Aplica control de acceso por rol antes de ejecutar
 *                cualquier modificación.
 *
 * RESPONSABILIDADES:
 *   - Autenticar al usuario llamante
 *   - Verificar que el rol del usuario esté autorizado para reasignar
 *   - Validar ownership de la OT dentro de la organización
 *   - Actualizar SOLO tecnico_asignado_id (y email opcional)
 *
 * LÍMITES:
 *   - NO actualiza estado, lifecycle, OTEvent, ni analytics
 *   - NO invoca transitionWorkOrderStatus
 *   - NO modifica ultima_actividad ni timestamps de lifecycle
 *
 * DEPENDENCIAS CRÍTICAS:
 *   - base44.auth.me() — fuente de verdad de identidad y rol
 *   - base44.asServiceRole.entities.OrdenTrabajo — acceso a datos
 *   - UserAccount.role — campo de rol leído desde user.role
 *
 * ESTADO:        ACTIVE CORE
 *
 * RIESGOS CONOCIDOS:
 *   - Si user.role no está sincronizado correctamente con UserAccount,
 *     el enforcement puede fallar silenciosamente.
 *     Mitigación: la validación bloquea roles no listados explícitamente.
 *
 * OWNER CONCEPTUAL: Operaciones / Branch Admin
 * ============================================================
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Roles autorizados para reasignar técnicos
const ROLES_AUTORIZADOS = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'admin'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Auth
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Enforcement de roles — SOLO roles autorizados pueden reasignar
    const userRole = user.role;
    if (!ROLES_AUTORIZADOS.includes(userRole)) {
      console.warn(`[reassignWorkOrderTechnician] Acceso denegado — rol: ${userRole}, user: ${user.email}`);
      return Response.json(
        { error: 'No autorizado para reasignar técnicos' },
        { status: 403 }
      );
    }

    const orgId = user.organization_id || user.impersonating_org_id;
    if (!orgId) {
      return Response.json({ error: 'organization_id no resuelto' }, { status: 403 });
    }

    // 3. Payload
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Body inválido' }, { status: 400 });
    }

    const { orden_trabajo_id, tecnico_asignado_id, tecnico_asignado_email } = body;

    if (!orden_trabajo_id || !tecnico_asignado_id) {
      return Response.json(
        { error: 'orden_trabajo_id y tecnico_asignado_id son obligatorios' },
        { status: 400 }
      );
    }

    // 4. Validar ownership de la OT dentro de la organización
    const ordenes = await base44.asServiceRole.entities.OrdenTrabajo.filter({
      id: orden_trabajo_id,
      organization_id: orgId,
    }, 1);

    if (!ordenes || ordenes.length === 0) {
      return Response.json(
        { error: 'OrdenTrabajo no encontrada en esta organización' },
        { status: 404 }
      );
    }

    // 5. Update MÍNIMO — solo tecnico_asignado_id
    const updatePayload = { tecnico_asignado_id };
    if (tecnico_asignado_email) {
      updatePayload.tecnico_asignado_email = tecnico_asignado_email;
    }

    const updatedOT = await base44.asServiceRole.entities.OrdenTrabajo.update(
      orden_trabajo_id,
      updatePayload
    );

    console.log(`[reassignWorkOrderTechnician] OT ${orden_trabajo_id} reasignada por ${user.email} (${userRole})`);

    return Response.json({
      success: true,
      orden_trabajo_id,
      tecnico_asignado_id,
      updated_ot: updatedOT,
    });

  } catch (error) {
    console.error(`[reassignWorkOrderTechnician] Error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});