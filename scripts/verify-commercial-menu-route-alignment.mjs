import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRoleCapabilities } from '../base44/functions/_shared/roleCapabilities.ts';
import { MENU_ITEMS } from '../src/config/menuConfig.js';

const routes = [
  {path:'CRM',file:'src/pages/CRM.jsx'},
  {path:'VentasCotizaciones',file:'src/pages/VentasCotizaciones.jsx'},
  {path:'Inventario',file:'src/pages/Inventario.jsx'},
  {path:'PuntoVenta',file:'src/pages/PuntoVenta.jsx'},
];
const roles=['ORG_ADMIN','BRANCH_ADMIN','TECHNICIAN','SALES','INVENTORY','CUSTOMER_SERVICE'];
const unresolved=[];
for(const route of routes){
  const src=readFileSync(route.file,'utf8');
  const match=src.match(/<PageGuard allowedRoles=\{\[([^\]]+)\]\}>/);
  assert.ok(match, route.path + ': expected an explicit PageGuard role list');
  const pageRoles=[...match[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
  const item=MENU_ITEMS.find(x=>x.path===route.path);
  assert.ok(item, route.path + ': menu item missing');
  for(const role of roles) {
    const shown=item.anyCapabilities?.some(cap=>getRoleCapabilities(role).includes(cap))??false;
    const pageAllowed=pageRoles.includes(role);
    if(shown&&!pageAllowed)unresolved.push({route:route.path,role,classification:'NAV_VISIBLE_BUT_PAGE_DENIED'});
    if(role==='SALES'&&route.path!=='Inventario')assert.ok(shown&&pageAllowed,route.path+' should be accessible for SALES');
    if(role==='ORG_ADMIN')assert.ok(shown&&pageAllowed,route.path+' should be accessible for ORG_ADMIN');
    if(role==='TECHNICIAN'&&['CRM','VentasCotizaciones','PuntoVenta'].includes(route.path))assert.ok(!shown&&!pageAllowed,'TECHNICIAN commercial privilege leak: '+route.path);
  }
}
assert.deepEqual(unresolved,[{route:'Inventario',role:'SALES',classification:'NAV_VISIBLE_BUT_PAGE_DENIED'}]);
console.log('PASS COM-QA 2026-11-03: SALES CRM/Quotes/POS, ORG_ADMIN all four, and TECHNICIAN commercial exclusions match expected guards');
console.log('KNOWN OPEN DEFECT #15: SALES Inventario shown by INVENTORY_READ but rejected by PageGuard. No authorization changed.');
