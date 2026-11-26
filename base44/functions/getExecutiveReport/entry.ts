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
    const days = [7,30,90].includes(body.days) ? body.days : 7;
    if (body.organization_id && body.organization_id !== auth.organizationId) return result({error:'Organización no autorizada'},403);
    const fixed = auth.pilotBranchId || (auth.role === 'BRANCH_ADMIN' ? auth.branchId : null);
    if ((auth.role === 'BRANCH_ADMIN' || auth.pilotMode) && !fixed) return result({error:'Sucursal no autorizada'},403);
    if (fixed && body.branch_id && body.branch_id !== fixed) return result({error:'Sucursal no autorizada'},403);
    const branch = fixed || (typeof body.branch_id === 'string' && body.branch_id.trim() ? body.branch_id.trim() : null);
    if (branch) {
      const branches = await base44.asServiceRole.entities.Branch.filter({id:branch,organization_id:auth.organizationId},'-created_date',1);
      if (!branches?.[0]) return result({error:'Sucursal no autorizada'},403);
    }
    const scope = {organization_id:auth.organizationId,...(branch ? {branch_id:branch} : {})};
    const now = Date.now(), start = now-days*DAY, previous = start-days*DAY;
    const read = async (entity, filter = scope) => {
      const rows = await base44.asServiceRole.entities[entity].filter(filter,'-created_date',LIMIT);
      if (!Array.isArray(rows) || rows.length >= LIMIT) return null;
      return rows;
    };
    const safeRead = async (entity,filter=scope) => {try {return await read(entity,filter);}catch{return null;}};
    const [sales,orders,quotes,expenses,customers,inventory,warranties] = await Promise.all([
      safeRead('Venta'),safeRead('OrdenTrabajo'),safeRead('Cotizacion'),safeRead('Expense'),safeRead('Cliente'),safeRead('Inventario'),safeRead('Garantia')
    ]);
    const inRange = (rows,field,from,to) => rows.filter(x=>{const n=Date.parse(x[field]);return Number.isFinite(n)&&n>=from&&n<to;});
    const pair = (rows,field,fn) => rows === null ? null : {current:fn(inRange(rows,field,start,now)),previous:fn(inRange(rows,field,previous,start))};
    const count = rows=>rows.length;
    const sum = (rows,field) => rows.every(x=>typeof x[field]==='number'&&Number.isFinite(x[field])&&x[field]>=0) ? rows.reduce((a,x)=>a+x[field],0) : null;
    const paid = sales?.filter(x=>x.estado==='pagada') ?? null;
    const currentQuotes = quotes?.filter(x=>['borrador','enviada','aprobada'].includes(x.estado)&&x.estado_conversion!=='CONVERTIDA') ?? null;
    return result({ok:true,generated_at:new Date(now).toISOString(),days,branch_id:branch,package_id:entitlement.package_id,
      metrics:{
        sales:pair(paid,'created_date',count),revenue:pair(paid,'created_date',rows=>sum(rows,'total')),
        orders:pair(orders,'created_date',count),deliveries:pair(orders,'delivered_at',count),
        quotes:pair(quotes,'created_date',count),customers:pair(customers,'created_date',count),
        expenses:pair(expenses,'date',rows=>sum(rows,'amount')),
        active_orders:orders===null?null:orders.filter(x=>!CLOSED.has(x.estado)).length,
        open_quotes:currentQuotes===null?null:currentQuotes.length,
        inventory_records:inventory===null?null:inventory.length,
        active_warranties:warranties===null?null:warranties.filter(x=>x.estado==='ACTIVA'&&typeof x.fecha_fin==='string'&&x.fecha_fin>=new Date(now).toISOString().slice(0,10)).length
      },
      limitations:['Períodos móviles, no cierres contables.','Importes nominales; moneda histórica por documento no acreditada.','Una fuente incompleta o no disponible aparece sin indicador.','Las ventas se atribuyen a su fecha de registro, no a fecha de liquidación bancaria.']
    });
  } catch {return result({error:'No se pudo generar el informe'},500);}
});
