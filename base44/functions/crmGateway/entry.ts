import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import {
  isCanonicalActiveUserAccount,
  resolveAuthorizedContext,
} from '../_shared/userAuthorization.ts';
import { getCanonicalBranchScope } from '../_shared/operationalAuthorization.ts';
import { assertActiveBranch, BranchProtectionError } from '../_shared/branchProtection.ts';

const ALLOWED_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'];
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const LEAD_SOURCES = ['website', 'referral', 'social_media', 'phone', 'walk_in', 'other'];

function clean(value, maxLength = 1000) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function jsonError(error, status, code = undefined) {
  return Response.json({ error, ...(code ? { code } : {}) }, { status });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return jsonError('No autenticado', 401);

    const body = await req.json().catch(() => ({}));
    const authorization = await resolveAuthorizedContext(base44, user, {
      organizationHint: body.organization_id || null,
      allowedRoles: ALLOWED_ROLES,
    });
    if (!authorization.ok) return jsonError(authorization.error, authorization.status);

    const organizationId = authorization.organizationId;
    const role = authorization.role;
    const branchScope = getCanonicalBranchScope(authorization);
    if (!branchScope.ok) return jsonError(branchScope.error, branchScope.status);
    const branchFilter = branchScope.organizationWide ? {} : { branch_id: branchScope.branchId };
    const action = body.action || 'list';

    if (action !== 'list' && branchScope.branchId) {
      try {
        await assertActiveBranch(base44, organizationId, branchScope.branchId, {
          code: 'CRM_BRANCH_INACTIVE',
          status: 409,
          message: 'La sucursal esta inactiva y no admite nuevas operaciones CRM.',
        });
      } catch (error) {
        if (error instanceof BranchProtectionError) return jsonError(error.message, error.status, error.code);
        throw error;
      }
    }

    if (action === 'list') {
      const [leads, accounts] = await Promise.all([
        base44.asServiceRole.entities.Lead.filter({ organization_id: organizationId, ...branchFilter }, '-created_date', 500),
        role === 'ORG_ADMIN'
          ? base44.asServiceRole.entities.UserAccount.filter({ organization_id: organizationId, role: 'SALES' }, 200)
          : Promise.resolve([]),
      ]);

      const salesUsers = (accounts || [])
        .filter(isCanonicalActiveUserAccount)
        .map(account => ({
          id: account.id,
          user_id: account.user_id,
          user_email: account.user_email,
        }));

      return Response.json({ leads: leads || [], salesUsers });
    }

    if (action === 'create') {
      const input = body.lead || {};
      const name = clean(input.name, 160);
      const phone = clean(input.phone, 40);
      const email = clean(input.email, 254);
      const source = LEAD_SOURCES.includes(input.source) ? input.source : 'other';
      if (!name || !phone) return jsonError('Nombre y telefono son obligatorios', 400);

      const lead = await base44.asServiceRole.entities.Lead.create({
        organization_id: organizationId,
        ...branchFilter,
        name,
        phone,
        email: email || undefined,
        source,
        notes: clean(input.notes, 4000) || undefined,
        status: 'new',
      });
      return Response.json({ lead }, { status: 201 });
    }

    const leadId = clean(body.lead_id, 120);
    if (!leadId) return jsonError('lead_id es obligatorio', 400);
    const found = await base44.asServiceRole.entities.Lead.filter({
      id: leadId,
      organization_id: organizationId,
      ...branchFilter,
    });
    const lead = found?.[0];
    if (!lead) return jsonError('Lead no encontrado', 404);

    if (action === 'update') {
      const input = body.changes || {};
      const nextStatus = input.status || lead.status;
      if (!LEAD_STATUSES.includes(nextStatus)) return jsonError('Estado de lead invalido', 400);
      if (nextStatus === 'won' && !lead.converted_to_cliente_id) {
        return jsonError('Convierte el lead a cliente para marcarlo como ganado', 409);
      }

      let assignedTo = input.assigned_to === undefined
        ? lead.assigned_to
        : (clean(input.assigned_to, 120) || null);
      let assignedToName = lead.assigned_to_name || null;

      if (input.assigned_to !== undefined) {
        if (role !== 'ORG_ADMIN' && assignedTo !== lead.assigned_to) {
          return jsonError('Solo ORG_ADMIN puede reasignar leads', 403);
        }
        if (assignedTo) {
          const destinations = await base44.asServiceRole.entities.UserAccount.filter({
            user_id: assignedTo,
            organization_id: organizationId,
            role: 'SALES',
          });
          const destination = (destinations || []).find(isCanonicalActiveUserAccount);
          if (!destination) return jsonError('El usuario SALES seleccionado no esta activo en esta organizacion', 400);
          assignedToName = destination.user_email;
        } else {
          assignedToName = null;
        }
      }

      const updated = await base44.asServiceRole.entities.Lead.update(lead.id, {
        status: nextStatus,
        assigned_to: assignedTo,
        assigned_to_name: assignedToName,
        notes: input.notes === undefined ? lead.notes : (clean(input.notes, 4000) || null),
        lost_reason: nextStatus === 'lost' ? (clean(input.lost_reason, 2000) || null) : null,
      });
      return Response.json({ lead: updated });
    }

    if (action === 'convert') {
      if (lead.converted_to_cliente_id) {
        const existing = await base44.asServiceRole.entities.Cliente.filter({
          id: lead.converted_to_cliente_id,
          organization_id: organizationId,
        });
        return Response.json({ lead, cliente: existing?.[0] || null, idempotent: true });
      }

      const identificacion = clean(body.identificacion, 120);
      if (!identificacion) return jsonError('La identificacion es obligatoria', 400);
      const duplicates = await base44.asServiceRole.entities.Cliente.filter({
        organization_id: organizationId,
        identificacion,
      });
      if (duplicates.length > 0) return jsonError('Ya existe un cliente con esta identificacion', 409);

      const cliente = await base44.asServiceRole.entities.Cliente.create({
        organization_id: organizationId,
        ...branchFilter,
        nombre_completo: clean(lead.name, 160),
        identificacion,
        tipo_cliente: 'individual',
        email: clean(lead.email, 254) || undefined,
        telefono: clean(lead.phone, 40),
        notas: `Convertido desde Lead. ${clean(lead.notes, 3500)}`.trim(),
      });

      try {
        const updatedLead = await base44.asServiceRole.entities.Lead.update(lead.id, {
          status: 'won',
          converted_to_cliente_id: cliente.id,
          converted_at: new Date().toISOString(),
        });
        return Response.json({ lead: updatedLead, cliente });
      } catch (updateError) {
        const reconciled = await base44.asServiceRole.entities.Lead.filter({
          id: lead.id,
          organization_id: organizationId,
        });
        if (reconciled?.[0]?.converted_to_cliente_id === cliente.id) {
          return Response.json({ lead: reconciled[0], cliente, reconciled: true });
        }
        await base44.asServiceRole.entities.Cliente.delete(cliente.id).catch(() => {});
        throw updateError;
      }
    }

    return jsonError(`Accion CRM desconocida: ${action}`, 400);
  } catch (error) {
    console.error('[crmGateway]', error?.message || error);
    return jsonError('No se pudo completar la operacion CRM', 500);
  }
});
