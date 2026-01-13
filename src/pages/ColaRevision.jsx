import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Inbox, UserPlus, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useUserAccount } from '@/components/hooks/useOrgData';

export default function ColaRevision() {
  const [showAsignarModal, setShowAsignarModal] = useState(false);
  const [selectedOT, setSelectedOT] = useState(null);
  const [tecnicoSeleccionado, setTecnicoSeleccionado] = useState('');
  const queryClient = useQueryClient();
  const { userAccount } = useUserAccount();

  const { data: ordenesCola = [] } = useQuery({
    queryKey: ['ordenes-cola', userAccount?.organization_id],
    queryFn: () => base44.entities.OrdenTrabajo.filter({
      organization_id: userAccount.organization_id,
      estado: 'EN_COLA_REVISION'
    }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: ordenesAsignadas = [] } = useQuery({
    queryKey: ['ordenes-asignadas', userAccount?.organization_id],
    queryFn: () => base44.entities.OrdenTrabajo.filter({
      organization_id: userAccount.organization_id,
      estado: 'ASIGNADA'
    }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: tecnicos = [] } = useQuery({
    queryKey: ['tecnicos', userAccount?.organization_id],
    queryFn: async () => {
      const accounts = await base44.entities.UserAccount.filter({
        organization_id: userAccount.organization_id,
        role: 'TECHNICIAN'
      });
      return accounts;
    },
    enabled: !!userAccount?.organization_id,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', userAccount?.organization_id],
    queryFn: () => base44.entities.Cliente.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: equipos = [] } = useQuery({
    queryKey: ['equipos', userAccount?.organization_id],
    queryFn: () => base44.entities.Equipo.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  const asignarMutation = useMutation({
    mutationFn: ({ id, tecnicoId }) => base44.entities.OrdenTrabajo.update(id, {
      tecnico_asignado_id: tecnicoId,
      estado: 'ASIGNADA',
      estado_atencion: 'PAUSADO', // No activo automáticamente
      ultima_actividad: 'Orden asignada',
      ultima_actividad_at: new Date().toISOString()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes-cola'] });
      queryClient.invalidateQueries({ queryKey: ['ordenes-asignadas'] });
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
    return equipo ? `${equipo.marca} ${equipo.modelo}` : 'Equipo desconocido';
  };

  const getTecnicoName = (tecnicoId) => {
    const tecnico = tecnicos.find(t => t.user_id === tecnicoId);
    return tecnico?.user_email || 'Desconocido';
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
          {ordenesCola.map((orden) => (
            <Card key={orden.id} className="border-0 shadow-md hover:shadow-xl transition-all">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-slate-500 to-slate-700 rounded-xl flex items-center justify-center text-white font-bold">
                        <Clock className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg">{getClienteName(orden.cliente_id)}</h3>
                        <p className="text-sm text-slate-600 font-medium">
                          {orden.motivo_ingreso}
                        </p>
                        <p className="text-xs text-slate-500">
                          {getEquipoInfo(orden.equipo_id)}
                        </p>
                        <p className="text-xs text-slate-400">
                          Ingreso: {format(new Date(orden.fecha_ingreso || orden.created_date), 'dd MMM yyyy HH:mm', { locale: es })}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-slate-100 text-slate-700 border-0">
                        EN COLA
                      </Badge>
                      <Badge className={`${
                        orden.prioridad === 'urgente' ? 'bg-red-100 text-red-700' :
                        orden.prioridad === 'high' ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-700'
                      } border-0 capitalize`}>
                        {orden.prioridad}
                      </Badge>
                    </div>
                  </div>

                  <Button
                    onClick={() => handleAsignar(orden)}
                    className="bg-gradient-to-r from-emerald-500 to-blue-500"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Asignar
                  </Button>
                </div>
              </CardContent>
            </Card>
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
          {ordenesAsignadas.map((orden) => (
            <Card key={orden.id} className="border-0 shadow-md">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center text-white font-bold">
                        <UserPlus className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg">{getClienteName(orden.cliente_id)}</h3>
                        <p className="text-sm text-slate-600 font-medium">
                          {orden.motivo_ingreso}
                        </p>
                        <p className="text-xs text-slate-500">
                          {getEquipoInfo(orden.equipo_id)}
                        </p>
                        <p className="text-xs text-emerald-600 font-medium">
                          Técnico: {getTecnicoName(orden.tecnico_asignado_id)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-blue-100 text-blue-700 border-0">
                        ASIGNADA
                      </Badge>
                      <Badge className={`${
                        orden.prioridad === 'urgente' ? 'bg-red-100 text-red-700' :
                        orden.prioridad === 'high' ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-700'
                      } border-0 capitalize`}>
                        {orden.prioridad}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
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