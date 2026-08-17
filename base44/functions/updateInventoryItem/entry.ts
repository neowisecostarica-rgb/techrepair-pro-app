import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { getCanonicalBranchScope } from '../_shared/operationalAuthorization.ts';
import { projectInventoryAdmin } from '../_shared/dataProjections.ts';

const SOVEREIGN_FIELDS = new Set([
  'organization_id', 'branch_id', 'cantidad_disponible', 'cantidad_reservada',
  'fecha_ultimo_movimiento', 'last_sale_id', 'last_sale_operation_key',
  'last_inventory_operation_key', 'last_inventory_movement_key',
]);
const EDITABLE_FIELDS = new Set([
  'nombre', 'descripcion', 'categoria_id', 'tipo_item', 'marca', 'modelo',
  'codigo_barras', 'sku', 'ubicacion', 'costo_unitario', 'precio_venta',
  'punto_reorden', 'proveedor', 'fecha_compra', 'documento_compra',
  'garantia_proveedor_meses', 'estado', 'co2_evitado', 'valor_recuperado',
  'notas_reciclaje', 'numero_serie', 'compatibilidades',
]);

Deno.serve(async req => {
  if (req.method !== 'POST') return Response.json({ error: 'Metodo no permitido' }, { status: 405 });
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
  const authorization = await resolveAuthorizedContext(base44, user, {
    allowedRoles: ['ORG_ADMIN', 'BRANCH_ADMIN', 'INVENTORY'],
  });
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });

  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'Body invalido' }, { status: 400 }); }
  const { id, updateData } = body;
  if (!id || !updateData || typeof updateData !== 'object' || Array.isArray(updateData)) {
    return Response.json({ error: 'id y updateData son requeridos' }, { status: 400 });
  }
  const forbidden = Object.keys(updateData).filter(field => SOVEREIGN_FIELDS.has(field));
  if (forbidden.length > 0) {
    return Response.json({
      error: `Campos soberanos de inventario no editables: ${forbidden.join(', ')}`,
      code: 'INVENTORY_SOVEREIGN_FIELD_FORBIDDEN',
    }, { status: 409 });
  }
  const unknown = Object.keys(updateData).filter(field => !EDITABLE_FIELDS.has(field));
  if (unknown.length > 0) {
    return Response.json({ error: `Campos no permitidos: ${unknown.join(', ')}`, code: 'INVENTORY_FIELD_NOT_ALLOWED' }, { status: 422 });
  }

  const orgId = authorization.organizationId;
  const [current] = await base44.asServiceRole.entities.Inventario.filter({ id, organization_id: orgId }, 1);
  if (!current) return Response.json({ error: 'Producto no encontrado' }, { status: 404 });
  const scope = getCanonicalBranchScope(authorization);
  if (!scope.ok) return Response.json({ error: scope.error, code: scope.code }, { status: scope.status });
  if (!scope.organizationWide && current.branch_id !== scope.branchId) {
    return Response.json({ error: 'Producto fuera de la sucursal autorizada', code: 'INVENTORY_CROSS_BRANCH_DENIED' }, { status: 403 });
  }

  const categoryId = updateData.categoria_id || current.categoria_id;
  const [category] = await base44.asServiceRole.entities.CategoriaInventario.filter({ id: categoryId, organization_id: orgId }, 1);
  if (!category) return Response.json({ error: 'categoria_id invalida' }, { status: 400 });
  if (!category.permite_stock
    && Number(current.cantidad_disponible || 0) + Number(current.cantidad_reservada || 0) > 0) {
    return Response.json({ error: 'No se puede asignar una categoria sin stock mientras ON_HAND sea mayor a cero' }, { status: 409 });
  }
  if (updateData.nombre !== undefined && !String(updateData.nombre).trim()) {
    return Response.json({ error: 'nombre no puede quedar vacio' }, { status: 400 });
  }
  if (updateData.costo_unitario !== undefined
    && (String(updateData.costo_unitario).trim() === '' || !Number.isFinite(Number(updateData.costo_unitario)))) {
    return Response.json({ error: 'costo_unitario debe ser numerico' }, { status: 400 });
  }
  const price = Number(updateData.precio_venta ?? current.precio_venta ?? 0);
  if (!category.es_vendible && price > 0) return Response.json({ error: 'La categoria no es vendible' }, { status: 400 });
  if (category.es_vendible && (!Number.isFinite(price) || price <= 0)) {
    return Response.json({ error: 'precio_venta debe ser mayor a 0' }, { status: 400 });
  }

  for (const field of ['codigo_barras', 'sku']) {
    if (!updateData[field] || updateData[field] === current[field]) continue;
    const matches = await base44.asServiceRole.entities.Inventario.filter({ organization_id: orgId, [field]: updateData[field] }, '-created_date', 2);
    if ((matches || []).some(record => record.id !== id)) {
      return Response.json({ error: `${field} ya existe` }, { status: 409 });
    }
  }

  const payload = Object.fromEntries(Object.entries(updateData).filter(([field]) => EDITABLE_FIELDS.has(field)));
  payload.precio_venta = category.es_vendible ? price : 0;
  if (updateData.fecha_compra !== undefined || updateData.garantia_proveedor_meses !== undefined) {
    const purchaseDate = updateData.fecha_compra ?? current.fecha_compra;
    const months = Number(updateData.garantia_proveedor_meses ?? current.garantia_proveedor_meses ?? 0);
    payload.garantia_proveedor_vence = null;
    if (purchaseDate && months > 0) {
      const expiration = new Date(purchaseDate);
      expiration.setMonth(expiration.getMonth() + months);
      payload.garantia_proveedor_vence = expiration.toISOString().split('T')[0];
    }
  }
  const updated = await base44.asServiceRole.entities.Inventario.update(id, payload);
  return Response.json({ success: true, data: projectInventoryAdmin(updated) }, { status: 200 });
});
