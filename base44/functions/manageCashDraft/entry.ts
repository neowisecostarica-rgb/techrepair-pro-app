import {createClientFromRequest} from 'npm:@base44/sdk@0.8.25';
import {resolveAuthorizedContext} from './_shared/userAuthorization.ts';
const reply=(data,status=200)=>Response.json(data,{status});
Deno.serve(async req=>{
 try{
 if(req.method!=='POST')return reply({error:'Método inválido'},405);
 const b=await req.json(),base=createClientFromRequest(req),user=await base.auth.me();
 if(!user)return reply({error:'No autenticado'},401);
 const auth=await resolveAuthorizedContext(base,user,{organizationHint:b.organization_id,allowedRoles:['ORG_ADMIN','BRANCH_ADMIN']});
 if(!auth.ok||!auth.organizationId||!['ORG_ADMIN','BRANCH_ADMIN'].includes(auth.role)||auth.isSuperAdmin)return reply({error:'Acceso denegado'},403);
 const fixed=auth.pilotBranchId||(auth.role==='BRANCH_ADMIN'?auth.branchId:null);
 if((auth.role==='BRANCH_ADMIN'||auth.pilotMode)&&!fixed||fixed&&fixed!==b.branch_id)return reply({error:'Sucursal no autorizada'},403);
 if(typeof b.branch_id!=='string'||!b.branch_id||typeof b.business_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.business_date)||!Number.isFinite(Date.parse(b.business_date))||new Date(b.business_date).toISOString().slice(0,10)!==b.business_date)return reply({error:'Ámbito inválido'},422);
 const svc=base.asServiceRole.entities;
 const branches=await svc.Branch.filter({id:b.branch_id,organization_id:auth.organizationId,active:true},'-created_date',2);
 if(!Array.isArray(branches)||branches.length!==1)return reply({error:'Sucursal no autorizada'},403);
 const scope={organization_id:auth.organizationId,branch_id:b.branch_id,business_date:b.business_date};
 if(b.action==='read'){
 const rows=await svc.CashCountDraft.filter(scope,'-created_date',20);
 if(!Array.isArray(rows))return reply({error:'Historial no confirmado'},503);
 return reply({ok:true,drafts:rows.map(r=>({id:r.id,saved_at:r.saved_at,declared:r.declared})),limited:rows.length===20});
 }
 if(b.action!=='save')return reply({error:'Solo borradores; cierre no habilitado'},409);
 const keys=['opening','extra','withdrawals','counted'];
 if(!b.declared||keys.some(k=>!Number.isSafeInteger(b.declared[k])||b.declared[k]<0))return reply({error:'Importes inválidos'},422);
 const declared=Object.fromEntries(keys.map(k=>[k,b.declared[k]]));
 const row=await svc.CashCountDraft.create({...scope,declared,actor_id:user.id,saved_at:new Date().toISOString()});
 return row?.id?reply({ok:true,id:row.id}):reply({error:'Guardado no confirmado'},503);
 }catch{return reply({error:'No se pudo confirmar el borrador'},503);}
});
