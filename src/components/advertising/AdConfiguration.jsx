import React,{useState,useRef} from 'react';
import {useQuery} from '@tanstack/react-query';
import {base44} from '@/api/base44Client';
import {Button} from '@/components/ui/button';
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card';
import {AD_PLACEMENTS} from '@/config/adPlacements';

const initial=()=>({requested:false,placements:{workspace_top:{enabled:false,format:'970x90'},workspace_side:{enabled:false,format:'300x250'}}});
export default function AdConfiguration({organizations,userId}){
 const [orgId,setOrgId]=useState('');
 return <Card><CardHeader><CardTitle>Configuración comercial de espacios</CardTitle><p className="text-sm text-slate-500">Preferencias por empresa; no autorizan anuncios reales ni sustituyen consentimiento o elegibilidad contractual.</p></CardHeader><CardContent className="space-y-4">
 <label className="block text-sm">Empresa<select className="block w-full rounded border p-2 mt-1" value={orgId} onChange={e=>setOrgId(e.target.value)}><option value="">Seleccionar</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
 {orgId&&<ConfigurationEditor key={orgId+':'+userId} orgId={orgId} userId={userId}/>}
 </CardContent></Card>;
}
function ConfigurationEditor({orgId,userId}){
 const [draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false);
 const invoke=async(action,configuration)=>{const response=await base44.functions.invoke('manageAdConfiguration',{action,organization_id:orgId,configuration});const data=response?.data??response;if(data?.ok!==true)throw new Error();return data;};
 const q=useQuery({queryKey:['ads-configuration',userId,orgId],queryFn:()=>invoke('read'),retry:false});
 const v=draft??q.data?.configuration??initial();
 const disabled=busy||q.isLoading||q.isError;
 const save=async()=>{if(lock.current||disabled)return;lock.current=true;setBusy(true);setMessage('');try{const r=await invoke('save',v);if(!r.id)throw new Error();const next=await q.refetch();if(next.isError)throw new Error();setDraft(null);setMessage('Preferencias guardadas; anuncios reales desactivados.');}catch{setMessage('Guardado no confirmado. Consultá antes de repetir.');}finally{lock.current=false;setBusy(false);}};
 return <div className="space-y-3"><label className="flex gap-2 items-center"><input type="checkbox" disabled={disabled} checked={v.requested} onChange={e=>setDraft({...v,requested:e.target.checked})}/> Solicitar habilitación comercial</label>
 {Object.entries(AD_PLACEMENTS).map(([key,definition])=><div key={key} className="rounded border p-3 space-y-2"><label className="flex gap-2 items-center"><input type="checkbox" disabled={disabled} checked={v.placements[key].enabled} onChange={e=>setDraft({...v,placements:{...v.placements,[key]:{...v.placements[key],enabled:e.target.checked}}})}/>{key==='workspace_top'?'Superior':'Lateral'}</label><select aria-label="Formato" disabled={disabled} value={v.placements[key].format} className="border rounded p-2" onChange={e=>setDraft({...v,placements:{...v.placements,[key]:{...v.placements[key],format:e.target.value}}})}>{definition.formats.map(d=><option key={d.join('x')} value={d.join('x')}>{d.join(' × ')}</option>)}</select></div>)}
 <Button disabled={disabled||draft===null} onClick={save}>Guardar preferencias</Button>{q.isError&&<p role="alert">Configuración no disponible. <Button variant="link" onClick={()=>q.refetch()}>Reintentar</Button></p>}{message&&<p role="status">{message}</p>}</div>;
}
