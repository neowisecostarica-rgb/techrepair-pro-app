import { useI18n } from '@/i18n';
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuthContext } from '@/components/contexts/AuthContext';
import PageGuard from '@/components/guards/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { manageAssetAssignment } from '@/api/assetControl';
import { ArrowLeft, Laptop, User, MapPin, History, Wrench, Receipt, ShieldAlert, Recycle, ArrowRight, ShieldCheck, Activity, CircleDollarSign, RotateCcw, UserRoundCheck, Undo2, Camera } from 'lucide-react';

const money = n => new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(Number(n || 0));
const date = value => value ? new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium' }).format(new Date(value)) : '—';

export default function ActivoDetalle() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'TECHNICIAN', 'CUSTOMER_SERVICE']}>
      <ActivoDetalleContent />
    </PageGuard>
  );
}

function ActivoDetalleContent() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const { effectiveOrgId, effectiveRole } = useAuthContext();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canManageCustody = ['ORG_ADMIN', 'BRANCH_ADMIN'].includes(effectiveRole);
  const [custodyAction, setCustodyAction] = React.useState(null);
  const [custodyBusy, setCustodyBusy] = React.useState(false);
  const [custodyForm, setCustodyForm] = React.useState({ assignee_name:'', assignee_email:'', assignee_type:'EMPLOYEE', expected_return_at:'', condition:'', notes:'', evidence:[] });
  const canReadCommercial = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'CUSTOMER_SERVICE'].includes(effectiveRole);
  const canReadTechnicalSignals = ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'].includes(effectiveRole);

  const { data: equipos = [], isLoading } = useQuery({ queryKey: ['asset-detail', id, effectiveOrgId], queryFn: () => base44.entities.Equipo.filter({ id, organization_id: effectiveOrgId }), enabled: !!id && !!effectiveOrgId });
  const equipo = equipos[0];
  const { data: clientes = [] } = useQuery({ queryKey: ['asset-detail-owner', equipo?.cliente_id], queryFn: () => base44.entities.Cliente.filter({ id: equipo.cliente_id }), enabled: !!equipo?.cliente_id });
  const { data: ordenes = [] } = useQuery({ queryKey: ['asset-detail-workorders', id, effectiveOrgId], queryFn: () => base44.entities.OrdenTrabajo.filter({ organization_id: effectiveOrgId, equipo_id: id }), enabled: !!id && !!effectiveOrgId });
  const { data: branches = [] } = useQuery({ queryKey: ['asset-detail-branches', effectiveOrgId], queryFn: () => base44.entities.Branch.filter({ organization_id: effectiveOrgId }), enabled: !!effectiveOrgId });
  const { data: ventas = [] } = useQuery({ queryKey: ['asset-detail-sales', effectiveOrgId, effectiveRole], queryFn: () => base44.entities.Venta.filter({ organization_id: effectiveOrgId }), enabled: !!effectiveOrgId && canReadCommercial });
  const { data: garantias = [] } = useQuery({ queryKey: ['asset-detail-warranties', effectiveOrgId, effectiveRole], queryFn: () => base44.entities.Garantia.filter({ organization_id: effectiveOrgId }), enabled: !!effectiveOrgId && canReadCommercial });
  const { data: noConformidades = [] } = useQuery({ queryKey: ['asset-detail-quality', effectiveOrgId, effectiveRole], queryFn: () => base44.entities.NoConformidad.filter({ organization_id: effectiveOrgId }), enabled: !!effectiveOrgId && canReadTechnicalSignals });
  const { data: reciclaje = [] } = useQuery({ queryKey: ['asset-detail-recycling', effectiveOrgId, effectiveRole], queryFn: () => base44.entities.Reciclaje.filter({ organization_id: effectiveOrgId }), enabled: !!effectiveOrgId && canReadTechnicalSignals });
  const { data: assignments = [] } = useQuery({ queryKey: ['asset-assignments', id, effectiveOrgId], queryFn: () => base44.entities.AssetAssignment.filter({ organization_id: effectiveOrgId, equipo_id: id }, '-assigned_at', 100), enabled: !!id && !!effectiveOrgId });
  const activeAssignment = assignments.find(a => a.status === 'ACTIVE') || null;

  const uploadEvidence = async (files) => {
    const selected = Array.from(files || []).slice(0, 8);
    if (!selected.length) return;
    try {
      const urls = [];
      for (const file of selected) { const result = await base44.integrations.Core.UploadFile({ file }); if (result?.file_url) urls.push(result.file_url); }
      setCustodyForm(f => ({ ...f, evidence: [...f.evidence, ...urls].slice(0, 20) }));
    } catch (error) { toast({ variant:'destructive', title:'No se pudo subir la evidencia', description:error?.message || 'Inténtalo nuevamente.' }); }
  };

  const submitCustody = async () => {
    if (custodyAction === 'ASSIGN' && !custodyForm.assignee_name.trim()) { toast({ variant:'destructive', title:'Indica quién recibe el activo' }); return; }
    setCustodyBusy(true);
    try {
      await manageAssetAssignment({ organization_id:effectiveOrgId, equipo_id:id, action:custodyAction, operation_key:crypto.randomUUID(), ...(custodyAction === 'ASSIGN' ? { assignee_name:custodyForm.assignee_name, assignee_email:custodyForm.assignee_email, assignee_type:custodyForm.assignee_type, expected_return_at:custodyForm.expected_return_at || null, condition_out:custodyForm.condition, evidence_out:custodyForm.evidence, notes:custodyForm.notes } : { condition_in:custodyForm.condition, evidence_in:custodyForm.evidence, notes:custodyForm.notes }) });
      await queryClient.invalidateQueries({ queryKey:['asset-assignments', id, effectiveOrgId] });
      toast({ title:custodyAction === 'ASSIGN' ? 'Activo asignado' : 'Devolución registrada', description:'La custodia quedó registrada en el historial auditable.' });
      setCustodyAction(null); setCustodyForm({ assignee_name:'', assignee_email:'', assignee_type:'EMPLOYEE', expected_return_at:'', condition:'', notes:'', evidence:[] });
    } catch (error) { toast({ variant:'destructive', title:'No se pudo registrar la custodia', description:error?.message || 'La operación no se completó.' }); } finally { setCustodyBusy(false); }
  };

  if (isLoading) return <p className="text-slate-500">{t('assetDetail.loading','Cargando activo...')}</p>;
  if (!equipo) return <div className="max-w-xl mx-auto py-16 text-center"><h2 className="text-xl font-bold">{t('assetDetail.notFound','Activo no encontrado')}</h2><Button variant="outline" className="mt-4" onClick={() => navigate('/Activos')}>{t('assetDetail.back','Volver a Activos')}</Button></div>;

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
  const today = new Date().toISOString().slice(0, 10);
  const assetWarranties = canReadCommercial ? garantias.filter(g => g.origen_tipo === 'OT' && otIds.has(g.origen_id)) : [];
  const activeWarranties = assetWarranties.filter(g => g.estado === 'ACTIVA' && (!g.fecha_fin || g.fecha_fin >= today));
  const recentWindow = Date.now() - (180 * 24 * 60 * 60 * 1000);
  const recentInterventions = history.filter(o => new Date(o.fecha_ingreso || o.created_date).getTime() >= recentWindow);
  const repeatedAttention = recentInterventions.length >= 3;
  const hasQualitySignal = canReadTechnicalSignals && quality.length > 0;
  const hasDispositionEvidence = canReadTechnicalSignals && recycling.length > 0;

  const decisionSignals = [];
  if (activeWarranties.length > 0) decisionSignals.push({ icon: ShieldCheck, label: 'Garantía vigente', detail: `${activeWarranties.length} garantía${activeWarranties.length === 1 ? '' : 's'} activa${activeWarranties.length === 1 ? '' : 's'} asociada${activeWarranties.length === 1 ? '' : 's'} al historial.`, tone: 'emerald' });
  if (repeatedAttention) decisionSignals.push({ icon: RotateCcw, label: 'Atención recurrente', detail: `${recentInterventions.length} intervenciones registradas en los últimos 180 días. Conviene revisar recurrencia antes de otra intervención.`, tone: 'amber' });
  if (hasQualitySignal) decisionSignals.push({ icon: ShieldAlert, label: 'Revisar calidad', detail: `${quality.length} registro${quality.length === 1 ? '' : 's'} de calidad/no conformidad asociado${quality.length === 1 ? '' : 's'} al activo.`, tone: 'amber' });
  if (hasDispositionEvidence) decisionSignals.push({ icon: Recycle, label: 'Existe evidencia de disposición', detail: `${recycling.length} registro${recycling.length === 1 ? '' : 's'} de reciclaje/disposición en su historia. Revisar antes de volver a operar o reasignar.`, tone: 'slate' });
  if (canReadCommercial && totalCost > 0) decisionSignals.push({ icon: CircleDollarSign, label: 'Contexto económico disponible', detail: `${money(totalCost)} pagado registrado a través de intervenciones asociadas. Es contexto histórico, no una recomendación automática de reemplazo.`, tone: 'slate' });
  if (history.length > 0 && !repeatedAttention && !hasQualitySignal && !hasDispositionEvidence) decisionSignals.push({ icon: Activity, label: 'Sin señales operativas extraordinarias', detail: 'El historial visible no muestra recurrencia alta, no conformidades ni disposición registrada. Continuar seguimiento normal.', tone: 'emerald' });

  const evaluateReplacement = repeatedAttention && (hasQualitySignal || (canReadCommercial && totalCost > 0));

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate('/Activos')} className="-ml-2 text-slate-500"><ArrowLeft className="w-4 h-4 mr-1" /> {t('assets.title','Activos')}</Button>

      <Card className="bg-[#0b1220] text-white border border-slate-800 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-5 lg:items-center">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center"><Laptop className="w-7 h-7" /></div>
            <div className="flex-1">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Expediente del activo</p>
              <h1 className="text-3xl font-semibold tracking-tight mt-1">{[equipo.marca, equipo.modelo].filter(Boolean).join(' ') || equipo.tipo}</h1>
              <div className="flex flex-wrap gap-2 mt-2"><Badge className="bg-white/10 text-white border-0 capitalize">{equipo.tipo}</Badge>{equipo.serie && <Badge className="bg-white/10 text-white border-0 font-mono">Serie {equipo.serie}</Badge>}<Badge className="bg-white/10 text-white border-0">{history.length} intervenciones</Badge></div>
            </div>
            <Button onClick={() => navigate('/OrdenesTrabajo')} className="bg-white text-slate-900 hover:bg-slate-100"><Wrench className="w-4 h-4 mr-2" /> {t('assetDetail.newIntervention','Nueva intervención')}</Button>
          </div>
        </CardContent>
      </Card>

      <div className={`grid grid-cols-2 ${canReadCommercial && canReadTechnicalSignals ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3`}>
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><History className="w-4 h-4 text-slate-400 mb-2"/><p className="text-2xl font-bold">{history.length}</p><p className="text-xs text-slate-500">Intervenciones</p></CardContent></Card>
        {canReadCommercial && <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><Receipt className="w-4 h-4 text-slate-400 mb-2"/><p className="text-2xl font-bold">{money(totalCost)}</p><p className="text-xs text-slate-500">Valor pagado registrado</p></CardContent></Card>}
        {canReadTechnicalSignals && <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><ShieldAlert className="w-4 h-4 text-slate-400 mb-2"/><p className="text-2xl font-bold">{quality.length}</p><p className="text-xs text-slate-500">Registros de calidad</p></CardContent></Card>}
        {canReadTechnicalSignals && <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><Recycle className="w-4 h-4 text-slate-400 mb-2"/><p className="text-2xl font-bold">{recycling.length}</p><p className="text-xs text-slate-500">Registros de disposición</p></CardContent></Card>}
        {canReadCommercial && !canReadTechnicalSignals && <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><ShieldCheck className="w-4 h-4 text-slate-400 mb-2"/><p className="text-2xl font-bold">{activeWarranties.length}</p><p className="text-xs text-slate-500">{t('assetDetail.activeWarranties','Garantías vigentes')}</p></CardContent></Card>}
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><CardTitle className="text-base">Custodia empresarial</CardTitle><p className="text-xs text-slate-500 mt-1">Quién tiene el activo, desde cuándo y con qué evidencia.</p></div>{canManageCustody && (activeAssignment ? <Button variant="outline" onClick={()=>setCustodyAction('RETURN')}><Undo2 className="w-4 h-4 mr-2"/>Registrar devolución</Button> : <Button onClick={()=>setCustodyAction('ASSIGN')}><UserRoundCheck className="w-4 h-4 mr-2"/>Asignar activo</Button>)}</div></CardHeader>
        <CardContent>{activeAssignment ? <div className="grid gap-3 md:grid-cols-4"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Asignado a</p><p className="font-semibold mt-1">{activeAssignment.assignee_name}</p><p className="text-xs text-slate-500">{activeAssignment.assignee_email || activeAssignment.assignee_type}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Desde</p><p className="font-semibold mt-1">{date(activeAssignment.assigned_at)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Devolución prevista</p><p className="font-semibold mt-1">{date(activeAssignment.expected_return_at)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Evidencia de entrega</p><p className="font-semibold mt-1">{activeAssignment.evidence_out?.length || 0} archivo{activeAssignment.evidence_out?.length === 1 ? '' : 's'}</p></div></div> : <div className="rounded-xl border border-dashed p-5 text-center"><p className="font-medium text-slate-800">Sin asignación activa</p><p className="text-sm text-slate-500 mt-1">El activo está disponible para asignación o permanece bajo custodia de la organización.</p></div>}
        {assignments.length > 0 && <div className="mt-4 border-t pt-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('assetDetail.custodyHistory','Historial de custodia')}</p><div className="space-y-2">{assignments.map(a=><div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><div><span className="font-medium">{a.assignee_name}</span><span className="text-slate-500"> · {date(a.assigned_at)}</span></div><Badge className={a.status==='ACTIVE'?'bg-emerald-100 text-emerald-700 border-0':'bg-slate-200 text-slate-700 border-0'}>{a.status==='ACTIVE'?'Asignado':`Devuelto ${date(a.returned_at)}`}</Badge></div>)}</div></div>}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div><CardTitle className="text-base">Señales para decisión</CardTitle><p className="text-xs text-slate-500 mt-1">TRP explica la evidencia disponible; la decisión sigue siendo humana.</p></div>
            {evaluateReplacement ? <Badge className="bg-amber-100 text-amber-800 border-0">Evaluar reemplazo</Badge> : history.length > 0 ? <Badge className="bg-slate-100 text-slate-700 border-0">Seguimiento operativo</Badge> : <Badge variant="outline">Sin historial suficiente</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {decisionSignals.length === 0 ? <p className="text-sm text-slate-500">Todavía no hay evidencia suficiente para generar señales de lifecycle.</p> : <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{decisionSignals.map(({ icon: Icon, label, detail, tone }) => <div key={label} className={`rounded-xl border p-4 ${tone === 'amber' ? 'bg-amber-50 border-amber-100' : tone === 'emerald' ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}><div className="flex gap-3"><Icon className="w-4 h-4 mt-0.5 shrink-0 text-slate-600"/><div><p className="text-sm font-semibold text-slate-900">{label}</p><p className="text-xs text-slate-600 mt-1 leading-relaxed">{detail}</p></div></div></div>)}</div>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-1 border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">Contexto actual</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div className="flex gap-3"><User className="w-4 h-4 text-slate-400 mt-0.5"/><div><p className="text-xs text-slate-400">Responsable / propietario</p><p className="font-semibold">{owner?.nombre_completo || 'Sin responsable visible'}</p></div></div><div className="flex gap-3"><MapPin className="w-4 h-4 text-slate-400 mt-0.5"/><div><p className="text-xs text-slate-400">Última ubicación operativa</p><p className="font-semibold">{currentBranch?.name || 'Sin ubicación confirmada'}</p></div></div><div className="flex gap-3"><Wrench className="w-4 h-4 text-slate-400 mt-0.5"/><div><p className="text-xs text-slate-400">Último estado operativo</p><p className="font-semibold">{latest?.estado || 'Sin intervenciones'}</p>{latest && <p className="text-xs text-slate-500 mt-1">{date(latest.fecha_ingreso || latest.created_date)}</p>}</div></div><div className="border-t pt-3 text-xs text-slate-500">{delivered} intervención{delivered === 1 ? '' : 'es'} entregada{delivered === 1 ? '' : 's'}.</div></CardContent></Card>

        <Card className="lg:col-span-2 border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">{t('assetDetail.history','Historial del activo')}</CardTitle></CardHeader><CardContent>{history.length === 0 ? <p className="text-sm text-slate-500 py-6 text-center">{t('assetDetail.noHistory','Este activo todavía no tiene intervenciones.')}</p> : <div className="space-y-2">{history.map(ot => { const paid = assetSales.filter(v => v.referencia_ot_id === ot.id).reduce((s,v) => s + Number(v.total || 0), 0); const q = quality.filter(n => n.orden_trabajo_id === ot.id).length; const r = recycling.filter(x => x.orden_trabajo_id === ot.id).length; return <button key={ot.id} onClick={() => navigate(`/expediente/${ot.id}`)} className="w-full text-left border rounded-xl p-4 hover:bg-slate-50 transition flex items-center gap-4"><div className="flex-1 min-w-0"><div className="flex flex-wrap gap-2 items-center"><span className="font-mono font-semibold text-sm">{ot.codigo_ot}</span><Badge variant="outline">{ot.estado}</Badge>{q > 0 && <Badge className="bg-amber-50 text-amber-700 border-0">Calidad {q}</Badge>}{r > 0 && <Badge className="bg-emerald-50 text-emerald-700 border-0">Disposición {r}</Badge>}</div><p className="text-sm text-slate-600 mt-1 truncate">{ot.motivo_ingreso || 'Intervención técnica'}</p><p className="text-xs text-slate-400 mt-1">{date(ot.fecha_ingreso || ot.created_date)} · {branchById[ot.branch_id]?.name || 'Sucursal no identificada'}{paid > 0 ? ` · ${money(paid)}` : ''}</p></div><ArrowRight className="w-4 h-4 text-slate-400 shrink-0"/></button>; })}</div>}</CardContent></Card>
      </div>
      <Dialog open={!!custodyAction} onOpenChange={open=>{if(!open&&!custodyBusy)setCustodyAction(null)}}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{custodyAction==='ASSIGN'?'Asignar activo':'Registrar devolución'}</DialogTitle></DialogHeader><div className="space-y-4">{custodyAction==='ASSIGN'&&<><div><Label>Persona o responsable *</Label><Input className="mt-1" value={custodyForm.assignee_name} onChange={e=>setCustodyForm(f=>({...f,assignee_name:e.target.value}))} placeholder="Nombre completo"/></div><div className="grid sm:grid-cols-2 gap-3"><div><Label>Correo</Label><Input className="mt-1" type="email" value={custodyForm.assignee_email} onChange={e=>setCustodyForm(f=>({...f,assignee_email:e.target.value}))}/></div><div><Label>Devolución prevista</Label><Input className="mt-1" type="date" value={custodyForm.expected_return_at} onChange={e=>setCustodyForm(f=>({...f,expected_return_at:e.target.value}))}/></div></div></>}<div><Label>{custodyAction==='ASSIGN'?'Condición al entregar':'Condición al devolver'}</Label><Textarea className="mt-1" value={custodyForm.condition} onChange={e=>setCustodyForm(f=>({...f,condition:e.target.value}))} placeholder="Estado físico, accesorios y observaciones relevantes"/></div><div><Label>Notas</Label><Textarea className="mt-1" value={custodyForm.notes} onChange={e=>setCustodyForm(f=>({...f,notes:e.target.value}))}/></div><div><Label>Evidencia</Label><label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm text-slate-600 hover:bg-slate-50"><Camera className="w-4 h-4"/>Agregar fotos o archivos<input type="file" multiple accept="image/*,.pdf" className="hidden" onChange={e=>uploadEvidence(e.target.files)}/></label>{custodyForm.evidence.length>0&&<p className="text-xs text-slate-500 mt-1">{custodyForm.evidence.length} archivo{custodyForm.evidence.length===1?'':'s'} listo{custodyForm.evidence.length===1?'':'s'}.</p>}</div><div className="flex justify-end gap-3"><Button variant="outline" disabled={custodyBusy} onClick={()=>setCustodyAction(null)}>{t('finalI18n.cancel','Cancelar')}</Button><Button disabled={custodyBusy} onClick={submitCustody}>{custodyBusy?'Guardando…':custodyAction==='ASSIGN'?'Confirmar asignación':'Confirmar devolución'}</Button></div></div></DialogContent></Dialog>
    </div>
  );
}
