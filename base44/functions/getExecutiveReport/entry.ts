import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from './_shared/userAuthorization.ts';
import { resolveEffectiveEntitlement } from './_shared/entitlementAuthority.ts';

const LIMIT = 500;
const DAY = 86400000;
const CLOSED = new Set(['ENTREGADA','CANCELADA']);
const result = (data, status = 200) => Response.json(data, {status});
Deno.serve(async req => {
  try {
    if (req.method !== 'POST') return result({error:'Método no permitido'},405);
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return result({error:'No autenticado'},401);
    const auth = await resolveAuthorizedContext(base44,user,{allowedRoles:['ORG_ADMIN','BRANCH_ADMIN']});
    if (!auth.ok || !['ORG_ADMIN','BRANCH_ADMIN'].includes(auth.role) || !auth.organizationId) return result({error:'Acceso denegado'},403);
    const entitlement = await resolveEffectiveEntitlement(base44,auth.organization);
    if (!entitlement || !['advanced','enterprise'].includes(entitlement.package_id) ||
      entitlement.license_status !== 'active' || entitlement.billing_status !== 'active' ||
      !entitlement.capabilities.includes('ADVANCED_ANALYTICS')) return result({error:'Disponible en Business y Corporate activos'},403);
    const body = await req.json().catch(()=>({}));
    const days = [1,7,30,90].includes(body.days) ? body.days : 7;
    if (body.organization_id && body.organization_id !== auth.organizationId) return result({error:'Organización no autorizada'},403);
    const fixed = auth.pilotBranchId || (auth.role === 'BRANCH_ADMIN' ? auth.branchId : null);
    if ((auth.role === 'BRANCH_ADMIN' || auth.pilotMode) && !fixed) return result({error:'Sucursal no autorizada'},403);
    if (fixed && body.branch_id && body.branch_id !== fixed) return result({error:'Sucursal no autorizada'},403);
    let branch = fixed || (typeof body.branch_id === 'string' && body.branch_id.trim() ? body.branch_id.trim() : null);
    if (!branch && entitlement.package_id === 'advanced') {
      const branches = await base44.asServiceRole.entities.Branch.filter({organization_id:auth.organizationId,active:true},'-created_date',500);
      if (!Array.isArray(branches) || branches.length >= 500) return result({error:'Sucursales no disponibles'},503);
      if (branches.length === 1) branch = branches[0].id;
      else return result({ok:true,requires_branch:true,branches:branches.map(x=>({id:x.id,name:x.name})),package_id:entitlement.package_id});
    }
    if (branch) {
      const branches = await base44.asServiceRole.entities.Branch.filter({id:branch,organization_id:auth.organizationId},'-created_date',1);
      if (!branches?.[0]) return result({error:'Sucursal no autorizada'},403);
    }
    const action = body.action || 'report';
    if (!['report','save_snapshot','history','save_targets','targets','schedule','save_schedule'].includes(action)) return result({error:'Acción no admitida'},400);
    const scopeKey = branch ? 'branch:'+branch : 'organization';
    const storageScope = {organization_id:auth.organizationId,scope_key:scopeKey,days};
    const entities = base44.asServiceRole.entities;
    const targetKeys = ['sales','orders','deliveries','completed_activities','blocked_activities','open_quotes'];
    if(action==='schedule'){
      const rows=await entities.ExecutiveScheduleRevision.filter(storageScope,'-created_date',1);
      if(!Array.isArray(rows))return result({error:'Configuración no disponible'},503);
      return result({ok:true,schedule:rows[0]?.schedule??null,automation_active:false});
    }
    if(action==='save_schedule'){
      const v=body.schedule;
      if(!v||typeof v.requested!=='boolean'||!['daily','weekly','monthly'].includes(v.frequency)||
        !Number.isInteger(v.weekday)||v.weekday<1||v.weekday>7||
        !Number.isInteger(v.monthday)||v.monthday<1||v.monthday>28||
        typeof v.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)||
        typeof v.timezone!=='string'||v.timezone.length>80)return result({error:'Configuración inválida'},422);
      try{new Intl.DateTimeFormat('en',{timeZone:v.timezone}).format(new Date());}catch{return result({error:'Zona horaria inválida'},422);}
      const schedule={requested:v.requested,frequency:v.frequency,weekday:v.weekday,monthday:v.monthday,time:v.time,timezone:v.timezone,delivery:'in_app'};
      const record=await entities.ExecutiveScheduleRevision.create({...storageScope,actor_id:user.id,schedule,saved_at:new Date().toISOString()});
      if(!record?.id)return result({error:'Guardado no confirmado'},503);
      return result({ok:true,id:record.id,automation_active:false});
    }
    if (action === 'targets') {
      const rows = await entities.ExecutiveTargetRevision.filter(storageScope,'-created_date',1);
      if (!Array.isArray(rows)) return result({error:'Objetivos no disponibles'},503);
      return result({ok:true,targets:rows[0]?.targets ?? {},saved_at:rows[0]?.saved_at ?? null});
    }
    if (action === 'save_targets') {
      const input=body.targets;
      if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.entries(input).some(([k,v])=>!targetKeys.includes(k)||typeof v!=='number'||!Number.isSafeInteger(v)||v<0)) return result({error:'Objetivos inválidos'},422);
      const record=await entities.ExecutiveTargetRevision.create({...storageScope,actor_id:user.id,targets:input,saved_at:new Date().toISOString()});
      if (!record?.id) return result({error:'Guardado no confirmado'},503);
      return result({ok:true,id:record.id});
    }
    if (action === 'history') {
      const rows=await entities.ExecutiveReportSnapshot.filter(storageScope,'-created_date',20);
      if (!Array.isArray(rows)) return result({error:'Historial no disponible'},503);
      return result({ok:true,reports:rows.map(r=>({id:r.id,generated_at:r.generated_at,report:r.report})),limited:rows.length===20});
    }
    const scope = {organization_id:auth.organizationId,...(branch ? {branch_id:branch} : {})};
    const now = Date.now(), start = now-days*DAY, previous = start-days*DAY;
    const read = async (entity, filter = scope) => {
      const rows = await base44.asServiceRole.entities[entity].filter(filter,'-created_date',LIMIT);
      if (!Array.isArray(rows) || rows.length >= LIMIT) return null;
      return rows;
    };
    const safeRead = async (entity,filter=scope) => {try {return await read(entity,filter);}catch{return null;}};
    const [sales,orders,quotes,expenses,customers,inventory,warranties,activities,invoices] = await Promise.all([
      safeRead('Venta'),safeRead('OrdenTrabajo'),safeRead('Cotizacion'),safeRead('Expense'),safeRead('Cliente'),safeRead('Inventario'),safeRead('Garantia'),safeRead('ActividadTecnica',{organization_id:auth.organizationId}),safeRead('PurchaseInvoice')
    ]);
    const inRange = (rows,field,from,to) => rows.filter(x=>{const n=Date.parse(x[field]);return Number.isFinite(n)&&n>=from&&n<to;});
    const pair = (rows,field,fn) => rows === null ? null : {current:fn(inRange(rows,field,start,now)),previous:fn(inRange(rows,field,previous,start))};
    const count = rows=>rows.length;
    const sum = (rows,field) => rows.every(x=>typeof x[field]==='number'&&Number.isFinite(x[field])&&x[field]>=0) ? rows.reduce((a,x)=>a+x[field],0) : null;
    // Activities inherit branch authority from their work order, not a client field.
    const orderIds = new Set((orders ?? []).map(o=>o.id));
    const scopedActivities = activities === null || orders === null ? null :
      activities.filter(a=>a.soft_deleted!==true && orderIds.has(a.orden_trabajo_id));
    const completedActivities = scopedActivities?.filter(a=>a.estado==='finalizada') ?? null;
    const invoiceBalance = invoices === null || invoices.some(i=>typeof i.total_amount!=='number'||!Number.isFinite(i.total_amount)||typeof i.paid_amount!=='number'||!Number.isFinite(i.paid_amount)||i.paid_amount<0||i.paid_amount>i.total_amount) ? null :
      invoices.reduce((acc,i)=>acc+i.total_amount-i.paid_amount,0);
    const paid = sales?.filter(x=>x.estado==='pagada') ?? null;
    const currentQuotes = quotes?.filter(x=>['borrador','enviada','aprobada'].includes(x.estado)&&x.estado_conversion!=='CONVERTIDA') ?? null;
    const report={ok:true,generated_at:new Date(now).toISOString(),days,branch_id:branch,package_id:entitlement.package_id,
      metrics:{
        sales:pair(paid,'created_date',count),revenue:pair(paid,'created_date',rows=>sum(rows,'total')),
        orders:pair(orders,'created_date',count),deliveries:pair(orders,'delivered_at',count),
        quotes:pair(quotes,'created_date',count),customers:pair(customers,'created_date',count),
        expenses:pair(expenses,'date',rows=>sum(rows,'amount')),
        completed_activities:pair(completedActivities,'ended_at',count),
        blocked_activities:scopedActivities===null?null:scopedActivities.filter(a=>a.estado==='bloqueada').length,
        supplier_balance:invoiceBalance,
        active_orders:orders===null?null:orders.filter(x=>!CLOSED.has(x.estado)).length,
        open_quotes:currentQuotes===null?null:currentQuotes.length,
        inventory_records:inventory===null?null:inventory.length,
        active_warranties:warranties===null?null:warranties.filter(x=>x.estado==='ACTIVA'&&typeof x.fecha_fin==='string'&&x.fecha_fin>=new Date(now).toISOString().slice(0,10)).length
      },
      limitations:['Saldo de proveedores según importes registrados, no conciliación bancaria.','Períodos móviles, no cierres contables.','Importes nominales; moneda histórica por documento no acreditada.','Una fuente incompleta o no disponible aparece sin indicador.','Las ventas se atribuyen a su fecha de registro, no a fecha de liquidación bancaria.']
    };
    if(action==='save_snapshot'){
      const snapshot=await entities.ExecutiveReportSnapshot.create({...storageScope,actor_id:user.id,generated_at:report.generated_at,report});
      if(!snapshot?.id)return result({error:'Informe no confirmado'},503);
      return result({ok:true,id:snapshot.id,report});
    }
    return result(report);
  } catch {return result({error:'No se pudo generar el informe'},500);}
});
