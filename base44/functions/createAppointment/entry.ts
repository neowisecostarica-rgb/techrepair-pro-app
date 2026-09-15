import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from './_shared/userAuthorization.ts';
import { resolveAuthorizedBranch } from './_shared/operationalAuthorization.ts';
import { projectOperationalReadResult } from './_shared/dataProjections.ts';

function horaAMinutos(hora) {
  if (!hora) return 0;
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const authorization = await resolveAuthorizedContext(base44, user, {
      allowedRoles: ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'SALES'],
    });
    if (!authorization.ok) {
      return Response.json({ error: authorization.error }, { status: authorization.status });
    }

    const body = await req.json();
    const { action = 'create', cita_id = null, ...citaData } = body;

    const branchAuth = await resolveAuthorizedBranch(base44, authorization, citaData.branch_id, {
      allowSingleBranchFallback: true,
      required: false,
    });
    if (!branchAuth.ok) {
      return Response.json({ error: branchAuth.error, code: branchAuth.code }, { status: branchAuth.status });
    }

    const orgId = authorization.organizationId;
    const tecnicoId = citaData.tecnico_asignado_id;
    const fecha = citaData.fecha;
    const horaInicio = citaData.hora_inicio;
    const horaFin = citaData.hora_fin;

    if (!tecnicoId || !fecha || !horaInicio || !horaFin) {
      return Response.json({ error: 'tecnico_asignado_id, fecha, hora_inicio y hora_fin son obligatorios' }, { status: 400 });
    }

    const minutosInicio = horaAMinutos(horaInicio);
    const minutosFin = horaAMinutos(horaFin);
    if (minutosFin <= minutosInicio) {
      return Response.json({ error: 'La hora de fin debe ser posterior a la hora de inicio' }, { status: 400 });
    }

    // P1-06: Atomic overlap check — query existing appointments for this technician/date
    const citasExistentes = await base44.asServiceRole.entities.Cita.filter({
      organization_id: orgId,
      tecnico_asignado_id: tecnicoId,
      fecha: fecha,
    });

    const citasActivas = (citasExistentes || []).filter(c =>
      c.estado !== 'cancelada' &&
      c.estado !== 'no_asistio' &&
      (action !== 'update' || c.id !== cita_id)
    );

    for (const cita of citasActivas) {
      const citaInicio = horaAMinutos(cita.hora_inicio);
      const citaFin = horaAMinutos(cita.hora_fin || cita.hora_inicio);

      const haySolapamiento =
        (minutosInicio >= citaInicio && minutosInicio < citaFin) ||
        (minutosFin > citaInicio && minutosFin <= citaFin) ||
        (minutosInicio <= citaInicio && minutosFin >= citaFin);

      if (haySolapamiento) {
        return Response.json({
          error: `El tecnico ya tiene un evento en ese horario (${cita.hora_inicio} - ${cita.hora_fin || 'sin fin'})`,
          code: 'APPOINTMENT_OVERLAP',
        }, { status: 409 });
      }
    }

    const payload = {
      ...citaData,
      organization_id: orgId,
      ...(branchAuth.branchId ? { branch_id: branchAuth.branchId } : {}),
    };

    if (action === 'update' && cita_id) {
      const updated = await base44.asServiceRole.entities.Cita.update(cita_id, payload);
      return Response.json(projectOperationalReadResult('Cita', updated, authorization));
    }

    const cita = await base44.asServiceRole.entities.Cita.create(payload);
    return Response.json(projectOperationalReadResult('Cita', cita, authorization));
  } catch (error) {
    console.error('[createAppointment]', error?.message || error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});