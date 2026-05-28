/**
 * SFHS — Semantic File Header System
 * ============================================================
 * ARCHIVO:       functions/reassignWorkOrderTechnician.js
 * PROPÓSITO:     Reasignar el técnico responsable de una OrdenTrabajo.
 *                Aplica control de acceso por rol REAL desde UserAccount
 *                antes de ejecutar cualquier modificación.
 *
 * RESPONSABILIDADES:
 *   - Autenticar al usuario llamante
 *   - Resolver rol REAL desde UserAccount (no user.role built-in)
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
 *   - base44.auth.me() — fuente de verdad de identidad
 *   - UserAccount.role — fuente de verdad del rol operacional
 *   - base44.asServiceRole.entities.OrdenTrabajo — acceso a datos
 *
 * ESTADO:        ACTIVE CORE
 *
 * RIESGOS CONOCIDOS:
 *   - Si UserAccount no existe para el user, la función retorna 403.
 *     Esto es comportamiento correcto: sin UserAccount no hay contexto operacional.
 *
 * OWNER CONCEPTUAL: Operaciones / Branch Admin
 * ============================================================
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Roles operacionales autorizados para reasignar técnicos
const ROLES_AUTORIZADOS = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Auth — identidad del llamante
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Resolver organization_id defensivamente
    // Prioridad: impersonating > user.organization_id > buscar en UserAccount
    let orgId = user.impersonating_org_id || user.organization_id;

    // 3. Resolver UserAccount REAL para obtener rol operacional y org si falta
    const userAccounts = await base44.asServiceRole.entities.UserAccount.filter({
      user_id: user.id,
    }, 5);

    let userAccount = null;
    if (userAccounts && userAccounts.length > 0) {
      // Si hay impersonation o organization_id ya resuelto, buscar el account correcto
      if (orgId) {
        userAccount = userAccounts.find(a => a.organization_id === orgId) || userAccounts[0];
      } else {
        userAccount = userAccounts[0];
        orgId = userAccount.organization_id;
      }
    }

    if (!orgId) {
      return Response.json({ error: 'organization_id no resuelto' }, { status: 403 });
    }

    if (!userAccount) {
      return Response.json({ error: 'UserAccount no encontrado para este usuario' }, { status: 403 });
    }

    // 4. Enforcement de roles usando UserAccount.role REAL
    const userRole = userAccount.role;
    if (!ROLES_AUTORIZADOS.includes(userRole)) {
      console.warn(`[reassignWorkOrderTechnician] Acceso denegado — rol: ${userRole}, user: ${user.email}`);
      return Response.json(
        { error: 'No autorizado para reasignar técnicos' },
        { status: 403 }
      );
    }

    // 5. Payload
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

    // 6. Validar ownership de la OT dentro de la organización
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

    // 7. Update MÍNIMO — solo tecnico_asignado_id
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