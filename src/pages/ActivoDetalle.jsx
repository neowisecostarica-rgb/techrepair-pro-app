import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Laptop, User, MapPin, History, Wrench, Receipt, ShieldAlert, Recycle, ArrowRight } from 'lucide-react';

const money = n => new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(Number(n || 0));
const date = value => value ? new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium' }).format(new Date(value)) : '—';

export default function ActivoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { effectiveOrgId } = useAuthContext();

  const { data: equipos = [], isLoading } = useQuery({ queryKey: ['asset-detail', id, effectiveOrgId], queryFn: () => base44.entities.Equipo.filter({ id, organization_id: effectiveOrgId }), enabled: !!id && !!effectiveOrgId });
  const equipo = equipos[0];
  const { data: clientes = [] } = useQuery({ queryKey: ['asset-detail-owner', equipo?.cliente_id], queryFn: () => base44.entities.Cliente.filter({ id: equipo.cliente_id }), enabled: !!equipo?.cliente_id });
  const { data: ordenes = [] } = useQuery({ queryKey: ['asset-detail-workorders', id, effectiveOrgId], queryFn: () => base44.entities.OrdenTrabajo.filter({ organization_id: effectiveOrgId, equipo_id: id }), enabled: !!id && !!effectiveOrgId });
  const { data: branches = [] } = useQuery({ queryKey: ['asset-detail-branches', effectiveOrgId], queryFn: () => base44.entities.Branch.filter({ organization_id: effectiveOrgId }), enabled: !!effectiveOrgId });
  const { data: ventas = [] } = useQuery({ queryKey: ['asset-detail-sales', effectiveOrgId], queryFn: () => base44.entities.Venta.filter({ organization_id: effectiveOrgId }), enabled: !!effectiveOrgId });
  const { data: noConformidades = [] } = useQuery({ queryKey: ['asset-detail-quality', effectiveOrgId], queryFn: () => base44.entities.NoConformidad.filter({ organization_id: effectiveOrgId }), enabled: !!effectiveOrgId });
  const { data: reciclaje = [] } = useQuery({ queryKey: ['asset-detail-recycling', effectiveOrgId], queryFn: () => base44.entities.Reciclaje.filter({ organization_id: effectiveOrgId }), enabled: !!effectiveOrgId });

  if (isLoading) return <p className="text-slate-500">Cargando activo...</p>;
  if (!equipo) return <div className="max-w-xl mx-auto py-16 text-center"><h2 className="text-xl font-bold">Activo no encontrado</h2><Button variant="outline" className="mt-4" onClick={() => navigate('/Activos')}>Volver a Activos</Button></div>;

  const owner = clientes[0];
  const branchById = Object.fromEntries(branches.map(b => [b.id, b]));
  const history = [...ordenes].sort((a,b) => new Date(b.fecha_ingreso || b.created_date) - new Date(a.fecha_ingreso || a.created_date));
  const otIds = new Set(history.map(o => o.id));
  const assetSales = ventas.filter(v => otIds.has(v.referencia_ot_id) && v.estado === 'pagada');
  const totalCost = assetSales.reduce((sum, v) => sum + Number(v.total || 0), 0);
  const quality = noConformidades.filter(n => otIds.has(n.orden_trabajo_id));
  const recycling = reciclaje.filter(r => otIds.has(r.orden_trabajo_id));
  const latest = history[0];
  const currentBranch = branchById[latest?.branch_id || equipo.branch_id];
  const delivered = history.filter(o => o.estado === 'ENTREGADA').length;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate('/Activos')} className="-ml-2 text-slate-500"><ArrowLeft className="w-4 h-4 mr-1" /> Activos</Button>

      <Card className="bg-slate-950 text-white border-0 shadow-xl">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-5 lg:items-center">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center"><Laptop className="w-7 h-7" /></div>
            <div className="flex-1">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Expediente del activo</p>
              <h1 className="text-3xl font-bold mt-1">{[equipo.marca, equipo.modelo].filter(Boolean).join(' ') || equipo.tipo}</h1>
              <div className="flex flex-wrap gap-2 mt-2"><Badge className="bg-white/10 text-white border-0 capitalize">{equipo.tipo}</Badge>{equipo.serie && <Badge className="bg-white/10 text-white border-0 font-mono">Serie {equipo.serie}</Badge>}<Badge className="bg-white/10 text-white border-0">{history.length} intervenciones</Badge></div>
            </div>
            <Button onClick={() => navigate('/OrdenesTrabajo')} className="bg-white text-slate-900 hover:bg-slate-100"><Wrench className="w-4 h-4 mr-2" /> Nueva intervención</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><History className="w-4 h-4 text-slate-400 mb-2"/><p className="text-2xl font-bold">{history.length}</p><p className="text-xs text-slate-500">Intervenciones</p></CardContent></Card>
        <Card><CardContent className="p-4"><Receipt className="w-4 h-4 text-slate-400 mb-2"/><p className="text-2xl font-bold">{money(totalCost)}</p><p className="text-xs text-slate-500">Valor pagado registrado</p></CardContent></Card>
        <Card><CardContent className="p-4"><ShieldAlert className="w-4 h-4 text-slate-400 mb-2"/><p className="text-2xl font-bold">{quality.length}</p><p className="text-xs text-slate-500">Registros de calidad</p></CardContent></Card>
        <Card><CardContent className="p-4"><Recycle className="w-4 h-4 text-slate-400 mb-2"/><p className="text-2xl font-bold">{recycling.length}</p><p className="text-xs text-slate-500">Registros de disposición</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-1"><CardHeader><CardTitle className="text-base">Contexto actual</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div className="flex gap-3"><User className="w-4 h-4 text-slate-400 mt-0.5"/><div><p className="text-xs text-slate-400">Responsable / propietario</p><p className="font-semibold">{owner?.nombre_completo || 'Sin responsable visible'}</p></div></div><div className="flex gap-3"><MapPin className="w-4 h-4 text-slate-400 mt-0.5"/><div><p className="text-xs text-slate-400">Última ubicación operativa</p><p className="font-semibold">{currentBranch?.name || 'Sin ubicación confirmada'}</p></div></div><div className="flex gap-3"><Wrench className="w-4 h-4 text-slate-400 mt-0.5"/><div><p className="text-xs text-slate-400">Último estado operativo</p><p className="font-semibold">{latest?.estado || 'Sin intervenciones'}</p>{latest && <p className="text-xs text-slate-500 mt-1">{date(latest.fecha_ingreso || latest.created_date)}</p>}</div></div><div className="border-t pt-3 text-xs text-slate-500">{delivered} intervención{delivered === 1 ? '' : 'es'} entregada{delivered === 1 ? '' : 's'}.</div></CardContent></Card>

        <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Historial del activo</CardTitle></CardHeader><CardContent>{history.length === 0 ? <p className="text-sm text-slate-500 py-6 text-center">Este activo todavía no tiene intervenciones.</p> : <div className="space-y-2">{history.map(ot => { const paid = assetSales.filter(v => v.referencia_ot_id === ot.id).reduce((s,v) => s + Number(v.total || 0), 0); const q = quality.filter(n => n.orden_trabajo_id === ot.id).length; const r = recycling.filter(x => x.orden_trabajo_id === ot.id).length; return <button key={ot.id} onClick={() => navigate(`/expediente/${ot.id}`)} className="w-full text-left border rounded-xl p-4 hover:bg-slate-50 transition flex items-center gap-4"><div className="flex-1 min-w-0"><div className="flex flex-wrap gap-2 items-center"><span className="font-mono font-semibold text-sm">{ot.codigo_ot}</span><Badge variant="outline">{ot.estado}</Badge>{q > 0 && <Badge className="bg-amber-50 text-amber-700 border-0">Calidad {q}</Badge>}{r > 0 && <Badge className="bg-emerald-50 text-emerald-700 border-0">Disposición {r}</Badge>}</div><p className="text-sm text-slate-600 mt-1 truncate">{ot.motivo_ingreso || 'Intervención técnica'}</p><p className="text-xs text-slate-400 mt-1">{date(ot.fecha_ingreso || ot.created_date)} · {branchById[ot.branch_id]?.name || 'Sucursal no identificada'}{paid > 0 ? ` · ${money(paid)}` : ''}</p></div><ArrowRight className="w-4 h-4 text-slate-400 shrink-0"/></button>; })}</div>}</CardContent></Card>
      </div>
    </div>
  );
}
