/**
 * SFHS — Semantic File Header System
 * ============================================================
 * ARCHIVO:       functions/reassignWorkOrderTechnician.js
 * PROPÓSITO:     Reasignar el técnico responsable de una OrdenTrabajo.
 * ESTADO:        ACTIVE CORE — INSTRUMENTADO TEMPORALMENTE (DIAG BLOQUE 1.3)
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
    console.log(`[DIAG:reassign] ===== INICIO FUNCIÓN =====`);
    console.log(`[DIAG:reassign] user completo:`, JSON.stringify(user, null, 2));
    console.log(`[DIAG:reassign] user.id:`, user?.id);
    console.log(`[DIAG:reassign] user.email:`, user?.email);
    console.log(`[DIAG:reassign] user.role (base44):`, user?.role);
    console.log(`[DIAG:reassign] user.organization_id:`, user?.organization_id);
    console.log(`[DIAG:reassign] user.impersonating_org_id:`, user?.impersonating_org_id);
    console.log(`[DIAG:reassign] user.data:`, JSON.stringify(user?.data, null, 2));

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Resolver organization_id defensivamente
    let orgId = user.impersonating_org_id || user.organization_id;
    console.log(`[DIAG:reassign] orgId inicial (impersonating||organization_id):`, orgId);

    // 3. Resolver UserAccount REAL para obtener rol operacional y org si falta
    const userAccounts = await base44.asServiceRole.entities.UserAccount.filter({
      user_id: user.id,
    }, 5);
    console.log(`[DIAG:reassign] UserAccount.filter({ user_id: '${user?.id}' }) → count:`, userAccounts?.length);
    console.log(`[DIAG:reassign] UserAccount resultado completo:`, JSON.stringify(userAccounts, null, 2));

    let userAccount = null;
    if (userAccounts && userAccounts.length > 0) {
      if (orgId) {
        userAccount = userAccounts.find(a => a.organization_id === orgId) || userAccounts[0];
      } else {
        userAccount = userAccounts[0];
        orgId = userAccount.organization_id;
      }
    }
    console.log(`[DIAG:reassign] userAccount seleccionado:`, JSON.stringify(userAccount, null, 2));
    console.log(`[DIAG:reassign] orgId final resuelto:`, orgId);

    if (!orgId) {
      console.error(`[DIAG:reassign] *** 403: orgId no resuelto ***`);
      return Response.json({ error: 'organization_id no resuelto' }, { status: 403 });
    }

    if (!userAccount) {
      console.error(`[DIAG:reassign] *** 403: UserAccount no encontrado ***`);
      return Response.json({ error: 'UserAccount no encontrado para este usuario' }, { status: 403 });
    }

    // 4. Enforcement de roles usando UserAccount.role REAL
    const userRole = userAccount.role;
    console.log(`[DIAG:reassign] userRole (de UserAccount):`, userRole);
    console.log(`[DIAG:reassign] ROLES_AUTORIZADOS:`, ROLES_AUTORIZADOS);
    console.log(`[DIAG:reassign] ¿rol autorizado?:`, ROLES_AUTORIZADOS.includes(userRole));

    if (!ROLES_AUTORIZADOS.includes(userRole)) {
      console.error(`[DIAG:reassign] *** 403: rol no autorizado — rol=${userRole} ***`);
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

    const ot = ordenes[0];
    const estadoActual = ot.estado;

    // 7. Update — tecnico_asignado_id (y email opcional)
    const updatePayload = { tecnico_asignado_id };
    if (tecnico_asignado_email) {
      updatePayload.tecnico_asignado_email = tecnico_asignado_email;
    }

    console.log(`[DIAG:reassign] *** ANTES de OrdenTrabajo.update — payload:`, JSON.stringify(updatePayload));
    const updatedOT = await base44.asServiceRole.entities.OrdenTrabajo.update(
      orden_trabajo_id,
      updatePayload
    );
    console.log(`[DIAG:reassign] *** DESPUÉS de OrdenTrabajo.update — resultado:`, JSON.stringify(updatedOT, null, 2));

    console.log(`[reassignWorkOrderTechnician] OT ${orden_trabajo_id} reasignada a técnico ${tecnico_asignado_id} por ${user.email} (${userRole}). Estado actual: ${estadoActual}`);

    // 8. Semántica de asignación: EN_COLA_REVISION → ASIGNADA
    let transitionResult = null;
    if (estadoActual === 'EN_COLA_REVISION') {
      console.log(`[reassignWorkOrderTechnician] Estado EN_COLA_REVISION detectado — invocando transitionWorkOrderStatus → ASIGNADA`);
      console.log(`[DIAG:reassign] *** ANTES de invoke('transitionWorkOrderStatus') — payload:`, JSON.stringify({
        orden_trabajo_id, newStatus: 'ASIGNADA', tecnico_asignado_id, tecnico_asignado_email: tecnico_asignado_email || null
      }));
      console.log(`[DIAG:reassign] CONTEXTO: asServiceRole.functions.invoke — NO lleva user token del llamante original`);

      // Construir contexto del usuario original para propagarlo a transitionWorkOrderStatus.
      // _callingUserContext es construido exclusivamente aquí en backend a partir de fuentes verificadas.
      const callingUserContext = {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        organization_id: orgId,
        role: userRole,
        is_super_admin: user.is_super_admin === true || user.data?.is_super_admin === true,
      };
      console.log(`[DIAG:reassign] _callingUserContext construido:`, JSON.stringify(callingUserContext, null, 2));

      transitionResult = await base44.asServiceRole.functions.invoke('transitionWorkOrderStatus', {
        orden_trabajo_id,
        newStatus: 'ASIGNADA',
        tecnico_asignado_id,
        tecnico_asignado_email: tecnico_asignado_email || null,
        observacion: `Técnico asignado y OT movida a ASIGNADA por ${user.email}`,
        _callingUserContext: callingUserContext,
      });

      // NOTA: transitionResult es un objeto Axios con referencias circulares — NO usar JSON.stringify sobre él directamente.
      // Validar que la transición fue exitosa
      const transitionData = transitionResult?.data ?? transitionResult;
      if (!transitionData?.success) {
        const errorMsg = transitionData?.error || 'transitionWorkOrderStatus no retornó success=true';
        console.error(`[reassignWorkOrderTechnician] Transición ASIGNADA FALLÓ — OT: ${orden_trabajo_id} — Error: ${errorMsg}`);
        console.error(`[DIAG:reassign] *** TRANSICIÓN FALLIDA — transitionData completo:`, JSON.stringify(transitionData, null, 2));
        return Response.json({
          success: false,
          error: `Técnico actualizado pero la transición de estado falló: ${errorMsg}`,
          code: 'TRANSITION_FAILED',
          orden_trabajo_id,
          tecnico_asignado_id,
          estado_anterior: estadoActual,
          updated_ot: updatedOT,
          transition_error: errorMsg,
        }, { status: 422 });
      }

      console.log(`[reassignWorkOrderTechnician] Transición ASIGNADA completada — OT: ${orden_trabajo_id}`);
    } else {
      console.log(`[reassignWorkOrderTechnician] Estado ${estadoActual} — solo se actualiza técnico, lifecycle intacto`);
    }

    return Response.json({
      success: true,
      orden_trabajo_id,
      tecnico_asignado_id,
      estado_anterior: estadoActual,
      estado_actual: estadoActual === 'EN_COLA_REVISION' ? 'ASIGNADA' : estadoActual,
      lifecycle_transitioned: estadoActual === 'EN_COLA_REVISION',
      updated_ot: updatedOT,
      transition_result: transitionResult,
    });

  } catch (error) {
    console.error(`[reassignWorkOrderTechnician] Error: ${error.message}`);
    console.error(`[DIAG:reassign] *** CATCH — error.name:`, error.name);
    console.error(`[DIAG:reassign] *** CATCH — error.message:`, error.message);
    console.error(`[DIAG:reassign] *** CATCH — error.stack:`, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});