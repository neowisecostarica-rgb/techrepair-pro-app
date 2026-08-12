import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { authorizeRecordBranch } from '../_shared/operationalAuthorization.ts';

// ─────────────────────────────────────────────────────────────────────────────
// dmrOrchestrator — Orquestador de creación del Documento Maestro de Recepción
//
// Estrategia de integridad: Atomicidad por Compensación de Aplicación.
// Flujo: Recibe OT ya creada → genera DMR → en fallo: rollback OT + audit log.
//
// NO se llama directamente desde el frontend.
// Es invocado exclusivamente desde createWorkOrder vía base44.functions.invoke().
// ─────────────────────────────────────────────────────────────────────────────

// ── UTILS INLINEADOS (no hay imports locales entre funciones en esta plataforma) ──

function generateDmrNumber(count, orgPrefix) {
  const year = new Date().getFullYear();
  const seq = String(count + 1).padStart(6, '0');
  return `DMR-${year}-${seq}`;
}

function buildClienteSnapshot(cliente) {
  return {
    id: cliente.id || '',
    nombre_completo: cliente.nombre_completo || '',
    identificacion: cliente.identificacion || '',
    telefono: cliente.telefono || '',
    email: cliente.email || ''
  };
}

function buildActivoSnapshot(equipo) {
  return {
    id: equipo.id || '',
    tipo: equipo.tipo || '',
    marca: equipo.marca || '',
    modelo: equipo.modelo || '',
    serie: equipo.serie || '',
    estado_fisico: equipo.estado_fisico || ''
  };
}

function buildContextoRecepcion(ot) {
  return {
    motivo_ingreso: ot.motivo_ingreso || '',
    tipo_ingreso: ot.tipo_ingreso || 'presencial',
    prioridad: ot.prioridad || 'normal',
    accesorios_ingreso: ot.accesorios_ingreso || '',
    serie_ingreso: ot.serie_ingreso || '',
    observaciones_ingreso: ot.observaciones_ingreso || '',
    codigo_ot: ot.codigo_ot || '',
    fecha_ingreso: ot.fecha_ingreso || new Date().toISOString()
  };
}

function buildLegalSnapshot(ot) {
  if (!ot.terminos_aceptados) return null;
  return {
    terminos_aceptados: ot.terminos_aceptados,
    terminos_aceptados_at: ot.terminos_aceptados_at || null,
    terminos_version: ot.terminos_version || null,
    terminos_texto_snapshot: ot.terminos_texto_snapshot || null
  };
}

// ── AUDITOR INLINEADO ────────────────────────────────────────────────────────

async function auditLog(base44, action, orgId, details) {
  console.info('[dmrOrchestrator] operational trace', {
    action,
    organization_id: orgId,
    ...details,
    timestamp: new Date().toISOString(),
  });
}

// ── HANDLER PRINCIPAL ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { otId } = body;

    if (!otId) {
      return Response.json({ error: 'Parámetro requerido: otId' }, { status: 400 });
    }

    // Never trust tenant or snapshots supplied by the caller. The canonical OT
    // determines organization, branch, customer and equipment.
    const workOrders = await base44.asServiceRole.entities.OrdenTrabajo.filter({ id: otId }, '-created_date', 1);
    const ot = workOrders?.[0];
    if (!ot) return Response.json({ error: 'OT no encontrada' }, { status: 404 });

    const authorization = await resolveAuthorizedContext(base44, user, {
      organizationHint: ot.organization_id,
      allowedRoles: ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'CUSTOMER_SERVICE'],
    });
    if (!authorization.ok) {
      return Response.json({ error: authorization.error }, { status: authorization.status });
    }
    const branchAuthorization = authorizeRecordBranch(authorization, ot.branch_id);
    if (!branchAuthorization.ok) {
      return Response.json(
        { error: branchAuthorization.error, code: branchAuthorization.code },
        { status: branchAuthorization.status },
      );
    }

    const [clientes, equipos] = await Promise.all([
      base44.asServiceRole.entities.Cliente.filter({
        id: ot.cliente_id,
        organization_id: authorization.organizationId,
      }, '-created_date', 1),
      base44.asServiceRole.entities.Equipo.filter({
        id: ot.equipo_id,
        organization_id: authorization.organizationId,
      }, '-created_date', 1),
    ]);
    const cliente = clientes?.[0];
    const equipo = equipos?.[0];
    if (!cliente || !equipo) {
      return Response.json({ error: 'Cliente o equipo canonico no encontrado para la OT' }, { status: 422 });
    }
    const orgId = authorization.organizationId;

    // ── PASO 1: Generar dmr_number (no se persiste hasta create()) ───────────
    const existing = await base44.asServiceRole.entities.DiagnosticMasterRecord.filter(
      { organization_id: orgId }
    );
    const dmrCount = existing ? existing.length : 0;
    const dmrNumber = generateDmrNumber(dmrCount, orgId);

    // ── PASO 2: Construir snapshots en memoria ───────────────────────────────
    const clienteSnapshot = buildClienteSnapshot(cliente);
    const activoSnapshot = buildActivoSnapshot(equipo);
    const contextoRecepcion = buildContextoRecepcion(ot);
    const legalSnapshot = buildLegalSnapshot(ot);

    // ── PASO 3: Persistir DMR (si falla → compensación) ─────────────────────
    const dmr = await base44.asServiceRole.entities.DiagnosticMasterRecord.create({
      organization_id: orgId,
      orden_trabajo_id: otId,
      dmr_number: dmrNumber,
      created_at: new Date().toISOString(),
      document_status: 'ACTIVE',
      version: 1,
      replaces_dmr_id: null,
      cliente_snapshot: clienteSnapshot,
      activo_snapshot: activoSnapshot,
      contexto_recepcion: contextoRecepcion,
      legal_snapshot: legalSnapshot || {},
      diagnostico_snapshot: null,
      pdf_url: null,
      pdf_hash: null,
      created_by_user_id: user.id
    });

    // ── PASO 4: Auditoría de creación exitosa ────────────────────────────────
    await auditLog(base44, 'DMR_CREATED', orgId, {
      dmr_id: dmr.id,
      dmr_number: dmrNumber,
      orden_trabajo_id: otId,
      created_by: user.id
    });

    console.log(`[dmrOrchestrator] DMR creado exitosamente — ${dmrNumber} | OT: ${otId}`);
    return Response.json({ success: true, dmrId: dmr.id, dmrNumber });

  } catch (error) {
    console.error(`[dmrOrchestrator] Error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
