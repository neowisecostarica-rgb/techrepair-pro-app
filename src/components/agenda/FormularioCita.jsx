import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { listIdentityAccounts } from '@/api/identity';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { validarSolapamiento } from '../calendario/validarSolapamiento';

const TIPOS_CON_OT = ['diagnostico', 'reparacion', 'entrega'];
const TIPOS_SIN_OT = ['soporte_remoto', 'soporte_sitio', 'consulta', 'reunion_interna', 'bloqueo_personal'];

const TIPO_LABELS = {
  diagnostico: 'Diagnóstico',
  reparacion: 'Reparación',
  entrega: 'Entrega',
  soporte_remoto: 'Soporte Remoto',
  soporte_sitio: 'Soporte en Sitio',
  consulta: 'Consulta',
  reunion_interna: 'Reunión Interna',
  bloqueo_personal: 'Bloqueo Personal'
};

export default function FormularioCita({
  cita = null,
  effectiveRole,
  effectiveOrgId,
  userId,
  userEmail,
  onSubmit,
  onCancel
}) {
  const esEdicion = !!cita;

  const [formData, setFormData] = useState({
    tipo: cita?.tipo || '',
    fecha: cita?.fecha || '',
    hora_inicio: cita?.hora_inicio || '',
    hora_fin: cita?.hora_fin || '',
    tecnico_asignado_id: cita?.tecnico_asignado_id || '',
    orden_trabajo_id: cita?.orden_trabajo_id || '',
    cliente_id: cita?.cliente_id || '',
    motivo: cita?.motivo || '',
    notas: cita?.notas || '',
    enlace_videollamada: cita?.enlace_videollamada || '',
  });

  const [error, setError] = useState('');

  // Queries
  const { data: tecnicos = [] } = useQuery({
    queryKey: ['tecnicos', effectiveOrgId],
    queryFn: async () => {
      const { accounts } = await listIdentityAccounts(effectiveOrgId);
      return accounts.filter(account => account.role === 'TECHNICIAN' && account.status === 'active');
    },
    enabled: !!effectiveOrgId && ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'CUSTOMER_SERVICE'].includes(effectiveRole),
  });

  const { data: ordenesTrabajo = [] } = useQuery({
    queryKey: ['ordenes-trabajo', effectiveOrgId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({
      organization_id: effectiveOrgId
    }),
    enabled: !!effectiveOrgId && TIPOS_CON_OT.includes(formData.tipo),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', effectiveOrgId],
    queryFn: () => base44.entities.Cliente.filter({
      organization_id: effectiveOrgId
    }),
    enabled: !!effectiveOrgId,
  });

  // Determinar tipos permitidos según rol
  const tiposPermitidos = () => {
    if (effectiveRole === 'TECHNICIAN') {
      return ['bloqueo_personal'];
    }
    if (['SALES', 'CUSTOMER_SERVICE'].includes(effectiveRole)) {
      return ['consulta'];
    }
    // ORG_ADMIN y BRANCH_ADMIN pueden crear todos los tipos
    return [...TIPOS_CON_OT, ...TIPOS_SIN_OT];
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validación: OT obligatoria para ciertos tipos
    if (TIPOS_CON_OT.includes(formData.tipo) && !formData.orden_trabajo_id) {
      setError(`El tipo "${TIPO_LABELS[formData.tipo]}" requiere una orden de trabajo`);
      return;
    }

    // Validación: enlace videollamada para soporte remoto
    if (formData.tipo === 'soporte_remoto' && !formData.enlace_videollamada) {
      setError('El soporte remoto requiere un enlace de videollamada');
      return;
    }

    // Validación: técnico asignado
    if (!formData.tecnico_asignado_id) {
      setError('Debe seleccionar un técnico');
      return;
    }

    // Validación: solapamiento
    const validacion = await validarSolapamiento(
      formData.tecnico_asignado_id,
      formData.fecha,
      formData.hora_inicio,
      formData.hora_fin,
      effectiveOrgId,
      cita?.id
    );

    if (!validacion.valido) {
      setError(validacion.mensaje);
      return;
    }

    // Obtener email del técnico
    const tecnico = tecnicos.find(t => t.user_id === formData.tecnico_asignado_id);
    const tecnicoEmail = tecnico?.user_email || userEmail;

    // Preparar datos
    const citaData = {
      organization_id: effectiveOrgId,
      tipo: formData.tipo,
      fecha: formData.fecha,
      hora_inicio: formData.hora_inicio,
      hora_fin: formData.hora_fin,
      tecnico_asignado_id: formData.tecnico_asignado_id,
      tecnico_asignado_email: tecnicoEmail,
      motivo: formData.motivo || null,
      notas: formData.notas || null,
      enlace_videollamada: formData.enlace_videollamada || null,
      orden_trabajo_id: formData.orden_trabajo_id || null,
      cliente_id: formData.cliente_id || null,
      created_by_user_id: userId,
      created_by_role: effectiveRole,
    };

    onSubmit(citaData);
  };

  const requiereOT = TIPOS_CON_OT.includes(formData.tipo);
  const requiereVideoLlamada = formData.tipo === 'soporte_remoto';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert className="bg-red-50 border-red-200">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <AlertDescription className="text-red-900">{error}</AlertDescription>
        </Alert>
      )}

      {/* Tipo de cita */}
      <div className="space-y-2">
        <Label>Tipo de Cita *</Label>
        <Select
          value={formData.tipo}
          onValueChange={(value) => setFormData({ ...formData, tipo: value })}
          disabled={esEdicion}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecciona el tipo" />
          </SelectTrigger>
          <SelectContent>
            {tiposPermitidos().map((tipo) => (
              <SelectItem key={tipo} value={tipo}>
                {TIPO_LABELS[tipo]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Técnico */}
      {effectiveRole !== 'TECHNICIAN' && (
        <div className="space-y-2">
          <Label>Técnico Asignado *</Label>
          <Select
            value={formData.tecnico_asignado_id}
            onValueChange={(value) => setFormData({ ...formData, tecnico_asignado_id: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un técnico" />
            </SelectTrigger>
            <SelectContent>
              {tecnicos.map((t) => (
                <SelectItem key={t.user_id} value={t.user_id}>
                  {t.user_email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Fecha */}
      <div className="space-y-2">
        <Label>Fecha *</Label>
        <Input
          type="date"
          value={formData.fecha}
          onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
          required
        />
      </div>

      {/* Horas */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Hora Inicio *</Label>
          <Input
            type="time"
            value={formData.hora_inicio}
            onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Hora Fin *</Label>
          <Input
            type="time"
            value={formData.hora_fin}
            onChange={(e) => setFormData({ ...formData, hora_fin: e.target.value })}
            required
          />
        </div>
      </div>

      {/* OT (condicional) - UX FIX APLICADO */}
      {requiereOT && (
        <div className="space-y-2">
          <Label>Orden de Trabajo asociada *</Label>
          <Select
            value={formData.orden_trabajo_id}
            onValueChange={(value) => setFormData({ ...formData, orden_trabajo_id: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona la OT correspondiente" />
            </SelectTrigger>
            <SelectContent>
              {ordenesTrabajo
                .filter(ot => !['ENTREGADA', 'CANCELADA'].includes(ot.estado))
                .map((ot) => (
                  <SelectItem key={ot.id} value={ot.id}>
                    {ot.codigo_ot} - {ot.motivo_ingreso}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">
            Selecciona la OT correspondiente al diagnóstico o reparación.
          </p>
        </div>
      )}

      {/* Cliente */}
      {!requiereOT && (
        <div className="space-y-2">
          <Label>Cliente (opcional)</Label>
          <Select
            value={formData.cliente_id}
            onValueChange={(value) => setFormData({ ...formData, cliente_id: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un cliente" />
            </SelectTrigger>
            <SelectContent>
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre_completo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Enlace videollamada (condicional) */}
      {requiereVideoLlamada && (
        <div className="space-y-2">
          <Label>Enlace Videollamada * (requerido)</Label>
          <Input
            type="url"
            value={formData.enlace_videollamada}
            onChange={(e) => setFormData({ ...formData, enlace_videollamada: e.target.value })}
            placeholder="https://meet.google.com/..."
          />
        </div>
      )}

      {/* Motivo */}
      <div className="space-y-2">
        <Label>Motivo</Label>
        <Input
          value={formData.motivo}
          onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
          placeholder="Describe brevemente el motivo de la cita"
        />
      </div>

      {/* Notas */}
      <div className="space-y-2">
        <Label>Notas (opcional)</Label>
        <Textarea
          value={formData.notas}
          onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
          placeholder="Información adicional..."
          rows={3}
        />
      </div>

      {/* Botones */}
      <div className="flex gap-3 justify-end pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" className="bg-gradient-to-r from-emerald-500 to-blue-500">
          {esEdicion ? 'Actualizar Cita' : 'Crear Cita'}
        </Button>
      </div>
    </form>
  );
}
