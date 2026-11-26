import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const rules = [
 ['sales','Ventas pagadas','min'], ['orders','Órdenes recibidas','min'],
 ['deliveries','Entregas','min'],['completed_activities','Actividades completadas','min'],
 ['blocked_activities','Actividades bloqueadas','max'],['open_quotes','Cotizaciones abiertas','max'],
];
export default function ExecutiveTargets({report}) {
 const [targets,setTargets]=useState({});
 return <section className="rounded-2xl border bg-white p-5 space-y-4">
 <div><h2 className="text-lg font-semibold">Objetivos de gestión</h2><p className="text-sm text-slate-500">Comparación manual para este informe. Los objetivos no se guardan ni generan alertas automáticas.</p></div>
 <div className="grid gap-4 md:grid-cols-2">{rules.map(([key,label,direction])=>{
 const raw=report.metrics[key];const actual=raw!==null&&typeof raw==='object'?raw.current:raw;
 const value=targets[key]??'';const target=/^\d+$/.test(value)?Number(value):null;
 const valid=target!==null&&Number.isSafeInteger(target)&&Number.isFinite(actual);
 const pass=valid&&(direction==='min'?actual>=target:actual<=target);
 return <div key={key} className="rounded-xl border p-4 space-y-2"><Label htmlFor={'target-'+key}>{label} · {direction==='min'?'Meta mínima':'Máximo aceptable'}</Label><Input id={'target-'+key} inputMode="numeric" value={value} onChange={e=>setTargets(v=>({...v,[key]:e.target.value}))} placeholder="Sin objetivo"/><p className="text-sm text-slate-600">Actual: {Number.isFinite(actual)?actual:'No disponible'}</p>{valid&&<p className={pass?'text-sm text-emerald-700':'text-sm text-amber-800'}>{pass?'Dentro del objetivo':'Requiere atención'}</p>}</div>;
 })}</div></section>;
}
