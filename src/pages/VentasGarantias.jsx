import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageGuard from '@/components/guards/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Eye, Shield, Copy, ExternalLink, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthContext } from '@/components/contexts/AuthContext';

export default function VentasGarantias() {
  return (
    <PageGuard allowedRoles={['SALES', 'ORG_ADMIN', 'BRANCH_ADMIN']}>
      <VentasGarantiasContent />
    </PageGuard>
  );
}

function VentasGarantiasContent() {
  const { effectiveOrgId } = useAuthContext();
  const [busqueda, setBusqueda] = useState('');
  const [garantiaSeleccionada, setGarantiaSeleccionada] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('ACTIVA');
  const [copiedToken, setCopiedToken] = useState(null);

  const { data: garantias = [], isLoading } = useQuery({
    queryKey: ['garantias-ventas', effectiveOrgId],
    queryFn: () => base44.entities.Garantia.filter({
      organization_id: effectiveOrgId
    }),
    select: (data) => data.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)),
    enabled: !!effectiveOrgId
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-gar', effectiveOrgId],
    queryFn: () => base44.entities.Cliente.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId
  });

  const { data: ordenesTrabajo = [] } = useQuery({
    queryKey: ['ot-gar', effectiveOrgId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId
  });

  const { data: ventas = [] } = useQuery({
    queryKey: ['ventas-gar', effectiveOrgId],
    queryFn: () => base44.entities.Venta.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId
  });

  const getClienteName = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre_completo || 'Sin cliente';
  };

  const getClienteTelefono = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.telefono;
  };

  const getOrigen = (garantia) => {
    if (garantia.origen_tipo === 'OT') {
      const ot = ordenesTrabajo.find(o => o.id === garantia.origen_id);
      return ot?.codigo_ot || 'OT no encontrada';
    } else {
      const venta = ventas.find(v => v.id === garantia.origen_id);
      return venta ? `Venta ₡${venta.total.toLocaleString()}` : 'Venta no encontrada';
    }
  };

  const garantiasFiltradas = garantias.filter(g => {
    if (busqueda) {
      const cliente = getClienteName(g.cliente_id).toLowerCase();
      const origen = getOrigen(g).toLowerCase();
      if (!cliente.includes(busqueda.toLowerCase()) && !origen.includes(busqueda.toLowerCase())) {
        return false;
      }
    }

    if (filtroEstado !== 'todas' && g.estado !== filtroEstado) {
      return false;
    }

    return true;
  });

  const copiarLink = (token) => {
    const link = `${window.location.origin}/PortalGarantia?token=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const abrirPortal = (token) => {
    const link = `${window.location.origin}/PortalGarantia?token=${token}`;
    window.open(link, '_blank');
  };

  const estadoConfig = {
    ACTIVA: { color: 'bg-emerald-100 text-emerald-700', label: 'Activa' },
    VENCIDA: { color: 'bg-orange-100 text-orange-700', label: 'Vencida' },
    ANULADA: { color: 'bg-red-100 text-red-700', label: 'Anulada' },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando garantías...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Garantías</h1>
          <p className="text-slate-600">Consulta de garantías emitidas (solo lectura)</p>
        </div>
      </div>

      <Card className="border-0 shadow-xl">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Garantías Registradas ({garantiasFiltradas.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {/* Filtros */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Search className="w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por cliente u origen..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="flex-1"
              />
            </div>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-md"
            >
              <option value="todas">Todos los estados</option>
              <option value="ACTIVA">Activas</option>
              <option value="VENCIDA">Vencidas</option>
              <option value="ANULADA">Anuladas</option>
            </select>
          </div>

          {/* Lista */}
          <div className="space-y-3">
            {garantiasFiltradas.map((gar) => {
              const config = estadoConfig[gar.estado];
              const origen = getOrigen(gar);
              const telefono = getClienteTelefono(gar.cliente_id);

              return (
                <div
                  key={gar.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={`${config.color} border-0`}>
                        {config.label}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {gar.origen_tipo === 'OT' ? 'Reparación' : 'Venta'}
                      </Badge>
                    </div>
                    <p className="font-semibold text-slate-900">
                      {getClienteName(gar.cliente_id)}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
                      <span>Origen: {origen}</span>
                      {telefono && <span>📱 {telefono}</span>}
                      <span>
                        Vigencia: {format(new Date(gar.fecha_inicio), 'dd MMM', { locale: es })} - {format(new Date(gar.fecha_fin), 'dd MMM yyyy', { locale: es })}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => setGarantiaSeleccionada(gar)}
                      variant="outline"
                      size="sm"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Ver
                    </Button>
                    <Button
                      onClick={() => copiarLink(gar.public_access_token)}
                      variant="outline"
                      size="sm"
                      className={copiedToken === gar.public_access_token ? 'bg-emerald-50 border-emerald-200' : ''}
                    >
                      {copiedToken === gar.public_access_token ? (
                        <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3 mr-1" />
                      )}
                      {copiedToken === gar.public_access_token ? 'Copiado' : 'Copiar Link'}
                    </Button>
                    <Button
                      onClick={() => abrirPortal(gar.public_access_token)}
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Abrir
                    </Button>
                  </div>
                </div>
              );
            })}

            {garantiasFiltradas.length === 0 && (
              <div className="text-center py-12">
                <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No se encontraron garantías</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal Detalle */}
      <Dialog open={!!garantiaSeleccionada} onOpenChange={() => setGarantiaSeleccionada(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-600" />
              Detalle de Garantía
            </DialogTitle>
          </DialogHeader>
          {garantiaSeleccionada && (
            <div className="space-y-6 mt-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800 font-medium">📋 Solo lectura - No puede editar garantías desde esta vista</p>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-xs text-slate-500">Cliente</p>
                  <p className="font-semibold text-slate-900">
                    {getClienteName(garantiaSeleccionada.cliente_id)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Estado</p>
                  <Badge className={estadoConfig[garantiaSeleccionada.estado].color}>
                    {estadoConfig[garantiaSeleccionada.estado].label}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Tipo</p>
                  <Badge variant="outline" className="capitalize">
                    {garantiaSeleccionada.origen_tipo === 'OT' ? 'Reparación' : 'Venta de Producto'}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Origen</p>
                  <p className="text-slate-900">{getOrigen(garantiaSeleccionada)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Fecha de Emisión</p>
                  <p className="text-slate-900">
                    {format(new Date(garantiaSeleccionada.fecha_emision), 'dd MMM yyyy', { locale: es })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Vigencia</p>
                  <p className="text-slate-900">
                    {format(new Date(garantiaSeleccionada.fecha_inicio), 'dd MMM', { locale: es })} - {format(new Date(garantiaSeleccionada.fecha_fin), 'dd MMM yyyy', { locale: es })}
                  </p>
                </div>
              </div>

              {/* Texto de Garantía */}
              <div>
                <h4 className="font-semibold text-slate-900 mb-3">Términos de la Garantía</h4>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <pre className="text-sm whitespace-pre-wrap font-sans text-slate-700">
                    {garantiaSeleccionada.texto_snapshot}
                  </pre>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={() => copiarLink(garantiaSeleccionada.public_access_token)}
                  variant="outline"
                  className="flex-1"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar Enlace Público
                </Button>
                <Button
                  onClick={() => abrirPortal(garantiaSeleccionada.public_access_token)}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir Portal de Garantía
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}