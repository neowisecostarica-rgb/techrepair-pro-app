import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { resolveAuthorizedBranch } from '../_shared/operationalAuthorization.ts';
import { executeInventoryCommand, InventoryCommandError } from '../_shared/inventoryMutationService.ts';
import { projectInventoryAdmin } from '../_shared/dataProjections.ts';

function internalCode(organizationId) {
  const org = organizationId.slice(0, 4).toUpperCase();
  const stamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PROD-${org}-${stamp}-${random}`;
}

function duplicateOutside(records, id = null) {
  return (records || []).find(record => record.id !== id) || null;
}

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
  const itemData = body.itemData;
  if (!itemData) return Response.json({ error: 'itemData es requerido' }, { status: 400 });

  const branch = await resolveAuthorizedBranch(base44, authorization, itemData.branch_id || body.branch_id, {
    allowSingleBranchFallback: true,
  });
  if (!branch.ok) return Response.json({ error: branch.error, code: branch.code }, { status: branch.status });

  const initialQuantity = Number(itemData.cantidad_disponible ?? 0);
  const cost = Number(itemData.costo_unitario);
  if (!String(itemData.nombre || '').trim()) return Response.json({ error: 'nombre es requerido' }, { status: 400 });
  if (!itemData.categoria_id) return Response.json({ error: 'categoria_id es requerido' }, { status: 400 });
  if (itemData.costo_unitario === null || itemData.costo_unitario === undefined
    || String(itemData.costo_unitario).trim() === '' || !Number.isFinite(cost)) {
    return Response.json({ error: 'costo_unitario debe ser numerico' }, { status: 400 });
  }
  if (!Number.isFinite(initialQuantity) || initialQuantity < 0) {
    return Response.json({ error: 'cantidad_disponible debe ser un numero mayor o igual a 0' }, { status: 400 });
  }
  const forbiddenCreateFields = [
    'last_sale_id', 'last_sale_operation_key',
    'last_inventory_operation_key', 'last_inventory_movement_key', 'fecha_ultimo_movimiento',
  ].filter(field => Object.hasOwn(itemData, field));
  if (Number(itemData.cantidad_reservada ?? 0) !== 0 || forbiddenCreateFields.length > 0) {
    return Response.json({
      error: 'No se permiten reservas ni marcadores fisicos al crear catalogo',
      code: 'INVENTORY_SOVEREIGN_FIELD_FORBIDDEN',
    }, { status: 409 });
  }

  const orgId = authorization.organizationId;
  const [category] = await base44.asServiceRole.entities.CategoriaInventario.filter({
    id: itemData.categoria_id,
    organization_id: orgId,
  }, 1);
  if (!category) return Response.json({ error: 'categoria_id invalida para la organizacion' }, { status: 400 });

  const salePrice = Number(itemData.precio_venta ?? 0);
  if (!category.permite_stock && initialQuantity > 0) {
    return Response.json({ error: `La categoria ${category.nombre} no permite stock` }, { status: 400 });
  }
  if (!category.es_vendible && salePrice > 0) {
    return Response.json({ error: `La categoria ${category.nombre} no es vendible` }, { status: 400 });
  }
  if (category.es_vendible && (!Number.isFinite(salePrice) || salePrice <= 0)) {
    return Response.json({ error: `La categoria ${category.nombre} requiere precio_venta mayor a 0` }, { status: 400 });
  }

  for (const field of ['codigo_barras', 'sku']) {
    if (!itemData[field]) continue;
    const duplicate = duplicateOutside(await base44.asServiceRole.entities.Inventario.filter({
      organization_id: orgId,
      [field]: itemData[field],
    }, '-created_date', 2));
    if (duplicate) return Response.json({ error: `${field} ya existe: ${duplicate.nombre}` }, { status: 409 });
  }

  let warrantyExpiration = null;
  if (itemData.fecha_compra && Number(itemData.garantia_proveedor_meses) > 0) {
    const date = new Date(itemData.fecha_compra);
    date.setMonth(date.getMonth() + Number(itemData.garantia_proveedor_meses));
    warrantyExpiration = date.toISOString().split('T')[0];
  }

  const created = await base44.asServiceRole.entities.Inventario.create({
    organization_id: orgId,
    branch_id: branch.branchId,
    nombre: itemData.nombre.trim(),
    descripcion: itemData.descripcion || null,
    categoria_id: itemData.categoria_id,
    tipo_item: itemData.tipo_item || 'producto',
    marca: itemData.marca || null,
    modelo: itemData.modelo || null,
    codigo_interno: internalCode(orgId),
    codigo_barras: itemData.codigo_barras || null,
    sku: itemData.sku || null,
    cantidad_disponible: 0,
    cantidad_reservada: 0,
    ubicacion: itemData.ubicacion || 'bodega',
    costo_unitario: cost,
    precio_venta: category.es_vendible ? salePrice : 0,
    punto_reorden: Number(itemData.punto_reorden) || 5,
    proveedor: itemData.proveedor || null,
    fecha_compra: itemData.fecha_compra || null,
    documento_compra: itemData.documento_compra || null,
    garantia_proveedor_meses: itemData.garantia_proveedor_meses || null,
    garantia_proveedor_vence: warrantyExpiration,
    estado: itemData.estado || 'activo',
    co2_evitado: Number(itemData.co2_evitado) || 0,
    valor_recuperado: Number(itemData.valor_recuperado) || 0,
    notas_reciclaje: itemData.notas_reciclaje || null,
  });
  if (!created?.id) return Response.json({ error: 'No se pudo crear el producto' }, { status: 500 });

  let finalItem = created;
  if (initialQuantity > 0) {
    const initialOperationKey = `inventory-initial:${created.id}`;
    try {
      await executeInventoryCommand(base44, {
        organizationId: orgId,
        branchId: branch.branchId,
        actorId: user.id || user.email,
        operationKey: initialOperationKey,
        referenceType: 'INVENTORY_ITEM',
        referenceId: created.id,
        reason: 'Saldo inicial al crear producto',
        movements: [{ inventoryId: created.id, movementType: 'INITIAL_BALANCE', quantity: initialQuantity }],
      });
    } catch (error) {
      const [current] = await base44.asServiceRole.entities.Inventario.filter({ id: created.id, organization_id: orgId }, 1).catch(() => []);
      const ledger = await base44.asServiceRole.entities.InventarioHistorial.filter({
        organization_id: orgId, operation_key: initialOperationKey,
      }, '-effective_at', 2).catch(() => []);
      if (current?.last_inventory_operation_key === initialOperationKey && ledger?.length === 1) {
        return Response.json({ success: true, data: projectInventoryAdmin(current), recovered: true }, { status: 201 });
      }
      // Solo se elimina una ficha confirmada en cero y sin movimiento fisico.
      if (current && Number(current.cantidad_disponible || 0) === 0
        && Number(current.cantidad_reservada || 0) === 0 && ledger?.length === 0) {
        await base44.asServiceRole.entities.Inventario.delete(created.id).catch(() => null);
      }
      const status = error instanceof InventoryCommandError ? error.status : 500;
      return Response.json({ error: error.message, code: error.code || 'INVENTORY_INITIAL_BALANCE_FAILED' }, { status });
    }
    const [reloaded] = await base44.asServiceRole.entities.Inventario.filter({ id: created.id, organization_id: orgId }, 1).catch(() => []);
    finalItem = reloaded || { ...created, cantidad_disponible: initialQuantity, cantidad_reservada: 0 };
  }
  return Response.json({ success: true, data: projectInventoryAdmin(finalItem) }, { status: 201 });
});
