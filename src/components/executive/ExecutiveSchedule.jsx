import React,{useState,useRef} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {base44} from '@/api/base44Client';

export default function ExecutiveSchedule({orgId,userId,report}){
 const [draft,setDraft]=useState(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const lock=useRef(false);
 const invoke=async(action,schedule)=>{const response=await base44.functions.invoke('getExecutiveReport',{action,organization_id:orgId,branch_id:report.branch_id,days:report.days,...(schedule?{schedule}:{})});const data=response?.data??response;if(data?.ok!==true)throw new Error();return data;};
 const q=useQuery({queryKey:['executive-schedule',orgId,userId,report.branch_id,report.days],queryFn:()=>invoke('schedule'),retry:false});
 const value=draft??q.data?.schedule??{requested:false,frequency:'weekly',weekday:1,monthday:1,time:'07:00',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'};
 const update=(key,v)=>setDraft({...value,[key]:v});
 const save=async()=>{
  if(lock.current||q.isLoading||q.isError)return;
  lock.current=true;setBusy(true);setMessage('');
  try{const r=await invoke('save_schedule',value);if(!r.id)throw new Error();const next=await q.refetch();if(next.isError)throw new Error();setDraft(null);setMessage('Preferencia guardada. La ejecución automática todavía no está habilitada.');}
  catch{setMessage('No se confirmó el guardado. Consultá antes de repetirlo.');}
  finally{lock.current=false;setBusy(false);}
 };
 const disabled=busy||q.isLoading||q.isError;
 return <section className="rounded-2xl border bg-white p-5 space-y-4">
 <div><h2 className="text-lg font-semibold">Programación de informes</h2><p className="text-sm text-slate-500">Configuración previa para entrega interna. Motor automático pendiente de activación y certificación.</p></div>
 <label className="flex items-center gap-2"><input type="checkbox" checked={value.requested} disabled={disabled} onChange={e=>update('requested',e.target.checked)}/> Solicitar informes periódicos</label>
 <div className="grid gap-3 md:grid-cols-2">
 <div><Label htmlFor="exec-frequency">Frecuencia</Label><select id="exec-frequency" className="w-full border rounded-lg p-2" value={value.frequency} disabled={disabled} onChange={e=>update('frequency',e.target.value)}><option value="daily">Diaria</option><option value="weekly">Semanal</option><option value="monthly">Mensual</option></select></div>
 {value.frequency==='weekly'&&<div><Label htmlFor="exec-weekday">Día de semana</Label><select id="exec-weekday" className="w-full border rounded-lg p-2" value={value.weekday} disabled={disabled} onChange={e=>update('weekday',Number(e.target.value))}>{['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map((d,i)=><option key={d} value={i+1}>{d}</option>)}</select></div>}
 {value.frequency==='monthly'&&<div><Label htmlFor="exec-monthday">Día del mes (1 a 28)</Label><Input id="exec-monthday" type="number" min={1} max={28} value={value.monthday} disabled={disabled} onChange={e=>update('monthday',Number(e.target.value))}/></div>}
 <div><Label htmlFor="exec-time">Hora</Label><Input id="exec-time" type="time" value={value.time} disabled={disabled} onChange={e=>update('time',e.target.value)}/></div>
 <div><Label htmlFor="exec-timezone">Zona horaria</Label><Input id="exec-timezone" value={value.timezone} disabled={disabled} onChange={e=>update('timezone',e.target.value)}/></div>
 </div>
 <Button disabled={disabled||draft===null} onClick={save}>{busy?'Guardando…':'Guardar programación'}</Button>
 {q.isError&&<p role="alert">Configuración no disponible. <Button variant="link" onClick={()=>q.refetch()}>Reintentar</Button></p>}
 {message&&<p role="status">{message}</p>}
 </section>;
}
