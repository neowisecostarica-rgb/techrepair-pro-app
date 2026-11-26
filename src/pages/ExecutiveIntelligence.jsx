import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuthContext } from '@/components/contexts/AuthContext';
import PageGuard from '@/components/guards/PageGuard';
import { Button } from '@/components/ui/button';
import ExecutiveSchedule from '@/components/executive/ExecutiveSchedule';
import ExecutiveHistory from '@/components/executive/ExecutiveHistory';
import ExecutiveTargets from '@/components/executive/ExecutiveTargets';
import { exportExecutiveReport } from '@/components/executive/exportExecutiveReport';

const definitions = [
 ['revenue','Ingresos registrados','money','CFO'],['expenses','Gastos registrados','money','CFO'],
 ['sales','Ventas pagadas','count','CEO'],['quotes','Cotizaciones creadas','count','CEO'],['customers','Clientes nuevos','count','CEO'],
 ['orders','Órdenes recibidas','count','Gerencia'],['deliveries','Entregas registradas','count','Gerencia'],
 ['active_orders','Órdenes sin entrega o cancelación','count','Gerencia'],['open_quotes','Cotizaciones abiertas','count','CEO'],
 ['completed_activities','Actividades completadas','count','Gerencia'],['blocked_activities','Actividades bloqueadas','count','Gerencia'],['supplier_balance','Saldo registrado de proveedores','money','CFO'],
 ['inventory_records','Registros de inventario','count','Gerencia'],['active_warranties','Garantías activas','count','Gerencia']
];
const fmt = (n,kind) => typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('es-CR',{maximumFractionDigits:kind==='money'?2:0}) : 'No disponible';
export default function ExecutiveIntelligence(){
 return <PageGuard allowedRoles={['ORG_ADMIN','BRANCH_ADMIN']}><ExecutiveContent/></PageGuard>;
}
function ExecutiveContent(){
 const {effectiveOrgId,effectiveRole,user,userAccount,capabilities} = useAuthContext();
 const [days,setDays]=useState(7);
 const [view,setView]=useState('General');
 const [branch,setBranch]=useState('');
 const [exportError,setExportError]=useState('');
 const enabled=!!effectiveOrgId && capabilities.includes('ADVANCED_ANALYTICS');
 const q=useQuery({
  queryKey:['executive-report',effectiveOrgId,effectiveRole,user?.id,userAccount?.branch_id,days,branch],
  enabled,retry:false,staleTime:60000,
  queryFn:async()=>{
   const response=await base44.functions.invoke('getExecutiveReport',{days,organization_id:effectiveOrgId,...(branch?{branch_id:branch}:{})});
   const data=response?.data??response;
   if(data?.ok!==true||(!data.metrics&&!data.requires_branch)) throw new Error(data?.error||'No se confirmó el informe');
   return data;
  }
 });
 return <div className="space-y-6 max-w-7xl mx-auto">
  <section className="rounded-3xl bg-[#0b1422] text-white p-6 md:p-9">
   <p className="text-xs tracking-widest uppercase text-teal-300">TRP · Executive Intelligence</p>
   <h1 className="text-3xl md:text-4xl font-semibold mt-3">El control de tu negocio.</h1>
   <p className="text-slate-300 mt-2">Dirección estratégica, financiera y operativa en un solo lugar.</p>
  </section>
  {!enabled?<p role="alert">Disponible para administradores con acceso Business o Corporate.</p>:<>
   <div className="flex flex-wrap gap-2" aria-label="Período">{[1,7,30,90].map(d=><Button key={d} variant={days===d?'default':'outline'} onClick={()=>setDays(d)}>{d===1?"Últimas 24 horas":`Últimos ${d} días`}</Button>)}</div>
   <div className="flex flex-wrap gap-2" aria-label="Perspectiva">{['General','CEO','CFO','Gerencia'].map(v=><Button key={v} variant={view===v?'default':'outline'} onClick={()=>setView(v)}>{v}</Button>)}</div>
   {q.isLoading?<p>Preparando informe…</p>:q.isError?<div role="alert">No se pudo confirmar el informe o el acceso comercial. <Button variant="link" onClick={()=>q.refetch()}>Reintentar</Button></div>:q.data?.requires_branch?<section className="rounded-xl border p-5"><p>Seleccioná una sucursal para consultar el informe Business.</p><select className="mt-3 border rounded-lg p-2" value={branch} onChange={e=>setBranch(e.target.value)}><option value="">Seleccionar sucursal</option>{q.data.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></section>:q.data&&<>
    <Button variant="outline" onClick={()=>{try{setExportError('');exportExecutiveReport(q.data,definitions,view);}catch{setExportError('No se pudo generar el PDF.');}}}>Descargar informe PDF</Button>
    {exportError&&<p role="alert">{exportError}</p>}
    {branch&&<Button variant="outline" onClick={()=>setBranch('')}>Cambiar sucursal</Button>}
    <p className="text-sm text-slate-500">Actualizado: {new Date(q.data.generated_at).toLocaleString('es-CR')} · {q.data.branch_id?'Sucursal autorizada':'Organización'}</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
     {definitions.filter(d=>view==='General'||d[3]===view).map(([key,label,kind,section])=>{
      const item=q.data.metrics[key];const paired=item!==null&&typeof item==='object';
      return <article key={key} className="bg-white border border-slate-200 rounded-2xl p-5"><p className="text-xs uppercase tracking-wider text-teal-700">{section}</p><h2 className="text-sm text-slate-600 mt-2">{label}</h2><p className="text-2xl font-semibold mt-2 tabular-nums">{fmt(paired?item.current:item,kind)}</p>{paired&&<p className="text-xs text-slate-500 mt-2">Período anterior: {fmt(item.previous,kind)}</p>}{!paired&&<p className="text-xs text-slate-500 mt-2">Estado actual, no histórico.</p>}</article>;
     })}
    </div>
    <ExecutiveTargets key={effectiveOrgId+":"+q.data.branch_id+":"+days} report={q.data} orgId={effectiveOrgId} userId={user?.id}/>
    <ExecutiveSchedule key={effectiveOrgId+":"+q.data.branch_id+":"+days} orgId={effectiveOrgId} userId={user?.id} report={q.data}/>
    <ExecutiveHistory key={effectiveOrgId+":"+q.data.branch_id+":"+days} orgId={effectiveOrgId} userId={user?.id} report={q.data} definitions={definitions} view={view}/>
    <section className="text-xs text-slate-500 space-y-1">{q.data.limitations.map(note=><p key={note}>{note}</p>)}</section>
   </>}
  </>}
 </div>;
}
