import React, {useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {base44} from '@/api/base44Client';
import {exportExecutiveReport} from './exportExecutiveReport';

export default function ExecutiveHistory({orgId, userId, report, definitions, view}){
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const lock=useRef(false);
 const invoke=async action=>{
  const response=await base44.functions.invoke('getExecutiveReport',{action,organization_id:orgId,days:report.days,branch_id:report.branch_id});
  const data=response?.data??response;
  if(data?.ok!==true)throw new Error('Operación no confirmada');
  return data;
 };
 const history=useQuery({queryKey:['executive-history',orgId,userId,report.branch_id,report.days],queryFn:()=>invoke('history'),retry:false});
 const save=async()=>{
  if(lock.current)return;
  lock.current=true;setBusy(true);setMessage('');
  try{const data=await invoke('save_snapshot');if(!data.id)throw new Error();setMessage('Informe guardado.');await history.refetch();}
  catch{setMessage('No se confirmó el guardado. Revisá el historial antes de repetirlo.');}
  finally{lock.current=false;setBusy(false);}
 };
 return <section className="rounded-2xl border bg-white p-5 space-y-4">
 <div><h2 className="text-lg font-semibold">Historial ejecutivo</h2><p className="text-sm text-slate-500">Informes generados y guardados por el servidor bajo el ámbito actual. Hasta 20 recientes; sin programación automática.</p></div>
 <Button disabled={busy} onClick={save}>{busy?'Guardando…':'Generar y guardar informe'}</Button>
 {message&&<p role="status">{message}</p>}
 {history.isLoading?<p>Consultando historial…</p>:history.isError?<p role="alert">Historial no disponible. <Button variant="link" onClick={()=>history.refetch()}>Reintentar</Button></p>:<div className="space-y-2">
 {(history.data?.reports??[]).map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><span>{new Date(item.generated_at).toLocaleString('es-CR')}</span><Button variant="outline" onClick={()=>{try{exportExecutiveReport(item.report,definitions,view);}catch{setMessage('No se pudo exportar el informe histórico.');}}}>PDF</Button></div>)}
 {history.data?.reports?.length===0&&<p className="text-sm text-slate-500">Todavía no hay informes guardados.</p>}
 {history.data?.limited&&<p className="text-xs">Se muestran los 20 más recientes.</p>}
 </div>}
 </section>;
}
