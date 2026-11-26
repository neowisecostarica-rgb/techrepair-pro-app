import { useI18n } from '@/i18n';
import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Package, Plus, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function SolicitudesTecnicas({ ordenTrabajoId, userAccount }) {
  const { t } = useI18n();
  const [showModal, setShowModal] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] = useState('EXISTING_STOCK');
  const queryClient = useQueryClient();
  const commandLock = useRef(false);

  const { data: solicitudes = [], isError: requestsError, isLoading: requestsLoading, refetch: reloadRequests } = useQuery({
    queryKey: ['solicitudes-tecnicas', userAccount?.organization_id, userAccount?.branch_id, userAccount?.id, ordenTrabajoId],
    queryFn: async () => {
      const response = await base44.functions.invoke('technicalRequestCommand', { action: 'LIST_WORK_ORDER', orden_trabajo_id: ordenTrabajoId });
      const result = response?.data || response;
      if (result?.error || !Array.isArray(result?.requests)) throw new Error(result?.error || 'No se pudieron consultar las solicitudes');
      return result.requests;
    },
    enabled: !!ordenTrabajoId,
  });

  const { data: inventory = [], isError: inventoryError, isLoading: inventoryLoading } = useQuery({
    queryKey: ['technical-request-inventory', userAccount?.organization_id, userAccount?.branch_id, userAccount?.id],
    queryFn: () => base44.entities.Inventario.filter({ organization_id: userAccount.organization_id, estado: 'activo' }, '-created_date', 500),
    enabled: showModal && !!userAccount?.organization_id,
  });

  const commandMutation = useMutation({
    mutationFn: async (/** @type {Record<string, any>} */ data) => {
      const response = await base44.functions.invoke('technicalRequestCommand', data);
      const result = response?.data || response;
      const expected = data.action === 'CREATE_DRAFT' ? 'draft' : 'requested';
      if (result?.error || !result?.request?.id || result.request.estado !== expected || result.request.orden_trabajo_id !== ordenTrabajoId || (data.request_id && result.request.id !== data.request_id)) throw new Error(result?.error || 'Solicitud no confirmada. Actualiza antes de repetir.');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes-tecnicas'] });
      setShowModal(false);
    },
  });

  const execute = data => {
    if (commandLock.current) return;
    commandLock.current = true;
    commandMutation.mutate(data, { onSettled: () => { commandLock.current = false; } });
  };
  const handleSubmit = event => {
    event.preventDefault();
    const formData = new FormData(event.target);
    if (fulfillmentMode === "EXISTING_STOCK" && (inventoryError || inventoryLoading || !inventory.some(item => item.id === formData.get("inventory_id")))) return;
    execute({
      action: 'CREATE_DRAFT',
      orden_trabajo_id: ordenTrabajoId,
      tipo: formData.get('tipo'),
      descripcion: formData.get('descripcion'),
      cantidad: Number(formData.get('cantidad')),
      fulfillment_mode: fulfillmentMode,
      inventory_id: fulfillmentMode === 'EXISTING_STOCK' ? formData.get('inventory_id') : null,
      correlation_id: crypto.randomUUID(),
    });
  };

  const estadoConfig = {
    draft: { icon: Clock, color: 'bg-slate-100 text-slate-700', label: 'Borrador' },
    requested: { icon: Loader2, color: 'bg-blue-100 text-blue-700', label: 'Solicitado' },
    approved: { icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700', label: 'Aprobado' },
    rejected: { icon: XCircle, color: 'bg-red-100 text-red-700', label: 'Rechazado' },
    fulfilled: { icon: CheckCircle, color: 'bg-green-100 text-green-700', label: 'Entregado' },
  };

  return <>
    <Card className="border-0 shadow-md">
      <CardHeader className="border-b border-slate-100">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2"><Package className="w-5 h-5 text-emerald-600" />{t('otTech.requests','Solicitudes Técnicas')}</CardTitle>
          <Button onClick={() => setShowModal(true)} size="sm"><Plus className="w-4 h-4 mr-2" />{t('otTech.newRequest','Nueva Solicitud')}</Button>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {commandMutation.isError && <p role="alert" className="text-sm text-red-700">{commandMutation.error?.message}</p>}
        {requestsError ? <div role="alert">No se pudieron consultar las solicitudes. <Button variant="link" onClick={() => reloadRequests()}>Reintentar</Button></div> : requestsLoading ? <p>Cargando solicitudes…</p> : solicitudes.length === 0 ? <div className="text-center py-8 text-slate-400"><Package className="w-12 h-12 mx-auto mb-3" /><p>{t('otTech.noRequests','No hay solicitudes registradas')}</p></div> :
          <div className="space-y-3">{solicitudes.map(solicitud => {
            const config = estadoConfig[solicitud.estado] || estadoConfig.draft;
            const Icon = config.icon;
            return <div key={solicitud.id} className="p-4 bg-slate-50 rounded-lg flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="capitalize bg-purple-100 text-purple-700 border-0 text-xs">{solicitud.tipo}</Badge>
                  <Badge className={`${config.color} border-0 text-xs flex items-center gap-1`}><Icon className="w-3 h-3" />{config.label}</Badge>
                  <Badge variant="outline">{solicitud.fulfillment_mode === 'NEW_SPEND' ? 'Compra nueva' : 'Stock'}</Badge>
                </div>
                <p className="font-medium text-slate-900">{solicitud.descripcion}</p>
                <p className="text-sm text-slate-500">Cantidad: {solicitud.cantidad}</p>
                {solicitud.created_date && <p className="text-xs text-slate-400 mt-1">{formatDistanceToNow(new Date(solicitud.created_date), { addSuffix: true, locale: es })}</p>}
                {solicitud.motivo_rechazo && <p className="text-xs text-red-600 mt-2">{solicitud.motivo_rechazo}</p>}
              </div>
              {solicitud.estado === 'draft' && <Button size="sm" disabled={commandMutation.isPending} onClick={() => execute({ action: 'SUBMIT', request_id: solicitud.id, correlation_id: crypto.randomUUID() })}>{t('otTech.request','Solicitar')}</Button>}
            </div>;
          })}</div>}
      </CardContent>
    </Card>

    <Dialog open={showModal} onOpenChange={value => { if (!commandLock.current) setShowModal(value); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('otTech.newRequest','Nueva Solicitud Técnica')}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {commandMutation.isError && <p role="alert" className="text-sm text-red-700">{commandMutation.error?.message}</p>}
          {fulfillmentMode === "EXISTING_STOCK" && inventoryError && <p role="alert">Inventario no disponible. Cierra y vuelve a consultar.</p>}
          <div className="space-y-2"><Label>Tipo *</Label><Select name="tipo" required><SelectTrigger><SelectValue placeholder={t('otTech.selectType','Seleccionar tipo')} /></SelectTrigger><SelectContent><SelectItem value="repuesto">Repuesto</SelectItem><SelectItem value="suministro">Suministro</SelectItem><SelectItem value="herramienta">Herramienta</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>Modo de abastecimiento *</Label><Select value={fulfillmentMode} onValueChange={setFulfillmentMode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EXISTING_STOCK">Stock existente</SelectItem><SelectItem value="NEW_SPEND">Compra / gasto nuevo</SelectItem></SelectContent></Select></div>
          {fulfillmentMode === 'EXISTING_STOCK' && <div className="space-y-2"><Label>Item de inventario *</Label><Select name="inventory_id" required><SelectTrigger><SelectValue placeholder={t('inventory.selectItem','Seleccionar item')} /></SelectTrigger><SelectContent>{inventory.map(item => <SelectItem key={item.id} value={item.id}>{item.nombre} ({item.cantidad_disponible || 0})</SelectItem>)}</SelectContent></Select></div>}
          <div className="space-y-2"><Label>Descripción *</Label><Textarea name="descripcion" required rows={3} /></div>
          <div className="space-y-2"><Label>Cantidad *</Label><Input name="cantidad" type="number" min="1" defaultValue="1" required /></div>
          <div className="flex gap-3 justify-end"><Button type="button" variant="outline" onClick={() => setShowModal(false)}>{t('otTech.cancel','Cancelar')}</Button><Button type="submit" disabled={commandMutation.isPending || (fulfillmentMode === "EXISTING_STOCK" && (inventoryError || inventoryLoading))}>{t('otTech.saveDraft','Guardar Borrador')}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}