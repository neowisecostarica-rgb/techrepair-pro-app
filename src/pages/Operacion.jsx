import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageGuard from '@/components/guards/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wrench, Clock, AlertTriangle, Users, FileText, Shield, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthContext } from '@/components/contexts/AuthContext';
import FiltrosOperacion from '@/components/operacion/FiltrosOperacion';
import ModalDetalleOT from '@/components/operacion/ModalDetalleOT';

export default function Operacion() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'BRANCH_ADMIN']}>
      <OperacionContent />
    </PageGuard>
  );
}

function OperacionContent() {
  const { effectiveOrgId, userAccount, effectiveRole } = useAuthContext();
  const [periodoPreset, setPeriodoPreset] = useState('mes');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [sucursalId, setSucursalId] = useState(null);
  const [tecnicoId, setTecnicoId] = useState(null);
  const [otSeleccionada, setOtSeleccionada] = useState(null);

  const isBranchAdmin = effectiveRole === 'BRANCH_ADMIN';
  const branchIdFijo = isBranchAdmin ? userAccount?.branch_id : null;

  // Calcular fechas según preset
  useEffect(() => {
    const hoy = new Date();
    let desde, hasta;

    switch (periodoPreset) {
      case 'hoy':
        desde = startOfDay(hoy);
        hasta = endOfDay(hoy);
        break;
      case 'semana':
        desde = startOfWeek(hoy, { weekStartsOn: 1 });
        hasta = endOfWeek(hoy, { weekStartsOn: 1 });
        break;
      case 'mes':
        desde = startOfMonth(hoy);
        hasta = endOfMonth(hoy);
        break;
      case 'personalizado':
        return;
      default:
        desde = subDays(hoy, 30);
        hasta = endOfDay(hoy);
    }

    setFechaDesde(desde.toISOString().split('T')[0]);
    setFechaHasta(hasta.toISOString().split('T')[0]);
  }, [periodoPreset]);

  // OTs (todas las activas del período)
  const { data: ordenesTrabajo = [], isLoading } = useQuery({
    queryKey: ['operacion-ots', effectiveOrgId, fechaDesde, fechaHasta, sucursalId, branchIdFijo, tecnicoId],
    queryFn: async () => {
      let query = { organization_id: effectiveOrgId };
      
      if (branchIdFijo) {
        query.branch_id = branchIdFijo;
      } else if (sucursalId) {
        query.branch_id = sucursalId;
      }

      if (tecnicoId) {
        query.tecnico_asignado_id = tecnicoId;
      }

      const allOTs = await base44.entities.OrdenTrabajo.filter(query);

      return allOTs.filter(ot => {
        const otFecha = new Date(ot.created_date);
        const desde = new Date(fechaDesde);
        const hasta = new Date(fechaHasta);
        hasta.setHours(23, 59, 59);
        return otFecha >= desde && otFecha <= hasta;
      });
    },
    enabled: !!effectiveOrgId && !!fechaDesde && !!fechaHasta
  });

  // Clientes
  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-op', effectiveOrgId],
    queryFn: () => base44.entities.Cliente.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId
  });

  // Técnicos
  const { data: tecnicos = [] } = useQuery({
    queryKey: ['tecnicos-op', effectiveOrgId, branchIdFijo],
    queryFn: async () => {
      let query = { organization_id: effectiveOrgId, role: 'TECHNICIAN' };
      if (branchIdFijo) {
        query.branch_id = branchIdFijo;
      }
      return await base44.entities.UserAccount.filter(query);
    },
    enabled: !!effectiveOrgId
  });

  // Sucursales
  const { data: sucursales = [] } = useQuery({
    queryKey: ['branches-op', effectiveOrgId],
    queryFn: () => base44.entities.Branch.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId && !isBranchAdmin
  });

  // Cotizaciones
  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['cotizaciones-op', effectiveOrgId, branchIdFijo, sucursalId],
    queryFn: async () => {
      let query = { organization_id: effectiveOrgId };
      if (branchIdFijo) {
        query.branch_id = branchIdFijo;
      } else if (sucursalId) {
        query.branch_id = sucursalId;
      }
      return await base44.entities.Cotizacion.filter(query);
    },
    enabled: !!effectiveOrgId
  });

  // Garantías
  const { data: garantias = [] } = useQuery({
    queryKey: ['garantias-op', effectiveOrgId],
    queryFn: () => base44.entities.Garantia.filter({
      organization_id: effectiveOrgId,
      estado: 'ACTIVA'
    }),
    enabled: !!effectiveOrgId
  });

  // Cálculos KPIs
  const otsActivas = ordenesTrabajo.filter(ot => 
    !['ENTREGADA', 'CANCELADA'].includes(ot.estado)
  );

  const ahora = new Date();
  const hace48h = new Date(ahora.getTime() - (48 * 60 * 60 * 1000));
  
  const otsDemoradas = ordenesTrabajo.filter(ot => {
    if (!['EN_REVISION', 'EN_REPARACION', 'DIAGNOSTICADA'].includes(ot.estado)) return false;
    const updatedDate = new Date(ot.updated_date);
    if (updatedDate >= hace48h) return false;
    if (ot.estado_atencion === 'PAUSADO') return false;
    return true;
  });

  const otsEnCola = ordenesTrabajo.filter(ot => ot.estado === 'EN_COLA_REVISION').length;

  const tecnicosConCarga = new Set(
    ordenesTrabajo
      .filter(ot => ot.tecnico_asignado_id && !['ENTREGADA', 'CANCELADA'].includes(ot.estado))
      .map(ot => ot.tecnico_asignado_id)
  ).size;

  const cotizacionesPendientes = cotizaciones.filter(c => c.estado === 'enviada').length;

  const hoyDate = new Date();
  const en15Dias = new Date(hoyDate.getTime() + (15 * 24 * 60 * 60 * 1000));
  const garantiasPorVencer = garantias.filter(g => {
    const fechaFin = new Date(g.fecha_fin);
    return fechaFin >= hoyDate && fechaFin <= en15Dias;
  }).length;

  // Distribución por estado
  const estadosCount = {};
  const estadosOrden = ['EN_COLA_REVISION', 'ASIGNADA', 'EN_REVISION', 'DIAGNOSTICADA', 'COTIZADA', 'EN_REPARACION', 'FINALIZADA', 'ENTREGADA'];
  estadosOrden.forEach(estado => {
    estadosCount[estado] = ordenesTrabajo.filter(ot => ot.estado === estado).length;
  });

  const dataEstados = estadosOrden
    .filter(estado => estadosCount[estado] > 0)
    .map(estado => ({
      estado: estado.replace(/_/g, ' '),
      cantidad: estadosCount[estado]
    }));

  // Top 10 OTs demoradas
  const otsDemoradasDetalle = otsDemoradas
    .map(ot => {
      const updatedDate = new Date(ot.updated_date);
      const diasDemora = Math.floor((ahora - updatedDate) / (1000 * 60 * 60 * 24));
      const cliente = clientes.find(c => c.id === ot.cliente_id);
      const tecnico = tecnicos.find(t => t.user_id === ot.tecnico_asignado_id);
      const sucursal = sucursales.find(s => s.id === ot.branch_id);
      
      return {
        ...ot,
        diasDemora,
        clienteNombre: cliente?.nombre_completo || 'Sin cliente',
        tecnicoNombre: tecnico?.user_email || 'Sin asignar',
        sucursalNombre: sucursal?.name || 'Sin sucursal'
      };
    })
    .sort((a, b) => b.diasDemora - a.diasDemora)
    .slice(0, 10);

  // Carga por técnico
  const cargaPorTecnico = {};
  ordenesTrabajo.forEach(ot => {
    if (ot.tecnico_asignado_id && !['ENTREGADA', 'CANCELADA'].includes(ot.estado)) {
      if (!cargaPorTecnico[ot.tecnico_asignado_id]) {
        cargaPorTecnico[ot.tecnico_asignado_id] = 0;
      }
      cargaPorTecnico[ot.tecnico_asignado_id]++;
    }
  });

  const dataCarga = Object.keys(cargaPorTecnico)
    .map(tecnicoId => {
      const tecnico = tecnicos.find(t => t.user_id === tecnicoId);
      return {
        tecnico: tecnico?.user_email?.split('@')[0] || 'Desconocido',
        carga: cargaPorTecnico[tecnicoId]
      };
    })
    .sort((a, b) => b.carga - a.carga);

  const estadoConfig = {
    'EN_COLA_REVISION': { color: 'bg-amber-100 text-amber-700', label: 'En Cola' },
    'ASIGNADA': { color: 'bg-blue-100 text-blue-700', label: 'Asignada' },
    'EN_REVISION': { color: 'bg-indigo-100 text-indigo-700', label: 'En Revisión' },
    'DIAGNOSTICADA': { color: 'bg-purple-100 text-purple-700', label: 'Diagnosticada' },
    'COTIZADA': { color: 'bg-yellow-100 text-yellow-700', label: 'Cotizada' },
    'EN_REPARACION': { color: 'bg-orange-100 text-orange-700', label: 'En Reparación' },
    'FINALIZADA': { color: 'bg-emerald-100 text-emerald-700', label: 'Finalizada' },
    'ENTREGADA': { color: 'bg-green-100 text-green-700', label: 'Entregada' },
  };

  const sucursalFijaNombre = isBranchAdmin && branchIdFijo
    ? (sucursales.find(s => s.id === branchIdFijo)?.name || 'Tu Sucursal')
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando métricas operativas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Operación — Dashboard Operativo</h1>
          <p className="text-slate-600">Observabilidad operativa en tiempo real (solo lectura)</p>
        </div>
        <Badge className={isBranchAdmin ? 'bg-blue-100 text-blue-700 border-0' : 'bg-emerald-100 text-emerald-700 border-0'}>
          {isBranchAdmin ? 'Tu Sucursal' : 'Vista Completa'}
        </Badge>
      </div>

      {/* Filtros */}
      <FiltrosOperacion
        periodoPreset={periodoPreset}
        onPeriodoPresetChange={setPeriodoPreset}
        fechaDesde={fechaDesde}
        fechaHasta={fechaHasta}
        onFechaDesdeChange={setFechaDesde}
        onFechaHastaChange={setFechaHasta}
        sucursalId={sucursalId}
        onSucursalChange={setSucursalId}
        sucursales={sucursales}
        mostrarSelectorSucursal={!isBranchAdmin}
        sucursalFija={sucursalFijaNombre}
        tecnicoId={tecnicoId}
        onTecnicoChange={setTecnicoId}
        tecnicos={tecnicos}
        mostrarSelectorTecnico={true}
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card className="border-0 shadow-xl bg-gradient-to-br from-blue-50 to-blue-100">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="w-5 h-5 text-blue-600" />
              <p className="text-xs text-slate-600">OTs Activas</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{otsActivas.length}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-red-50 to-red-100">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-red-600" />
              <p className="text-xs text-slate-600">Demoradas (+48h)</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{otsDemoradas.length}</p>
            <p className="text-xs text-slate-500 mt-1">Días desde última actividad</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-amber-50 to-amber-100">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <p className="text-xs text-slate-600">En Cola Revisión</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{otsEnCola}</p>
            {otsEnCola > 10 && (
              <Badge className="bg-red-200 text-red-800 border-0 text-xs mt-1">Alta carga</Badge>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-50 to-purple-100">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-purple-600" />
              <p className="text-xs text-slate-600">Técnicos Activos</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{tecnicosConCarga}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-yellow-50 to-yellow-100">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-yellow-600" />
              <p className="text-xs text-slate-600">Cotizaciones Pendientes</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{cotizacionesPendientes}</p>
            {cotizacionesPendientes > 20 && (
              <Badge className="bg-red-200 text-red-800 border-0 text-xs mt-1">Revisar</Badge>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-indigo-50 to-indigo-100">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-indigo-600" />
              <p className="text-xs text-slate-600">Garantías por Vencer</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{garantiasPorVencer}</p>
            {garantiasPorVencer > 5 && (
              <Badge className="bg-red-200 text-red-800 border-0 text-xs mt-1">Atención</Badge>
            )}
            <p className="text-xs text-slate-500 mt-1">{'<15 días'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución por Estado */}
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Distribución de OTs por Estado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dataEstados.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dataEstados} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis dataKey="estado" type="category" stroke="#64748b" style={{ fontSize: '11px' }} width={100} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="cantidad" fill="#10b981" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-400">
                <p>No hay OTs en el período</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Carga por Técnico */}
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              Carga por Técnico
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dataCarga.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dataCarga}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="tecnico" stroke="#64748b" style={{ fontSize: '11px' }} angle={-45} textAnchor="end" height={80} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="carga" fill="#6366f1" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-400">
                <p>No hay técnicos con carga activa</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabla OTs Demoradas */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-red-600" />
            Top 10 OTs Demoradas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {otsDemoradasDetalle.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Código OT</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Cliente</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Estado</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Días Demora</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Técnico</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Sucursal</th>
                  </tr>
                </thead>
                <tbody>
                  {otsDemoradasDetalle.map((ot) => {
                    const config = estadoConfig[ot.estado];
                    return (
                      <tr
                        key={ot.id}
                        className="border-t hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => setOtSeleccionada(ot)}
                      >
                        <td className="p-3 font-medium text-slate-900">{ot.codigo_ot}</td>
                        <td className="p-3 text-slate-700">{ot.clienteNombre}</td>
                        <td className="p-3">
                          <Badge className={`${config.color} border-0 text-xs`}>
                            {config.label}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <span className={`font-semibold ${ot.diasDemora > 7 ? 'text-red-600' : 'text-amber-600'}`}>
                            {ot.diasDemora} días
                          </span>
                        </td>
                        <td className="p-3 text-slate-700">{ot.tecnicoNombre}</td>
                        <td className="p-3 text-slate-700">{ot.sucursalNombre}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No hay OTs demoradas - ¡Excelente trabajo!</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Detalle */}
      {otSeleccionada && (
        <ModalDetalleOT
          ot={otSeleccionada}
          cliente={clientes.find(c => c.id === otSeleccionada.cliente_id)}
          tecnico={tecnicos.find(t => t.user_id === otSeleccionada.tecnico_asignado_id)}
          onClose={() => setOtSeleccionada(null)}
        />
      )}
    </div>
  );
}