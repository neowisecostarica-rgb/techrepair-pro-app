import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { WORK_ORDER_STATUSES } from '@/config/workOrderStatus';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Inbox, UserPlus } from 'lucide-react';
import { useUserAccount } from '@/components/hooks/useOrgData';
import { transicionarEstadoOT } from '@/components/ot/transicionarEstadoOT';
import WorkOrderCard from '@/components/kanban/WorkOrderCard';

const BACKEND_URL = 'https://techrepairpro-core-1.onrender.com';

export default function ColaRevision() {
  const [showAsignarModal, setShowAsignarModal] = useState(false);
  const [selectedOT, setSelectedOT] = useState(null);
  const [tecnicoSeleccionado, setTecnicoSeleccionado] = useState('');
  const queryClient = useQueryClient();
  const { userAccount } = useUserAccount();

  const orgId = userAccount?.organization_id;

  const { data: todasOrdenes = [] } = useQuery({
    queryKey: ['ordenes', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const res = await fetch(`${BACKEND_URL}/v1/work-orders`, {
        headers: { 'Content-Type': 'application/json', 'x-organization-id': orgId }
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Error cargando órdenes');
      return resData.data || [];
    },
    enabled: !!orgId,
  });

  const ordenesCola = todasOrdenes.filter(o => o.estado === 'EN_COLA_REVISION');
  const ordenesAsignadas = todasOrdenes.filter(o => o.estado === 'ASIGNADA');

  const { data: tecnicos = [] } = useQuery({
    queryKey: ['tecnicos', orgId],
    queryFn: async () => {
      const accounts = await base44.entities.UserAccount.filter({
        organization_id: orgId,
        role: 'TECHNICIAN'
      });
      return accounts;
    },
    enabled: !!orgId,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const res = await fetch(`${BACKEND_URL}/v1/clients`, {
        headers: { 'Content-Type': 'application/json', 'x-organization-id': orgId }
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Error cargando clientes');
      return resData.data || [];
    },
    enabled: !!orgId,
  });

  const { data: equipos = [] } = useQuery({
    queryKey: ['equipos', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const res = await fetch(`${BACKEND_URL}/v1/equipment`, {
        headers: { 'Content-Type': 'application/json', 'x-organization-id': orgId }
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Error cargando equipos');
      return resData.data || [];
    },
    enabled: !!orgId,
  });

  const asignarMutation = useMutation({
    mutationFn: async ({ id, tecnicoId }) => {
      await transicionarEstadoOT(id, 'ASIGNADA', {
        userId: userAccount?.user_id,
        userEmail: userAccount?.user_email,
        organizationId: userAccount?.organization_id,
        motivo: `Orden asignada a técnico ${tecnicoId}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes', orgId] });
      setShowAsignarModal(false);
      setSelectedOT(null);
      setTecnicoSeleccionado('');
    },
  });

  const getClienteName = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre_completo || 'Cliente sin identificar';
  };

  const getEquipoInfo = (equipoId) => {
    const equipo = equipos.find(e => e.id === equipoId);
    return equipo ? `${equipo.marca} ${equipo.modelo || ''}`.trim() : 'Equipo desconocido';
  };

  const handleAsignar = (orden) => {
    setSelectedOT(orden);
    setShowAsignarModal(true);
  };

  const confirmAsignar = () => {
    if (!selectedOT || !tecnicoSeleccionado) return;
    asignarMutation.mutate({
      id: selectedOT.id,
      tecnicoId: tecnicoSeleccionado
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Cola de Revisión</h1>
        <p className="text-slate-500">Asignación de órdenes a técnicos</p>
      </div>

      {/* Sección EN COLA */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Inbox className="w-6 h-6 text-slate-700" />
          <h2 className="text-xl font-bold text-slate-900">En Cola de Revisión</h2>
          <Badge variant="outline" className="ml-auto">{ordenesCola.length}</Badge>
        </div>

        <div className="grid gap-4">
          {ordenesCola.map((orden, index) => (
            <div key={orden.id} className="flex items-center gap-3">
              <div className="flex-1">
                <WorkOrderCard
                  ot={orden}
                  index={index}
                  clientes={clientes}
                  equipos={equipos}
                />
              </div>
              <Button
                onClick={() => handleAsignar(orden)}
                className="bg-gradient-to-r from-emerald-500 to-blue-500 shrink-0"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Asignar
              </Button>
            </div>
          ))}

          {ordenesCola.length === 0 && (
            <Card className="border-0 shadow-md">
              <CardContent className="p-12 text-center">
                <Inbox className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-400">No hay órdenes en cola</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Sección ASIGNADAS */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-6 h-6 text-blue-700" />
          <h2 className="text-xl font-bold text-slate-900">Asignadas</h2>
          <Badge variant="outline" className="ml-auto">{ordenesAsignadas.length}</Badge>
        </div>

        <div className="grid gap-4">
          {ordenesAsignadas.map((orden, index) => (
            <WorkOrderCard
              key={orden.id}
              ot={orden}
              index={index}
              clientes={clientes}
              equipos={equipos}
            />
          ))}

          {ordenesAsignadas.length === 0 && (
            <Card className="border-0 shadow-md">
              <CardContent className="p-8 text-center">
                <p className="text-slate-400">No hay órdenes asignadas</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal Asignar */}
      <Dialog open={showAsignarModal} onOpenChange={setShowAsignarModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar Técnico</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {selectedOT && (
              <div className="p-4 bg-slate-50 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">{getClienteName(selectedOT.cliente_id)}</h4>
                <p className="text-sm text-slate-600">
                  {selectedOT.motivo_ingreso}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {getEquipoInfo(selectedOT.equipo_id)}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Seleccionar Técnico *</Label>
              <Select value={tecnicoSeleccionado} onValueChange={setTecnicoSeleccionado}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un técnico" />
                </SelectTrigger>
                <SelectContent>
                  {tecnicos.map(t => (
                    <SelectItem key={t.user_id} value={t.user_id}>
                      {t.user_email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-700">
                La orden se asignará en estado PAUSADO. El técnico podrá activarla desde "Mi Día".
              </p>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => setShowAsignarModal(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={confirmAsignar}
                disabled={!tecnicoSeleccionado || asignarMutation.isPending}
                className="bg-gradient-to-r from-emerald-500 to-blue-500"
              >
                Asignar Técnico
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}