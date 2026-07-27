import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  AlertCircle, 
  ArrowRight,
  TrendingUp,
  DollarSign,
  Calendar,
  Wrench,
  FileText,
  CreditCard,
  Play
} from 'lucide-react';
import { format } from 'date-fns';
import MensajesMotivacion from '@/components/tecnico/MensajesMotivacion';
import AprobacionesPanel from '@/components/admin/AprobacionesPanel';
import SenalesNegocio from '@/components/admin/SenalesNegocio';
import { createPageUrl } from '../../utils';
import { Link } from 'react-router-dom';

export default function MiDiaAdmin({ user, effectiveOrgId, effectiveRole }) {
  const { data: todasOrdenes = [] } = useQuery({
    queryKey: ['todas-ordenes', effectiveOrgId],
    queryFn: async () => {
      const ots = await base44.entities.OrdenTrabajo.filter(
        { organization_id: effectiveOrgId },
        '-created_date',
        100
      );
      return ots;
    },
    enabled: !!effectiveOrgId,
    staleTime: 30000,
    refetchInterval: 10 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const { data: ventas = [] } = useQuery({
    queryKey: ['ventas', effectiveOrgId],
    queryFn: async () => {
      const ventas = await base44.entities.Venta.filter(
        { organization_id: effectiveOrgId },
        '-created_date',
        50
      );
      return ventas;
    },
    enabled: !!effectiveOrgId,
    staleTime: 30000,
  });

  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['cotizaciones', effectiveOrgId],
    queryFn: async () => {
      const cots = await base44.entities.Cotizacion.filter(
        { organization_id: effectiveOrgId },
        '-created_date',
        50
      );
      return cots;
    },
    enabled: !!effectiveOrgId,
    staleTime: 30000,
  });

  const { data: citas = [] } = useQuery({
    queryKey: ['citas-hoy', effectiveOrgId],
    queryFn: async () => {
      const hoy = new Date().toISOString().split('T')[0];
      const citas = await base44.entities.Cita.filter(
        { 
          organization_id: effectiveOrgId,
          fecha: hoy
        },
        'hora_inicio',
        50
      );
      return citas;
    },
    enabled: !!effectiveOrgId,
    staleTime: 60000,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', effectiveOrgId],
    queryFn: () => base44.entities.Cliente.filter({
      organization_id: effectiveOrgId
    }),
    enabled: !!effectiveOrgId,
  });

  const getClienteName = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre_completo || 'Cliente sin identificar';
  };

  const { data: equipos = [] } = useQuery({
    queryKey: ['equipos', effectiveOrgId],
    queryFn: () => base44.entities.Equipo.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });

  const { data: garantias = [] } = useQuery({
    queryKey: ['garantias-midia', effectiveOrgId],
    queryFn: () => base44.entities.Garantia.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });

  const getEquipoInfo = (equipoId) => {
    const equipo = equipos.find(e => e.id === equipoId);
    return equipo ? `${equipo.marca} ${equipo.modelo}` : 'Equipo desconocido';
  };

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const ventasHoy = ventas.filter(v => {
    const fechaVenta = new Date(v.created_date);
    fechaVenta.setHours(0, 0, 0, 0);
    return fechaVenta.getTime() === hoy.getTime();
  });

  const citasHoy = citas;

  const otsVencidas = todasOrdenes.filter(o => {
    if (!o.fecha_entrega_estimada) return false;
    const fechaEntrega = new Date(o.fecha_entrega_estimada);
    return fechaEntrega < hoy && !['ENTREGADA', 'CANCELADA'].includes(o.estado);
  });

  const cotizacionesPorVencer = cotizaciones
    .filter(c => c.estado === 'enviada' && c.valida_hasta)
    .sort((a, b) => new Date(a.valida_hasta) - new Date(b.valida_hasta))
    .slice(0, 5);

  const ventasSinCobrar = ventas.filter(v => 
    v.estado_pago !== 'pagada' && v.estado_pago !== 'anulada'
  ).slice(0, 5);

  // Garantías por vencer (≤15 días)
  const garantiasPorVencer = garantias.filter(g => {
    if (g.estado !== 'ACTIVA') return false;
    const hoy = new Date();
    const fin = new Date(g.fecha_fin);
    const diffDays = Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 15;
  });

  const otsColaRevision = todasOrdenes.filter(o => 
    o.estado === 'EN_COLA_REVISION'
  );

  const otsCriticas = todasOrdenes.filter(o =>
    ['PAUSADO', 'ESPERANDO'].includes(o.estado_atencion) && 
    !['ENTREGADA', 'CANCELADA'].includes(o.estado)
  );

  const otsPropias = todasOrdenes.filter(o => o.tecnico_asignado_id === user?.id);

  // Bandeja accionable para ORG_ADMIN/BRANCH_ADMIN. "Mi Día" administrativo
  // antes ocultaba por completo las OTs ASIGNADA que el técnico veía en su
  // propia bandeja.
  const otsPendientesCobroDiagnostico = todasOrdenes.filter(o =>
    o.estado === 'ASIGNADA' && !o.diagnostico_habilitado
  );
  const otsListasParaRevision = todasOrdenes.filter(o =>
    o.estado === 'ASIGNADA' && o.diagnostico_habilitado
  );
  const otsFlujoDiagnostico = [
    ...otsPendientesCobroDiagnostico,
    ...otsListasParaRevision,
  ].slice(0, 8);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-900">Mi Día</h1>
            <p className="text-slate-600">Vista operativa del día</p>
          </div>
        </div>
      </div>

      <MensajesMotivacion tipo="diaria" role={effectiveRole} />

      {otsFlujoDiagnostico.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-amber-200">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Diagnósticos por activar</h2>
              <p className="text-sm text-slate-500">Cobra la revisión o inicia el trabajo cuando ya esté habilitado.</p>
            </div>
            <Badge variant="outline" className="ml-auto border-amber-300 text-amber-700">
              {otsFlujoDiagnostico.length}
            </Badge>
          </div>

          <Card className="border-amber-200">
            <CardContent className="p-4 space-y-3">
              {otsFlujoDiagnostico.map(ot => {
                const pendienteCobro = !ot.diagnostico_habilitado;
                return (
                  <div key={ot.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{ot.codigo_ot}</p>
                        <Badge className={pendienteCobro
                          ? 'bg-amber-100 text-amber-800 border-0'
                          : 'bg-emerald-100 text-emerald-800 border-0'
                        }>
                          {pendienteCobro ? 'Pendiente de cobro' : 'Lista para iniciar'}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 truncate">
                        {getClienteName(ot.cliente_id)} · {getEquipoInfo(ot.equipo_id)}
                      </p>
                    </div>

                    {pendienteCobro ? (
                      <Link to={`${createPageUrl('PuntoVenta')}?ot_id=${ot.id}&concepto=revision_diagnostico`}>
                        <Button size="sm" className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white">
                          <CreditCard className="w-4 h-4 mr-2" />
                          Cobrar diagnóstico
                        </Button>
                      </Link>
                    ) : (
                      <Link to={`/expediente/${ot.id}`}>
                        <Button size="sm" className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white">
                          <Play className="w-4 h-4 mr-2" />
                          Abrir e iniciar
                        </Button>
                      </Link>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Aprobaciones Pendientes - CRÍTICO P0 */}
      <div className="mb-8">
        <AprobacionesPanel 
          userAccount={{ organization_id: effectiveOrgId }} 
          user={user} 
        />
      </div>

      {/* Señales de Negocio - OPERATIVO P1 */}
      <div className="mb-8">
        <SenalesNegocio 
          userAccount={{ organization_id: effectiveOrgId }} 
        />
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-red-200">
          <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-500 rounded-lg flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Prioridades del Día</h2>
        </div>
      <Card className="border-2 border-red-200 bg-red-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-red-800">
            Atención Urgente Requerida
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {otsVencidas.length === 0 && cotizacionesPorVencer.length === 0 && ventasSinCobrar.length === 0 ? (
            <p className="text-sm text-slate-500">✅ No hay prioridades urgentes</p>
          ) : (
            <>
              {otsVencidas.slice(0, 3).map(ot => (
                <Link key={ot.id} to={createPageUrl('OrdenesTrabajo')}>
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500" />
                      <div>
                        <p className="font-medium text-slate-900">{ot.codigo_ot}</p>
                        <p className="text-sm text-slate-500">{getClienteName(ot.cliente_id)} - Vencida</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">Ver OT</Button>
                  </div>
                </Link>
              ))}

              {cotizacionesPorVencer.slice(0, 2).map(cot => (
                <Link key={cot.id} to={createPageUrl('OrdenesTrabajo')}>
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-orange-500" />
                      <div>
                        <p className="font-medium text-slate-900">Cotización pendiente</p>
                        <p className="text-sm text-slate-500">
                          Vence: {cot.valida_hasta ? format(new Date(cot.valida_hasta), 'dd/MM/yyyy') : 'N/A'}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">Seguimiento</Button>
                  </div>
                  </Link>
                  ))}

                  {garantiasPorVencer.slice(0, 2).map(g => (
                  <Link key={g.id} to={createPageUrl('VentasGarantias') + '?porVencer=true'}>
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-500" />
                      <div>
                        <p className="font-medium text-slate-900">Garantía por vencer</p>
                        <p className="text-sm text-slate-500">
                          Cliente: {getClienteName(g.cliente_id)} - Vence: {format(new Date(g.fecha_fin), 'dd/MM/yyyy')}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">Ver Garantías</Button>
                  </div>
                  </Link>
                  ))}
                  </>
                  )}
                  </CardContent>
                  </Card>
                  </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-emerald-200">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-lg flex items-center justify-center">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Taller Hoy</h2>
        </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-slate-800">
            Operaciones Activas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {otsColaRevision.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Cola de Revisión ({otsColaRevision.length})</p>
              <div className="space-y-2">
                {otsColaRevision.slice(0, 3).map(ot => (
                  <Link key={ot.id} to={createPageUrl('ColaRevision')}>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                      <div>
                        <p className="font-medium text-slate-900">{ot.codigo_ot}</p>
                        <p className="text-sm text-slate-500">{getClienteName(ot.cliente_id)}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {otsCriticas.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">OTs Críticas ({otsCriticas.length})</p>
              <div className="space-y-2">
                {otsCriticas.slice(0, 3).map(ot => (
                  <Link key={ot.id} to={createPageUrl('OrdenesTrabajo')}>
                    <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors cursor-pointer">
                      <div>
                        <p className="font-medium text-slate-900">{ot.codigo_ot}</p>
                        <p className="text-sm text-slate-500">{ot.estado_atencion}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {otsPropias.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Mis OTs ({otsPropias.length})</p>
              <div className="space-y-2">
                {otsPropias.slice(0, 3).map(ot => (
                  <Link key={ot.id} to={createPageUrl('OrdenesTrabajo')}>
                    <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer">
                      <div>
                        <p className="font-medium text-slate-900">{ot.codigo_ot}</p>
                        <p className="text-sm text-slate-500">{getClienteName(ot.cliente_id)}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {otsColaRevision.length === 0 && otsCriticas.length === 0 && otsPropias.length === 0 && (
            <p className="text-sm text-slate-500">No hay OTs pendientes</p>
          )}
        </CardContent>
      </Card>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-green-200">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Ventas Hoy</h2>
        </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-slate-800">
            Registro de Ventas del Día
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ventasHoy.length > 0 ? (
            <div className="space-y-2">
              {ventasHoy.slice(0, 5).map(venta => (
                <Link key={venta.id} to={createPageUrl('PuntoVenta')}>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                    <div>
                      <p className="font-medium text-slate-900">
                        ${venta.total?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-sm text-slate-500">
                        {format(new Date(venta.created_date), 'HH:mm')}
                      </p>
                    </div>
                    <Badge variant={venta.estado_pago === 'pagada' ? 'default' : 'outline'}>
                      {venta.estado_pago}
                    </Badge>
                  </div>
                </Link>
              ))}
              <Link to={createPageUrl('PuntoVenta')}>
                <Button variant="outline" className="w-full mt-2">
                  Ir a Punto de Venta
                </Button>
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No hay ventas registradas hoy</p>
          )}
        </CardContent>
      </Card>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-blue-200">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Agenda Hoy</h2>
        </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-slate-800">
            Citas y Eventos Programados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {citasHoy.length > 0 ? (
            <div className="space-y-2">
              {citasHoy.slice(0, 5).map(cita => (
                <div key={cita.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">{cita.motivo || cita.tipo}</p>
                    <p className="text-sm text-slate-500">
                      {cita.hora_inicio} - {cita.hora_fin}
                    </p>
                  </div>
                  <Badge>{cita.estado}</Badge>
                </div>
              ))}
              <Link to={createPageUrl('Agenda')}>
                <Button variant="outline" className="w-full mt-2">
                  Ver Agenda Completa
                </Button>
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No hay citas programadas hoy</p>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
