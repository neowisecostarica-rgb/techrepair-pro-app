import React,{useState} from 'react';
import {AD_PLACEMENTS} from '@/config/adPlacements';
import WorkspaceAdSlot from './WorkspaceAdSlot';
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card';
import {Label} from '@/components/ui/label';

export default function AdPlacementPreview(){
 const [placement,setPlacement]=useState('workspace_top');
 const [format,setFormat]=useState('970x90');
 const [paid,setPaid]=useState(false);
 const [consent,setConsent]=useState(true);
 const [enabled,setEnabled]=useState(true);
 const [width,height]=format.split('x').map(Number);
 const policy={organization_id:'preview-only',eligible:true,commercial_consent:consent,paid_plan:paid,placements:{[placement]:{enabled,preview:true,width,height}}};
 return <Card><CardHeader><CardTitle>NEOWISE Ads · laboratorio visual</CardTitle><p className="text-sm text-slate-500">Simulación local de formatos y exclusiones. No guarda campañas, no consulta clientes y no activa anuncios.</p></CardHeader><CardContent className="space-y-4">
 <div className="grid gap-3 sm:grid-cols-2">
 <div><Label htmlFor="ad-placement">Ubicación</Label><select id="ad-placement" className="w-full border rounded-lg p-2" value={placement} onChange={e=>{const p=e.target.value;setPlacement(p);setFormat(AD_PLACEMENTS[p].formats[0].join('x'));}}><option value="workspace_top">Superior</option><option value="workspace_side">Lateral</option></select></div>
 <div><Label htmlFor="ad-format">Formato (px)</Label><select id="ad-format" className="w-full border rounded-lg p-2" value={format} onChange={e=>setFormat(e.target.value)}>{AD_PLACEMENTS[placement].formats.map(d=><option key={d.join('x')} value={d.join('x')}>{d.join(' × ')}</option>)}</select></div>
 </div><div className="flex flex-wrap gap-4 text-sm">
 <label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Espacio habilitado</label>
 <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Consentimiento</label>
 <label><input type="checkbox" checked={paid} onChange={e=>setPaid(e.target.checked)}/> Plan pagado</label>
 </div>
 <div className="rounded-xl border bg-slate-50 p-3"><WorkspaceAdSlot policy={policy} organizationId="preview-only" page="Dashboard" placement={placement} forcePreview={true}/><p className="text-xs text-slate-500">{!enabled||!consent||paid?'Espacio oculto: sin reserva de altura.':'Vista previa adaptable. En producción, el lateral se oculta en pantallas pequeñas.'}</p></div>
 </CardContent></Card>;
}
