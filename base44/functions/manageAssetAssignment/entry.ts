import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from './_shared/userAuthorization.ts';
import { appendAuditEvent } from './_shared/auditEvent.ts';
import { resolveEffectiveEntitlement } from './_shared/entitlementAuthority.ts';
const clean=(v,n=500)=>typeof v==='string'?v.trim().slice(0,n):null;
const allowedRoles=new Set(['ORG_ADMIN','BRANCH_ADMIN']);
async function one(entity,q){return (await entity.filter(q,'-created_date',1))?.[0]||null;}
Deno.serve(async req=>{
 if(req.method!=='POST') return Response.json({error:'Metodo no permitido'},{status:405});
 try{
  const base44=createClientFromRequest(req), user=await base44.auth.me(); if(!user)return Response.json({error:'No autenticado'},{status:401});
  const body=await req.json().catch(()=>({}));
  const auth=await resolveAuthorizedContext(base44,user,{organizationHint:body.organization_id||null});
  if(!auth.ok||!allowedRoles.has(auth.role)) return Response.json({error:'Administracion de activos no autorizada',code:'ASSET_ASSIGNMENT_FORBIDDEN'},{status:auth.status||403});
  const org=(await base44.asServiceRole.entities.Organization.filter({id:auth.organizationId,status:'active'},'-created_date',1))?.[0]; const entitlement=org?await resolveEffectiveEntitlement(base44,org):null; if(!entitlement?.capabilities?.includes('ENTERPRISE_ASSET_CUSTODY')) return Response.json({error:'La organización no tiene Custodia Enterprise habilitada',code:'ENTERPRISE_ENTITLEMENT_REQUIRED'},{status:403});
  const equipo=await one(base44.asServiceRole.entities.Equipo,{id:clean(body.equipo_id,160),organization_id:auth.organizationId});
  if(!equipo)return Response.json({error:'Activo no encontrado',code:'ASSET_NOT_FOUND'},{status:404});
  if(auth.role==='BRANCH_ADMIN'&&auth.branchId&&equipo.branch_id&&equipo.branch_id!==auth.branchId)return Response.json({error:'Activo fuera de la sucursal autorizada'},{status:403});
  const action=String(body.action||'').toUpperCase(), operationKey=clean(body.operation_key,160)||crypto.randomUUID();
  const existingOp=await one(base44.asServiceRole.entities.AssetAssignment,{organization_id:auth.organizationId,operation_key:operationKey});
  if(existingOp)return Response.json({success:true,assignment:existingOp,idempotent:true});
  const active=await one(base44.asServiceRole.entities.AssetAssignment,{organization_id:auth.organizationId,equipo_id:equipo.id,status:'ACTIVE'});
  if(action==='ASSIGN'){
   if(active)return Response.json({error:'El activo ya tiene una asignacion activa',code:'ASSET_ALREADY_ASSIGNED'},{status:409});
   const assigneeName=clean(body.assignee_name,240); if(!assigneeName)return Response.json({error:'Responsable requerido'},{status:422});
   const record=await base44.asServiceRole.entities.AssetAssignment.create({organization_id:auth.organizationId,branch_id:equipo.branch_id||auth.branchId||null,equipo_id:equipo.id,assignee_type:['EMPLOYEE','CONTRACTOR','DEPARTMENT','LOCATION','OTHER'].includes(body.assignee_type)?body.assignee_type:'EMPLOYEE',assignee_reference:clean(body.assignee_reference,240)||clean(body.assignee_email,254),assignee_name:assigneeName,assignee_email:clean(body.assignee_email,254),assigned_at:new Date().toISOString(),assigned_by_user_id:user.id,expected_return_at:body.expected_return_at||null,status:'ACTIVE',condition_out:clean(body.condition_out,1000),notes:clean(body.notes,2000),evidence_out:Array.isArray(body.evidence_out)?body.evidence_out.slice(0,20):[],operation_key:operationKey});
   await appendAuditEvent(base44,{eventType:'ASSET_ASSIGNMENT_COMMITTED',principalClass:auth.principalClass,actorUserId:user.id,actorPrimaryRole:auth.persistedRole,organizationId:auth.organizationId,branchId:record.branch_id,resourceType:'AssetAssignment',resourceId:record.id,commandPolicyId:'CP-ASSET-001',correlationId:operationKey,auditOperationId:`asset-assignment:${operationKey}`,operationKey,operationSemantics:{action:'ASSIGN',equipo_id:equipo.id},newState:{status:'ACTIVE',assignee_name:record.assignee_name},custodySnapshot:{equipo_id:equipo.id,assignee_name:record.assignee_name}});
   return Response.json({success:true,assignment:record,idempotent:false});
  }
  if(action==='RETURN'){
   if(!active)return Response.json({error:'El activo no tiene una asignacion activa',code:'ASSET_NOT_ASSIGNED'},{status:409});
   const updated=await base44.asServiceRole.entities.AssetAssignment.update(active.id,{status:'RETURNED',returned_at:new Date().toISOString(),returned_by_user_id:user.id,condition_in:clean(body.condition_in,1000),evidence_in:Array.isArray(body.evidence_in)?body.evidence_in.slice(0,20):[],notes:clean(body.notes,2000)||active.notes,operation_key:operationKey});
   await appendAuditEvent(base44,{eventType:'ASSET_RETURN_COMMITTED',principalClass:auth.principalClass,actorUserId:user.id,actorPrimaryRole:auth.persistedRole,organizationId:auth.organizationId,branchId:active.branch_id,resourceType:'AssetAssignment',resourceId:active.id,commandPolicyId:'CP-ASSET-001',correlationId:operationKey,auditOperationId:`asset-return:${operationKey}`,operationKey,operationSemantics:{action:'RETURN',equipo_id:equipo.id},priorState:{status:'ACTIVE'},newState:{status:'RETURNED'},custodySnapshot:{equipo_id:equipo.id,assignee_name:active.assignee_name}});
   return Response.json({success:true,assignment:updated,idempotent:false});
  }
  return Response.json({error:'Accion no soportada',code:'ASSET_ASSIGNMENT_ACTION_INVALID'},{status:400});
 }catch(error){console.error('[manageAssetAssignment]',error?.message||error);return Response.json({error:'No fue posible gestionar la asignacion del activo',code:'ASSET_ASSIGNMENT_INTERNAL_ERROR'},{status:500});}
});