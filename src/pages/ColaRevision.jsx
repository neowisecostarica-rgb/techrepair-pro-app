import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Inbox, UserPlus, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useAuthContext } from '@/components/contexts/AuthContext';
import PageGuard from '@/components/guards/PageGuard';
import WorkOrderCard from '@/components/kanban/WorkOrderCard';
import { useToast } from '@/components/ui/use-toast';
import { WORK_ORDER_STATUSES } from '@/config/workOrderStatus';

const ALLOWED_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'];

export default function ColaRevision() {
  return (
    <PageGuard allowedRoles={ALLOWED_ROLES}>
      <ColaRevisionContent />
    </PageGuard>
  );
}

function ColaRevisionContent() {
  const [showAsignarModal, setShowAsignarModal] = useState(false);
  const [selectedOT, setSelectedOT] = useState(null);
  const [tecnicoSeleccionado, setTecnicoSeleccionado] = useState('');
  const [motivoReasignacion, setMotivoReasignacion] = useState('');
  const queryClient = useQueryClient();
  const { effectiveOrgId } = useAuthContext();
  const { toast } = useToast();

  // ── Cargar OTs directamente desde Base44 SDK (mismo contrato que OrdenesTrabajo) ──
  const { data: todasOrdenes = [], isLoading: isLoadingOrdenes } = useQuery({
    queryKey: ['ordenes', effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const response = await base44.functions.invoke('listWorkOrders', {});
      return response.data || [];
    },
    enabled: !!effectiveOrgId,
    staleTime: 30 * 1000,
  });

  const ordenesCola = todasOrdenes.filter(o => o.estado === 'EN_COLA_REVISION');
  const ordenesAsignadas = todasOrdenes.filter(o => o.estado === 'ASIGNADA');

  // ── Técnicos disponibles ──
  const { data: tecnicos = [] } = useQuery({
    queryKey: ['tecnicos', effectiveOrgId],
    queryFn: async () => {
      return base44.entities.UserAccount.filter({
        organization_id: effectiveOrgId,
        role: 'TECHNICIAN',
      });
    },
    enabled: !!effectiveOrgId,
  });

  // ── Clientes y equipos para WorkOrderCard ──
  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      return base44.entities.Cliente.filter({ organization_id: effectiveOrgId });
    },
    enabled: !!effectiveOrgId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: equipos = [] } = useQuery({
    queryKey: ['equipos', effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      return base44.entities.Equipo.filter({ organization_id: effectiveOrgId });
    },
    enabled: !!effectiveOrgId,
    staleTime: 2 * 60 * 1000,
  });

  // ── FIX P1: Usar reassignWorkOrderTechnician con sanitización anti-circular ──
  const asignarMutation = useMutation({
    mutationFn: async ({ ordenId, tecnicoId }) => {
      console.log('[asignarMutation] → entrada mutationFn', { ordenId, tecnicoId });
      const tecnico = tecnicos.find(t => t.user_id === tecnicoId);
      const res = await base44.functions.invoke('reassignWorkOrderTechnician', {
        orden_trabajo_id: ordenId,
        tecnico_asignado_id: tecnicoId,
        tecnico_asignado_email: tecnico?.user_email || '',
        motivo: motivoReasignacion.trim() || null,
      });
      // Extraer SOLO los datos planos — nunca retornar el objeto Axios completo
      const data = res?.data ?? {};
      console.log('[asignarMutation] → salida mutationFn success:', data?.success);
      if (!data?.success) {
        const errMsg = typeof data?.error === 'string' ? data.error : 'La asignación no fue confirmada por el servidor';
        throw new Error(errMsg);
      }
      // Retornar objeto plano serializable — nunca el objeto res de Axios
      return { success: true, orden_trabajo_id: ordenId };
    },
    onSuccess: (_result) => {
      // Cerrar y limpiar TODO antes de invalidar caché
      setShowAsignarModal(false);
      setSelectedOT(null);
      setTecnicoSeleccionado('');
      setMotivoReasignacion('');
      toast({ title: '✅ Técnico asignado correctamente', duration: 3000 });
      queryClient.invalidateQueries({ queryKey: ['ordenes', effectiveOrgId] });
    },
    onError: (error) => {
      console.log('[asignarMutation] → onError');
      // Extraer únicamente el string del mensaje — nunca serializar el objeto error completo
      const msg = typeof error?.message === 'string' && error.message
        ? error.message
        : 'Error al asignar técnico';
      toast({ variant: 'destructive', title: 'Error al asignar técnico', description: msg, duration: 4000 });
    },
  });

  const handleAsignar = (orden) => {
    setSelectedOT(orden);
    setTecnicoSeleccionado('');
    setMotivoReasignacion('');
    setShowAsignarModal(true);
  };

  const confirmAsignar = () => {
    if (!selectedOT || !tecnicoSeleccionado) return;
    asignarMutation.mutate({ ordenId: selectedOT.id, tecnicoId: tecnicoSeleccionado });
  };

  if (isLoadingOrdenes) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mr-3" />
        <span className="text-slate-500">Cargando órdenes...</span>
      </div>
    );
  }

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
                  tecnicos={tecnicos}
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
              tecnicos={tecnicos}
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
      <Dialog open={showAsignarModal} onOpenChange={(open) => { if (!open) { setShowAsignarModal(false); setSelectedOT(null); setTecnicoSeleccionado(''); setMotivoReasignacion(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar Técnico</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {selectedOT && (
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-xs font-mono text-emerald-600 font-bold mb-1">{selectedOT.codigo_ot}</p>
                <p className="text-sm text-slate-600">{selectedOT.motivo_ingreso}</p>
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

            <div className="space-y-2">
              <Label>Motivo de reasignación <span className="text-slate-400 font-normal">(opcional)</span></Label>
              <Textarea
                value={motivoReasignacion}
                onChange={e => setMotivoReasignacion(e.target.value)}
                placeholder="Ej: Técnico con mayor especialización, carga de trabajo..."
                rows={2}
                className="resize-none text-sm"
              />
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => { setShowAsignarModal(false); setSelectedOT(null); setTecnicoSeleccionado(''); setMotivoReasignacion(''); }}>
                Cancelar
              </Button>
              <Button
                onClick={confirmAsignar}
                disabled={!tecnicoSeleccionado || asignarMutation.isPending}
                className="bg-gradient-to-r from-emerald-500 to-blue-500"
              >
                {asignarMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Asignando...</>
                ) : 'Asignar Técnico'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}