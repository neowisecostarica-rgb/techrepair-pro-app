import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const money = value => {
 if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value)) return null;
 const n = Math.round(Number(value)*100);
 return Number.isSafeInteger(n) && n>=0 ? n : null;
};
const fmt = n => (n/100).toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2});
export default function ArqueoPreliminar({sales, loading, error, branchId, singleDay}) {
 const [inputs,setInputs] = useState({opening:'',extra:'0',withdrawals:'0',counted:''});
 const labels = {opening:'Fondo inicial',extra:'Otras entradas en efectivo',withdrawals:'Retiros y gastos en efectivo',counted:'Efectivo contado'};
 const seen=new Set();
 let cash=0,uncertain=0,invalid=false;
 for(const sale of sales||[]){
  if(!sale.id||seen.has(sale.id)||sale.estado!=='pagada'||typeof sale.total!=='number'||!Number.isFinite(sale.total)||sale.total<0){invalid=true;continue;}
  seen.add(sale.id);
  const cents=Math.round(sale.total*100);
  if(!Number.isSafeInteger(cents)){invalid=true;continue;}
  if(sale.metodo_pago==='efectivo')cash+=cents;
  else if(!['tarjeta','transferencia'].includes(sale.metodo_pago))uncertain++;
 }
 const values=Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,money(v)]));
 const canCalculate=Object.values(values).every(v=>v!==null) && Number.isSafeInteger(cash) && !invalid && !error && !loading && !uncertain && !!branchId && singleDay;
 const expected=canCalculate?values.opening+cash+values.extra-values.withdrawals:null;
 const difference=expected!==null?values.counted-expected:null;
 const confirmed=expected!==null&&Number.isSafeInteger(expected)&&expected>=0&&Number.isSafeInteger(difference);
 return <Card className="border-slate-200">
 <CardHeader><CardTitle>Arqueo preliminar de efectivo</CardTitle><p className="text-sm text-slate-500">Simulación de conciliación por día y sucursal. No guarda movimientos ni cierra caja.</p></CardHeader>
 <CardContent className="space-y-4">
 {!branchId||!singleDay?<p role="status" className="text-sm text-slate-600">Seleccioná una sucursal y un único día para calcular el arqueo.</p>:loading?<p>Consultando ventas…</p>:error||invalid?<p role="alert">No se confirmó el conjunto de ventas.</p>:<>
 <p className="text-sm">Ventas registradas en efectivo: <strong>{fmt(cash)}</strong></p>
 {uncertain>0&&<p role="alert" className="text-amber-800 text-sm">{uncertain} ventas mixtas o sin método confirmado impiden calcular un saldo confiable.</p>}
 <div className="grid gap-3 sm:grid-cols-2">{Object.entries(labels).map(([key,label])=><div key={key}><Label htmlFor={'arqueo-'+key}>{label}</Label><Input id={'arqueo-'+key} inputMode="decimal" value={inputs[key]} onChange={e=>setInputs(v=>({...v,[key]:e.target.value}))}/></div>)}</div>
 {confirmed&&<div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border p-4"><p className="text-sm text-slate-500">Efectivo esperado</p><strong>{fmt(expected)}</strong></div><div className="rounded-xl border p-4"><p className="text-sm text-slate-500">{difference===0?'Conciliado':difference<0?'Faltante':'Sobrante'}</p><strong>{fmt(Math.abs(difference))}</strong></div></div>}
 {!confirmed&&!uncertain&&<p className="text-xs text-slate-500">Completá importes válidos y revisá que los retiros no superen los fondos.</p>}
 </>}
 <p className="text-xs text-slate-500">Importes nominales. Verificá moneda, fecha de cobro y movimientos antes de cualquier cierre. Los valores declarados no se almacenan.</p>
 </CardContent></Card>;
}
