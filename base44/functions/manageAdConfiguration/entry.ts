import {createClientFromRequest} from 'npm:@base44/sdk@0.8.25';
import {resolveAuthorizedContext} from './_shared/userAuthorization.ts';
const formats={workspace_top:['970x90','728x90','320x100','320x50'],workspace_side:['300x250','336x280','300x600']};
const reply=(data,status=200)=>Response.json(data,{status});
Deno.serve(async req=>{
 try{
 if(req.method!=='POST')return reply({error:'Método inválido'},405);
 const b=await req.json(),base=createClientFromRequest(req),user=await base.auth.me();
 if(!user)return reply({error:'No autenticado'},401);
 const auth=await resolveAuthorizedContext(base,user,{requireOrganization:false});
 if(!auth.ok||auth.role!=='SUPER_ADMIN'||!auth.isSuperAdmin||auth.isImpersonating)return reply({error:'Super Admin requerido'},403);
 if(typeof b.organization_id!=='string'||!b.organization_id)return reply({error:'Empresa requerida'},422);
 const svc=base.asServiceRole.entities;
 const org=await svc.Organization.filter({id:b.organization_id},'-created_date',2);
 if(!Array.isArray(org)||org.length!==1)return reply({error:'Empresa no encontrada'},404);
 const scope={organization_id:b.organization_id};
 if(b.action==='read'){
 const rows=await svc.AdConfigurationRevision.filter(scope,'-created_date',1);
 if(!Array.isArray(rows))return reply({error:'Configuración no confirmada'},503);
 return reply({ok:true,configuration:rows[0]?.configuration??null,active:false});
 }
 if(b.action!=='save')return reply({error:'Acción inválida'},400);
 const v=b.configuration;
 if(!v||typeof v.requested!=='boolean'||Object.keys(formats).some(k=>typeof v.placements?.[k]?.enabled!=='boolean'||!formats[k].includes(v.placements[k].format)))return reply({error:'Configuración inválida'},422);
 const configuration={requested:v.requested,placements:Object.fromEntries(Object.keys(formats).map(k=>[k,{enabled:v.placements[k].enabled,format:v.placements[k].format}]))};
 const r=await svc.AdConfigurationRevision.create({...scope,configuration,actor_id:user.id,saved_at:new Date().toISOString()});
 return r?.id?reply({ok:true,id:r.id,active:false}):reply({error:'Guardado no confirmado'},503);
 }catch{return reply({error:'Operación no confirmada'},503);}
});
