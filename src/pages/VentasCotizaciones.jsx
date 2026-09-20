import { useI18n } from '@/i18n';
import { formatDateTime, formatDate } from '@/i18n/format';
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getIdentityOrganization } from '@/api/identity';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PageGuard from '@/components/guards/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Eye, FileText, CheckCircle2, XCircle, Clock, ArrowRight, ShoppingCart, Plus, Pencil, Send, LinkIcon, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import FormularioCotizacion from '@/components/cotizacion/FormularioCotizacion';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { getPublicBaseUrl } from '@/components/ventas/getPublicBaseUrl';
import { useToast } from '@/components/ui/use-toast';

export default function VentasCotizaciones() {
  const { locale } = useI18n();
  return (
    <PageGuard allowedRoles={['SALES', 'ORG_ADMIN', 'BRANCH_ADMIN']}>
      <VentasCotizacionesContent />
    </PageGuard>
  );
}

function VentasCotizacionesContent() {
  const { effectiveOrgId, user, userAccount } = useAuthContext();
  const { toast } = useToast();
  const { data: organization } = useQuery({
    queryKey: ['org-ventascot', effectiveOrgId],
    queryFn: async () => {
      const result = await getIdentityOrganization(effectiveOrgId);
      return result.organization || null;
    },
    enabled: !!effectiveOrgId,
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [cotizacionSeleccionada, setCotizacionSeleccionada] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [showNuevaCotizacion, setShowNuevaCotizacion] = useState(false);
  const [cotizacionEditar, setCotizacionEditar] = useState(null);

  const emitirEnlaceCotizacion = async (quoteId) => {
    const response = await base44.functions.invoke('issuePublicDocumentToken', {
      type: 'quote',
      resource_id: quoteId,
      correlation_id: crypto.randomUUID(),
    });
    const token = response?.data?.token;
    if (!token) throw new Error(response?.data?.error || 'No se pudo emitir el enlace de cotizacion');
    return `${getPublicBaseUrl(organization)}/PortalCotizacion?token=${token}`;
  };

  // Escuchar eventos de cotización creada/actualizada
  React.useEffect(() => {
    const handleCotizacionCreada = (e) => {
      setShowNuevaCotizacion(false);
      setCotizacionSeleccionada(e.detail);
    };
    const handleCotizacionActualizada = (e) => {
      setShowNuevaCotizacion(false);
      setCotizacionSeleccionada(e.detail);
    };
    window.addEventListener('cotizacion-creada', handleCotizacionCreada);
    window.addEventListener('cotizacion-actualizada', handleCotizacionActualizada);
    return () => {
      window.removeEventListener('cotizacion-creada', handleCotizacionCreada);
      window.removeEventListener('cotizacion-actualizada', handleCotizacionActualizada);
    };
  }, []);

  const { data: cotizaciones = [], isLoading } = useQuery({
    queryKey: ['cotizaciones-ventas', effectiveOrgId],
    queryFn: () => base44.entities.Cotizacion.filter({
      organization_id: effectiveOrgId
    }),
    select: (data) => data.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)),
    enabled: !!effectiveOrgId
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-cot', effectiveOrgId],
    queryFn: () => base44.entities.Cliente.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId
  });

  const { data: ordenesTrabajo = [] } = useQuery({
    queryKey: ['ot-cot', effectiveOrgId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId
  });

  const getClienteName = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre_completo || 'Sin cliente';
  };

  const getOT = (otId) => {
    if (!otId) return null;
    return ordenesTrabajo.find(o => o.id === otId);
  };

  const convertirAVenta = (cotizacion) => {
    if (cotizacion.estado !== 'aprobada') {
      toast({ variant: 'destructive', title: 'Cotización aún no aprobada', description: 'Solo las cotizaciones aprobadas pueden convertirse en venta.' });
      return;
    }

    const carrito = cotizacion.items?.map(item => ({
      tipo: item.tipo || 'producto',
      referencia_id: item.referencia_id || null,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal
    })) || [];

    navigate(createPageUrl('PuntoVenta'), {
      state: {
        cotizacion_origen: cotizacion,
        carrito: carrito,
        cliente_id: cotizacion.cliente_id,
        orden_trabajo_id: cotizacion.orden_trabajo_id
      }
    });
  };

  const cotizacionesFiltradas = cotizaciones.filter(c => {
    if (busqueda) {
      const cliente = getClienteName(c.cliente_id).toLowerCase();
      const total = c.total.toString();
      const ot = getOT(c.orden_trabajo_id);
      const otCodigo = ot?.codigo_ot?.toLowerCase() || '';
      if (!cliente.includes(busqueda.toLowerCase()) && 
          !total.includes(busqueda) && 
          !otCodigo.includes(busqueda.toLowerCase())) {
        return false;
      }
    }

    if (filtroEstado !== 'todas' && c.estado !== filtroEstado) {
      return false;
    }

    return true;
  });

  const estadoConfig = {
    borrador: { color: 'bg-slate-100 text-slate-700', icon: FileText, label: 'Borrador', indicador: '⚪' },
    enviada: { color: 'bg-blue-100 text-blue-700', icon: Clock, label: 'Enviada', indicador: '🟢' },
    aprobada: { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, label: 'Aprobada', indicador: '🟢' },
    rechazada: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Rechazada', indicador: '🔴' },
    vencida: { color: 'bg-orange-100 text-orange-700', icon: XCircle, label: 'Vencida', indicador: '🔴' },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando cotizaciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Cotizaciones</h1>
          <p className="text-slate-600">Gestión de cotizaciones comerciales</p>
        </div>
        <Button
          onClick={() => {
            setCotizacionEditar(null);
            setShowNuevaCotizacion(true);
          }}
          className="bg-teal-700 hover:bg-teal-800 hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nueva Cotización
        </Button>
      </div>

      <Card className="border border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Cotizaciones Registradas ({cotizacionesFiltradas.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {/* Filtros */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Search className="w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por cliente, OT o monto..."
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
              <option value="borrador">Borrador</option>
              <option value="enviada">Enviada</option>
              <option value="aprobada">Aprobada</option>
              <option value="rechazada">Rechazada</option>
              <option value="vencida">Vencida</option>
            </select>
          </div>

          {/* Lista */}
          <div className="space-y-3">
            {cotizacionesFiltradas.map((cot) => {
              const config = estadoConfig[cot.estado];
              const Icon = config.icon;
              const ot = getOT(cot.orden_trabajo_id);

              return (
                <div
                  key={cot.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="text-2xl">{config.indicador}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={`${config.color} border-0`}>
                          <Icon className="w-3 h-3 mr-1" />
                          {config.label}
                        </Badge>
                        {cot.requiere_aprobacion && !cot.aprobada_por && (
                          <Badge className="bg-yellow-100 text-yellow-700 border-0 text-xs">
                            Requiere Aprobación
                          </Badge>
                        )}
                      </div>
                      <p className="font-semibold text-slate-900">
                        {getClienteName(cot.cliente_id)} - ₡{cot.total.toLocaleString()}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
                        <span>{cot.items?.length || 0} ítems</span>
                        {ot && (
                          <Badge variant="outline" className="text-xs">
                            {ot.codigo_ot}
                          </Badge>
                        )}
                        {cot.valida_hasta && (
                          <span>Válida hasta: {formatDate(cot.valida_hasta, locale, {year:'numeric',month:'2-digit',day:'2-digit'})}</span>
                        )}
                      </div>
                      {cot.ultimo_envio && (
                        <p className="text-xs text-slate-500">
                          📤 Enviada por {cot.ultimo_envio.canal === 'whatsapp' ? 'WhatsApp' : cot.ultimo_envio.canal === 'correo' ? 'Email' : 'Link'} - {formatDateTime(cot.ultimo_envio.fecha, locale, {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => setCotizacionSeleccionada(cot)}
                      variant="outline"
                      size="sm"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Ver
                    </Button>
                    {cot.orden_trabajo_id && (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                      >
                        <Link to={createPageUrl('OrdenesTrabajo')}>
                          <ArrowRight className="w-3 h-3 mr-1" />
                          Ir a OT
                        </Link>
                      </Button>
                    )}
                    {cot.estado === 'aprobada' && (
                      <Button
                        onClick={() => convertirAVenta(cot)}
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <ShoppingCart className="w-3 h-3 mr-1" />
                        Convertir a Venta
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {cotizacionesFiltradas.length === 0 && (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No se encontraron cotizaciones</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal Detalle */}
      <Dialog open={!!cotizacionSeleccionada} onOpenChange={() => setCotizacionSeleccionada(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Detalle de Cotización</span>
              {cotizacionSeleccionada && (
                <Badge className={estadoConfig[cotizacionSeleccionada.estado].color}>
                  {estadoConfig[cotizacionSeleccionada.estado].label}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {cotizacionSeleccionada && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-xs text-slate-500">Cliente</p>
                  <p className="font-semibold text-slate-900">
                    {getClienteName(cotizacionSeleccionada.cliente_id)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Estado</p>
                  <Badge className={estadoConfig[cotizacionSeleccionada.estado].color}>
                    {estadoConfig[cotizacionSeleccionada.estado].label}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Vendedor</p>
                  <p className="text-slate-900">{cotizacionSeleccionada.vendedor_nombre}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Fecha</p>
                  <p className="text-slate-900">
                    {formatDate(cotizacionSeleccionada.created_date, locale)}
                  </p>
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="font-semibold text-slate-900 mb-3">Ítems de la Cotización</h4>
                <div className="space-y-2">
                  {cotizacionSeleccionada.items?.map((item, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-slate-900">{item.descripcion}</p>
                          <p className="text-xs text-slate-500">
                            {item.cantidad} x ₡{item.precio_unitario?.toLocaleString()}
                            {item.descuento_porcentaje > 0 && ` (-${item.descuento_porcentaje}%)`}
                          </p>
                        </div>
                        <p className="font-semibold text-slate-900">₡{item.subtotal?.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totales */}
              <div className="border-t pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Subtotal:</span>
                    <span className="font-medium">₡{cotizacionSeleccionada.subtotal?.toLocaleString()}</span>
                  </div>
                  {cotizacionSeleccionada.descuento_total > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Descuento:</span>
                      <span className="font-medium text-emerald-600">-₡{cotizacionSeleccionada.descuento_total?.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">IVA (13%):</span>
                    <span className="font-medium">₡{cotizacionSeleccionada.impuesto?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span className="text-emerald-600">₡{cotizacionSeleccionada.total?.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {cotizacionSeleccionada.notas && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Notas</h4>
                  <p className="text-sm text-slate-600">{cotizacionSeleccionada.notas}</p>
                </div>
              )}

              {cotizacionSeleccionada.ultimo_envio && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Último envío:</strong> {cotizacionSeleccionada.ultimo_envio.canal === 'whatsapp' ? 'WhatsApp' : cotizacionSeleccionada.ultimo_envio.canal === 'correo' ? 'Correo Electrónico' : 'Link Compartido'}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    {formatDateTime(cotizacionSeleccionada.ultimo_envio.fecha, locale)} por {cotizacionSeleccionada.ultimo_envio.enviado_por_nombre}
                  </p>
                </div>
              )}

              {/* Acciones según estado */}
              <div className="border-t pt-6">
                <h4 className="font-semibold text-slate-900 mb-4">Acciones Disponibles</h4>
                <div className="flex flex-wrap gap-3">
                  {cotizacionSeleccionada.estado === 'borrador' && (
                    <>
                      <Button
                        onClick={() => {
                          setCotizacionEditar(cotizacionSeleccionada);
                          setCotizacionSeleccionada(null);
                          setShowNuevaCotizacion(true);
                        }}
                        variant="outline"
                        className="border-slate-300"
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Editar Cotización
                      </Button>
                      <Button
                        onClick={async () => {
                          if (cotizacionSeleccionada.requiere_aprobacion && !cotizacionSeleccionada.aprobada_por) {
                            toast({ variant: 'destructive', title: 'Aprobación requerida', description: 'El descuento aplicado requiere aprobación antes de continuar.' });
                            return;
                          }
                          const response = await base44.functions.invoke('approveCotizacion', {
                            cotizacion_id: cotizacionSeleccionada.id,
                            canal_envio: 'link',
                          });
                          if (!response?.data?.success) {
                            throw new Error(response?.data?.error || 'El servidor no confirmó el envío de la cotización');
                          }
                          queryClient.invalidateQueries({ queryKey: ['cotizaciones-ventas'] });
                          queryClient.invalidateQueries({ queryKey: ['ordenes'] });
                          const updatedQuote = response.data.cotizacion || response.data.data || {
                            ...cotizacionSeleccionada,
                            estado: 'enviada',
                          };
                          const link = await emitirEnlaceCotizacion(cotizacionSeleccionada.id);
                          navigator.clipboard.writeText(link);
                          toast({ title: 'Cotización enviada', description: 'El enlace quedó copiado al portapapeles.' });
                          setCotizacionSeleccionada(updatedQuote);
                        }}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Enviar Cotización
                      </Button>
                    </>
                  )}
                  {(cotizacionSeleccionada.estado === 'enviada' || cotizacionSeleccionada.estado === 'aprobada') && (
                    <>
                      <Button
                        onClick={async () => {
                          const response = await base44.functions.invoke('approveCotizacion', {
                            cotizacion_id: cotizacionSeleccionada.id,
                            canal_envio: 'link',
                          });
                          if (!response?.data?.success) {
                            throw new Error(response?.data?.error || 'El servidor no confirmó el reenvío de la cotización');
                          }
                          queryClient.invalidateQueries({ queryKey: ['cotizaciones-ventas'] });
                          const link = await emitirEnlaceCotizacion(cotizacionSeleccionada.id);
                          navigator.clipboard.writeText(link);
                          toast({ title: 'Reenvío registrado', description: 'El enlace quedó copiado al portapapeles.' });
                          setCotizacionSeleccionada(response.data.cotizacion || response.data.data || cotizacionSeleccionada);
                        }}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Reenviar Cotización
                      </Button>
                      <Button
                        onClick={async () => {
                          const link = await emitirEnlaceCotizacion(cotizacionSeleccionada.id);
                          navigator.clipboard.writeText(link);
                          toast({ title: 'Enlace copiado', description: 'Ya puedes compartirlo con el cliente.' });
                        }}
                        variant="outline"
                        className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                      >
                        <LinkIcon className="w-4 h-4 mr-2" />
                        Copiar Link
                      </Button>
                      <Button
                        onClick={async () => {
                          const link = await emitirEnlaceCotizacion(cotizacionSeleccionada.id);
                          window.open(link, '_blank');
                        }}
                        variant="outline"
                      >
                        <Printer className="w-4 h-4 mr-2" />
                        Imprimir
                      </Button>
                    </>
                  )}
                  <Button
                    onClick={() => setCotizacionSeleccionada(null)}
                    variant="outline"
                  >
                    Cerrar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Nueva Cotización */}
      <Dialog open={showNuevaCotizacion} onOpenChange={(open) => {
        setShowNuevaCotizacion(open);
        if (!open) setCotizacionEditar(null);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{cotizacionEditar ? 'Editar Cotización' : 'Nueva Cotización'}</DialogTitle>
          </DialogHeader>
          
          <FormularioCotizacion
            clienteId={null}
            ordenTrabajoId={null}
            user={user}
            userAccount={userAccount}
            clientes={clientes}
            cotizacionEditar={cotizacionEditar}
            onGuardar={(cot) => {
              setShowNuevaCotizacion(false);
              setCotizacionEditar(null);
              setCotizacionSeleccionada(cot);
            }}
            onCancelar={() => {
              setShowNuevaCotizacion(false);
              setCotizacionEditar(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
