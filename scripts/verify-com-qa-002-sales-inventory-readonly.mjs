import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRoleCapabilities } from '../base44/functions/_shared/roleCapabilities.ts';
import { projectOperationalReadResult } from '../base44/functions/operationalGateway/_shared/dataProjections.ts';
import { OPERATIONAL_ENTITY_POLICIES } from '../base44/functions/operationalGateway/_shared/operationalAuthorization.ts';
const src=readFileSync('src/pages/Inventario.jsx','utf8');
const client=readFileSync('src/api/base44Client.js','utf8');
const sample={ id:'inventory-1',organization_id:'org-a',branch_id:'branch-a',nombre:'Producto ficticio',codigo_interno:'TEST-001',cantidad_disponible:5,precio_venta:1200,costo_unitario:550,proveedor:'Proveedor secreto',punto_reorden:2 };
const sales=projectOperationalReadResult('Inventario',sample,{role:'SALES'});
assert.equal(sales.nombre,'Producto ficticio');
assert.equal(sales.cantidad_disponible,5);
assert.equal(sales.precio_venta,1200);
for(const key of ['costo_unitario','proveedor']) assert.ok(!Object.hasOwn(sales,key),key+' must stay backend-redacted');
assert.ok(OPERATIONAL_ENTITY_POLICIES.Inventario.read.includes('SALES'));
assert.ok(!OPERATIONAL_ENTITY_POLICIES.Inventario.create.includes('SALES'));
assert.ok(!OPERATIONAL_ENTITY_POLICIES.Inventario.update.includes('SALES'));
assert.ok(getRoleCapabilities('SALES').includes('INVENTORY_READ'));
assert.ok(!getRoleCapabilities('SALES').includes('INVENTORY_OPERATIONS'));
assert.ok(client.includes("'Inventario',"));
assert.ok(client.includes("operation: 'read'")&&client.includes("rawBase44.functions.invoke('operationalGateway'"));
assert.ok(src.includes("allowedRoles={['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'INVENTORY', 'SALES']}"));
assert.ok(src.includes("const isSalesReadOnly = effectiveRole === 'SALES'"));
assert.ok(src.includes("if (!isOrgAdmin) return;"));
assert.ok(src.includes("if (isOrgAdmin && e.key === 'Enter' && searchTerm)"));
for(const fragment of [
  "{!isSalesReadOnly && <th",
  "{!isSalesReadOnly && <p className=\"text-xs text-slate-500\">{t('inv.cost'",
  "{!isSalesReadOnly && <td",
  "{isOrgAdmin && <Dialog",
  "{isOrgAdmin && <ModalAjusteStock",
  "{isOrgAdmin && <QuickCreateCategoria",
  "effectiveRole === 'ORG_ADMIN' && (",
]) assert.ok(src.includes(fragment),'missing sensitive/control guard '+fragment);
const admin=projectOperationalReadResult('Inventario',sample,{role:'ORG_ADMIN'});
assert.equal(admin.costo_unitario,550,'admin cost projection preserved');
console.log('PASS COM-QA-002: SALES inventory list redacts costs at backend, hides finance and edit controls, preserves admin and tenant read policies');
