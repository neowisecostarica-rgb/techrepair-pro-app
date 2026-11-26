import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const rules = [
 ['sales','Ventas pagadas','min'], ['orders','Órdenes recibidas','min'],
 ['deliveries','Entregas','min'],['completed_activities','Actividades completadas','min'],
 ['blocked_activities','Actividades bloqueadas','max'],['open_quotes','Cotizaciones abiertas','max'],
];
export default function ExecutiveTargets({report,orgId,userId}) {
 const [draft,setDraft]=useState(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const lock=useRef(false);
 const invoke=async(action,targets)=>{const response=await base44.functions.invoke('getExecutiveReport',{action,organization_id:orgId,branch_id:report.branch_id,days:report.days,...(targets?{targets}:{})});const data=response?.data??response;if(data?.ok!==true)throw new Error();return data;};
 const query=useQuery({queryKey:['executive-targets',orgId,userId,report.branch_id,report.days],queryFn:()=>invoke('targets'),retry:false});
 const targets=draft??Object.fromEntries(Object.entries(query.data?.targets??{}).map(([k,v])=>[k,String(v)]));
 const save=async()=>{
  if(lock.current||query.isError||query.isLoading)return;
  const entries=Object.entries(targets).filter(([,v])=>v!=='');
  if(entries.some(([,v])=>!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v)))){setMessage('Revisá los objetivos: deben ser enteros no negativos.');return;}
  lock.current=true;setBusy(true);setMessage('');
  try{const result=await invoke('save_targets',Object.fromEntries(entries.map(([k,v])=>[k,Number(v)])));if(!result.id)throw new Error();const read=await query.refetch();if(read.isError)throw new Error();setDraft(null);setMessage('Objetivos guardados.');}
  catch{setMessage('No se confirmó el guardado. Consultá nuevamente antes de repetirlo.');}
  finally{lock.current=false;setBusy(false);}
 };
 return <section className="rounded-2xl border bg-white p-5 space-y-4">
 <div><h2 className="text-lg font-semibold">Objetivos de gestión</h2><p className="text-sm text-slate-500">Objetivos por empresa, ámbito y período. Las alertas se muestran al consultar el informe; no se envían notificaciones.</p></div>
 <div className="grid gap-4 md:grid-cols-2">{rules.map(([key,label,direction])=>{
 const raw=report.metrics[key];const actual=raw!==null&&typeof raw==='object'?raw.current:raw;
 const value=targets[key]??'';const target=/^\d+$/.test(value)?Number(value):null;
 const valid=target!==null&&Number.isSafeInteger(target)&&Number.isFinite(actual);
 const pass=valid&&(direction==='min'?actual>=target:actual<=target);
 return <div key={key} className="rounded-xl border p-4 space-y-2"><Label htmlFor={'target-'+key}>{label} · {direction==='min'?'Meta mínima':'Máximo aceptable'}</Label><Input id={'target-'+key} inputMode="numeric" disabled={busy||query.isLoading||query.isError} value={value} onChange={e=>setDraft({...targets,[key]:e.target.value})} placeholder="Sin objetivo"/><p className="text-sm text-slate-600">Actual: {Number.isFinite(actual)?actual:'No disponible'}</p>{valid&&<p className={pass?'text-sm text-emerald-700':'text-sm text-amber-800'}>{pass?'Dentro del objetivo':'Requiere atención'}</p>}</div>;
 })}</div><Button disabled={busy||query.isLoading||query.isError||draft===null} onClick={save}>{busy?'Guardando…':'Guardar objetivos'}</Button>{query.isError&&<p role="alert">No se pudieron consultar los objetivos. <Button variant="link" onClick={()=>query.refetch()}>Reintentar</Button></p>}{message&&<p role="status">{message}</p>}</section>;
}
