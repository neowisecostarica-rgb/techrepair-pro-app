import React, { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { PackageCheck } from 'lucide-react';

export default function TechnicalRequestFulfillmentPanel({ items }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState({});
  const operationKeys = useRef({});
  const commandLock = useRef(false);
  const { effectiveOrgId, effectiveRole, userAccount, user } = useAuthContext();
  const { data: requests = [], isError, isLoading, refetch } = useQuery({
    queryKey: ['technical-requests-pending-inventory', effectiveOrgId, effectiveRole, userAccount?.branch_id, user?.id],
    enabled: !!effectiveOrgId && !!user?.id,
    queryFn: async () => {
      const response = await base44.functions.invoke('technicalRequestCommand', { action: 'LIST_PENDING' });
      const result = response?.data || response;
      if (result?.error || !Array.isArray(result?.requests)) throw new Error(result?.error || 'Solicitudes no disponibles');
      return result.requests;
    },
  });
  const eligible = requests.filter(request =>
    request.fulfillment_mode === 'EXISTING_STOCK' && request.estado === 'requested'
    || request.fulfillment_mode === 'NEW_SPEND' && request.estado === 'approved');

  const mutation = useMutation({
    mutationFn: async (/** @type {Record<string, any>} */ request) => {
      const operationKey = request.inventory_operation_key || operationKeys.current[request.id] || crypto.randomUUID();
      operationKeys.current[request.id] = operationKey;
      const response = await base44.functions.invoke('technicalRequestCommand', {
        action: 'FULFILL',
        request_id: request.id,
        inventory_id: request.inventario_id || selected[request.id],
        operation_key: operationKey,
      });
      const result = response?.data || response;
      if (result?.error || result?.request?.id !== request.id || result.request.estado !== 'fulfilled') throw new Error(result?.error || 'Entrega no confirmada. Actualiza antes de repetir.');
      return result;
    },
    onSuccess: (_, request) => {
      delete operationKeys.current[request.id];
      queryClient.invalidateQueries({ queryKey: ['technical-requests-pending-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
    },
  });

  if (isError) return <div role="alert">No se pudieron consultar las solicitudes pendientes. <Button variant="link" onClick={() => refetch()}>Reintentar</Button></div>;
  if (isLoading) return <p>Cargando solicitudes pendientes…</p>;
  if (eligible.length === 0 && !mutation.isError) return null;
  return <Card className="border-amber-200 bg-amber-50/40">
    <CardHeader><CardTitle className="text-lg flex items-center gap-2"><PackageCheck className="w-5 h-5 text-amber-700" />Solicitudes técnicas por entregar</CardTitle></CardHeader>
    <CardContent className="space-y-3">{mutation.isError && <p role="alert" className="text-sm text-red-700">{mutation.error?.message}</p>}{eligible.map(request => {
      const inventoryId = request.inventario_id || selected[request.id] || '';
      return <div key={request.id} className="bg-white rounded-lg p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1"><div className="flex gap-2 mb-1"><Badge>{request.tipo}</Badge><Badge variant="outline">{request.fulfillment_mode === 'NEW_SPEND' ? 'Compra aprobada' : 'Stock existente'}</Badge></div><p className="font-medium">{request.descripcion}</p><p className="text-sm text-slate-500">Cantidad: {request.cantidad}</p></div>
        {!request.inventario_id && <Select disabled={mutation.isPending || Boolean(operationKeys.current[request.id])} value={selected[request.id] || ''} onValueChange={value => setSelected(current => ({ ...current, [request.id]: value }))}><SelectTrigger className="w-64"><SelectValue placeholder="Item recibido" /></SelectTrigger><SelectContent>{items.map(item => <SelectItem key={item.id} value={item.id}>{item.nombre} ({item.cantidad_disponible || 0})</SelectItem>)}</SelectContent></Select>}
        <Button disabled={!inventoryId || mutation.isPending} onClick={() => { if (commandLock.current) return; commandLock.current = true; mutation.mutate(request, { onSettled: () => { commandLock.current = false; } }); }}>Reservar y entregar</Button>
      </div>;
    })}</CardContent>
  </Card>;
}
