import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { getCanonicalBranchScope } from '../_shared/operationalAuthorization.ts';

/**
 * updateInventoryItem — Owner único para actualización de productos de inventario
 * ORT-PILOTO — Ownership Base Catálogo Inventario
 *
 * Responsabilidades:
 *  1. Auth + organization_id válido
 *  2. Cargar item actual y validar ownership
 *  3. Validar categoria_id si cambia
 *  4. Aplicar validaciones de permite_stock y es_vendible
 *  5. Validar unicidad de codigo_barras y sku (excluyendo el propio item)
 *  6. Recalcular garantia_proveedor_vence si fecha/meses cambian
 *  7. Detectar cambios críticos y crear InventarioHistorial por cada uno
 *  8. Actualizar Inventario via asServiceRole
 *  9. Retornar item actualizado
 *
 * CAMPOS CRÍTICOS CON HISTORIAL: cantidad_disponible, costo_unitario, precio_venta,
 *                                  ubicacion, estado, categoria_id
 *
 * NO hace: ajuste de stock (→ adjustInventoryStock), ventas (→ createSale),
 *          reservas OT, importaciones masivas
 */

const CAMPOS_CRITICOS = [
  'cantidad_disponible',
  'costo_unitario',
  'precio_venta',
  'ubicacion',
  'estado',
  'categoria_id',
];

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Método no permitido' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);

  // 1. AUTH
  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  const authorization = await resolveAuthorizedContext(base44, user, { allowedRoles: ['ORG_ADMIN', 'BRANCH_ADMIN', 'INVENTORY'] });
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
  const orgId = authorization.organizationId;

  // 2. PARSE BODY
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { id, updateData } = body;

  if (!id) {
    return Response.json({ error: 'id del producto es requerido' }, { status: 400 });
  }

  if (!updateData) {
    return Response.json({ error: 'updateData es requerido' }, { status: 400 });
  }

  // 3. CARGAR ITEM ACTUAL Y VALIDAR OWNERSHIP
  const invResults = await base44.asServiceRole.entities.Inventario.filter({
    id,
    organization_id: orgId,
  });

  if (!invResults || invResults.length === 0) {
    return Response.json({
      error: 'Producto no encontrado o no pertenece a esta organización',
    }, { status: 404 });
  }

  const itemActual = invResults[0];
  const branchScope = getCanonicalBranchScope(authorization);
  if (!branchScope.ok) return Response.json({ error: branchScope.error, code: branchScope.code }, { status: branchScope.status });
  if (!branchScope.organizationWide && itemActual.branch_id !== branchScope.branchId) {
    return Response.json({ error: 'El producto no pertenece a la sucursal autorizada', code: 'INVENTORY_CROSS_BRANCH_DENIED' }, { status: 403 });
  }
  delete updateData.branch_id;

  // 4. VALIDAR CATEGORÍA si se especifica
  const categoriaId = updateData.categoria_id || itemActual.categoria_id;
  const categorias = await base44.asServiceRole.entities.CategoriaInventario.filter({
    id: categoriaId,
    organization_id: orgId,
  });

  if (!categorias || categorias.length === 0) {
    return Response.json({ error: 'categoria_id inválida o no pertenece a esta organización' }, { status: 400 });
  }

  const categoria = categorias[0];

  // 5. VALIDACIONES DE CATEGORÍA
  const cantidadNueva = updateData.cantidad_disponible !== undefined
    ? parseFloat(updateData.cantidad_disponible)
    : itemActual.cantidad_disponible;

  const precioNuevo = updateData.precio_venta !== undefined
    ? parseFloat(updateData.precio_venta)
    : itemActual.precio_venta;

  if (!categoria.permite_stock && cantidadNueva > 0) {
    return Response.json({
      error: `La categoría "${categoria.nombre}" no permite stock. cantidad_disponible debe ser 0.`,
    }, { status: 400 });
  }

  if (!categoria.es_vendible && precioNuevo > 0) {
    return Response.json({
      error: `La categoría "${categoria.nombre}" no es vendible. precio_venta debe ser 0.`,
    }, { status: 400 });
  }

  if (categoria.es_vendible && precioNuevo <= 0) {
    return Response.json({
      error: `La categoría "${categoria.nombre}" requiere precio_venta mayor a 0.`,
    }, { status: 400 });
  }

  // 6. VALIDAR UNICIDAD codigo_barras (si cambia)
  if (updateData.codigo_barras && updateData.codigo_barras !== itemActual.codigo_barras) {
    const existentesCodigo = await base44.asServiceRole.entities.Inventario.filter({
      organization_id: orgId,
      codigo_barras: updateData.codigo_barras,
    });
    const conflicto = existentesCodigo.find(i => i.id !== id);
    if (conflicto) {
      return Response.json({
        error: `codigo_barras "${updateData.codigo_barras}" ya existe: ${conflicto.nombre}`,
      }, { status: 409 });
    }
  }

  // 6b. VALIDAR UNICIDAD sku (si cambia)
  if (updateData.sku && updateData.sku !== itemActual.sku) {
    const existentesSku = await base44.asServiceRole.entities.Inventario.filter({
      organization_id: orgId,
      sku: updateData.sku,
    });
    const conflictoSku = existentesSku.find(i => i.id !== id);
    if (conflictoSku) {
      return Response.json({
        error: `sku "${updateData.sku}" ya existe: ${conflictoSku.nombre}`,
      }, { status: 409 });
    }
  }

  // 7. RECALCULAR garantia_proveedor_vence si cambian fecha_compra o garantia_proveedor_meses
  const fechaCompra = updateData.fecha_compra !== undefined ? updateData.fecha_compra : itemActual.fecha_compra;
  const mesesGarantia = updateData.garantia_proveedor_meses !== undefined
    ? updateData.garantia_proveedor_meses
    : itemActual.garantia_proveedor_meses;

  let garantiaVence = itemActual.garantia_proveedor_vence || null;

  const cambioGarantia = updateData.fecha_compra !== undefined || updateData.garantia_proveedor_meses !== undefined;
  if (cambioGarantia) {
    if (fechaCompra && mesesGarantia > 0) {
      const fechaBase = new Date(fechaCompra);
      const fechaVence = new Date(fechaBase);
      fechaVence.setMonth(fechaVence.getMonth() + parseInt(mesesGarantia));
      garantiaVence = fechaVence.toISOString().split('T')[0];
    } else {
      garantiaVence = null;
    }
  }

  // 8. DETECTAR CAMBIOS CRÍTICOS Y CREAR INVENTARIOHISTORIAL
  const historialPromises = [];

  for (const campo of CAMPOS_CRITICOS) {
    const valorAnterior = itemActual[campo];
    const valorNuevo = updateData[campo] !== undefined ? updateData[campo] : valorAnterior;

    // Comparar como string para detectar cambios reales
    if (String(valorAnterior ?? '') !== String(valorNuevo ?? '')) {
      historialPromises.push(
        base44.asServiceRole.entities.InventarioHistorial.create({
          organization_id: orgId,
          inventario_id: id,
          campo,
          valor_anterior: String(valorAnterior ?? ''),
          valor_nuevo: String(valorNuevo ?? ''),
          modificado_por: user.id,
          motivo: `Actualización manual — campo: ${campo}`,
        }).catch(err => {
          console.warn(`[updateInventoryItem] InventarioHistorial falló para campo ${campo}:`, err.message);
        })
      );
    }
  }

  // Ejecutar historial de forma paralela (non-blocking si falla)
  if (historialPromises.length > 0) {
    await Promise.all(historialPromises);
  }

  // 9. CONSTRUIR PAYLOAD FINAL
  const payloadUpdate = {
    ...updateData,
    garantia_proveedor_vence: garantiaVence,
    // Respetar reglas de categoría
    cantidad_disponible: categoria.permite_stock ? cantidadNueva : 0,
    precio_venta: categoria.es_vendible ? precioNuevo : 0,
  };

  // 10. ACTUALIZAR INVENTARIO
  const itemActualizado = await base44.asServiceRole.entities.Inventario.update(id, payloadUpdate);

  // 11. RETORNAR
  return Response.json({
    success: true,
    data: itemActualizado,
    cambios_registrados: historialPromises.length,
  }, { status: 200 });
});
