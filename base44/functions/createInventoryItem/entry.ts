import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * createInventoryItem — Owner único para creación de productos de inventario
 * ORT-PILOTO — Ownership Base Catálogo Inventario
 *
 * Responsabilidades:
 *  1. Auth + organization_id válido
 *  2. Validar categoria_id (carga CategoriaInventario)
 *  3. Aplicar validaciones de permite_stock y es_vendible
 *  4. Validar unicidad de codigo_barras y sku
 *  5. Generar codigo_interno
 *  6. Calcular garantia_proveedor_vence si aplica
 *  7. Crear Inventario via asServiceRole
 *  8. Crear InventarioHistorial inicial (CREACION_PRODUCTO)
 *  9. Retornar item creado
 *
 * NO hace: ajuste de stock, ventas, reservas OT, importaciones masivas
 */

// Genera codigo_interno: PROD-{ORG4}-{timestamp8}-{random4}
function generarCodigoInterno(organizationId) {
  const orgPrefix = organizationId.slice(0, 4).toUpperCase();
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PROD-${orgPrefix}-${timestamp}-${random}`;
}

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

  const orgId = user.organization_id || user.impersonating_org_id;
  if (!orgId) {
    return Response.json({ error: 'organization_id no resuelto para este usuario' }, { status: 403 });
  }

  const accounts = await base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id, organization_id: orgId });
  const canManageInventory = user.is_super_admin === true || accounts.some(account =>
    account.role === 'ORG_ADMIN' && account.status !== 'suspended' && account.active !== false
  );
  if (!canManageInventory) {
    return Response.json({ error: 'Acceso denegado: se requiere ORG_ADMIN para modificar inventario' }, { status: 403 });
  }

  // 2. PARSE BODY
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { itemData } = body;

  if (!itemData) {
    return Response.json({ error: 'itemData es requerido' }, { status: 400 });
  }

  // 3. VALIDACIONES BÁSICAS OBLIGATORIAS
  if (!itemData.nombre || !itemData.nombre.trim()) {
    return Response.json({ error: 'nombre es requerido' }, { status: 400 });
  }

  if (!itemData.categoria_id) {
    return Response.json({ error: 'categoria_id es requerido' }, { status: 400 });
  }

  if (itemData.costo_unitario === undefined || itemData.costo_unitario === null || isNaN(parseFloat(itemData.costo_unitario))) {
    return Response.json({ error: 'costo_unitario es requerido y debe ser numérico' }, { status: 400 });
  }

  // 4. CARGAR Y VALIDAR CATEGORÍA
  const categorias = await base44.asServiceRole.entities.CategoriaInventario.filter({
    id: itemData.categoria_id,
    organization_id: orgId,
  });

  if (!categorias || categorias.length === 0) {
    return Response.json({ error: 'categoria_id inválida o no pertenece a esta organización' }, { status: 400 });
  }

  const categoria = categorias[0];

  // 5. VALIDACIONES DE CATEGORÍA
  if (!categoria.permite_stock && itemData.cantidad_disponible > 0) {
    return Response.json({
      error: `La categoría "${categoria.nombre}" no permite stock. cantidad_disponible debe ser 0.`,
    }, { status: 400 });
  }

  if (!categoria.es_vendible && itemData.precio_venta > 0) {
    return Response.json({
      error: `La categoría "${categoria.nombre}" no es vendible. precio_venta debe ser 0.`,
    }, { status: 400 });
  }

  if (categoria.es_vendible && (!itemData.precio_venta || parseFloat(itemData.precio_venta) <= 0)) {
    return Response.json({
      error: `La categoría "${categoria.nombre}" requiere precio_venta mayor a 0.`,
    }, { status: 400 });
  }

  // 6. VALIDAR UNICIDAD codigo_barras
  if (itemData.codigo_barras) {
    const existentesCodigo = await base44.asServiceRole.entities.Inventario.filter({
      organization_id: orgId,
      codigo_barras: itemData.codigo_barras,
    });
    if (existentesCodigo && existentesCodigo.length > 0) {
      return Response.json({
        error: `codigo_barras "${itemData.codigo_barras}" ya existe en inventario: ${existentesCodigo[0].nombre}`,
      }, { status: 409 });
    }
  }

  // 6b. VALIDAR UNICIDAD sku
  if (itemData.sku) {
    const existentesSku = await base44.asServiceRole.entities.Inventario.filter({
      organization_id: orgId,
      sku: itemData.sku,
    });
    if (existentesSku && existentesSku.length > 0) {
      return Response.json({
        error: `sku "${itemData.sku}" ya existe en inventario: ${existentesSku[0].nombre}`,
      }, { status: 409 });
    }
  }

  // 7. GENERAR codigo_interno
  const codigoInterno = generarCodigoInterno(orgId);

  // 8. CALCULAR garantia_proveedor_vence
  let garantiaVence = null;
  if (itemData.fecha_compra && itemData.garantia_proveedor_meses > 0) {
    const fechaCompra = new Date(itemData.fecha_compra);
    const fechaVence = new Date(fechaCompra);
    fechaVence.setMonth(fechaVence.getMonth() + parseInt(itemData.garantia_proveedor_meses));
    garantiaVence = fechaVence.toISOString().split('T')[0];
  }

  // 9. CREAR INVENTARIO
  const itemFinal = {
    organization_id: orgId,
    nombre: itemData.nombre.trim(),
    descripcion: itemData.descripcion || null,
    categoria_id: itemData.categoria_id,
    tipo_item: itemData.tipo_item || 'producto',
    marca: itemData.marca || null,
    modelo: itemData.modelo || null,
    codigo_interno: codigoInterno,
    codigo_barras: itemData.codigo_barras || null,
    sku: itemData.sku || null,
    cantidad_disponible: categoria.permite_stock ? (parseFloat(itemData.cantidad_disponible) || 0) : 0,
    cantidad_reservada: 0,
    ubicacion: itemData.ubicacion || 'bodega',
    costo_unitario: parseFloat(itemData.costo_unitario) || 0,
    precio_venta: categoria.es_vendible ? (parseFloat(itemData.precio_venta) || 0) : 0,
    punto_reorden: parseFloat(itemData.punto_reorden) || 5,
    proveedor: itemData.proveedor || null,
    fecha_compra: itemData.fecha_compra || null,
    documento_compra: itemData.documento_compra || null,
    garantia_proveedor_meses: itemData.garantia_proveedor_meses || null,
    garantia_proveedor_vence: garantiaVence,
    estado: itemData.estado || 'activo',
    co2_evitado: parseFloat(itemData.co2_evitado) || 0,
    valor_recuperado: parseFloat(itemData.valor_recuperado) || 0,
    notas_reciclaje: itemData.notas_reciclaje || null,
  };

  const itemCreado = await base44.asServiceRole.entities.Inventario.create(itemFinal);

  if (!itemCreado || !itemCreado.id) {
    return Response.json({ error: 'Error al crear el producto en inventario' }, { status: 500 });
  }

  // 10. CREAR INVENTARIOHISTORIAL INICIAL
  try {
    await base44.asServiceRole.entities.InventarioHistorial.create({
      organization_id: orgId,
      inventario_id: itemCreado.id,
      campo: 'CREACION_PRODUCTO',
      valor_anterior: null,
      valor_nuevo: JSON.stringify({
        nombre: itemFinal.nombre,
        codigo_interno: codigoInterno,
        costo_unitario: itemFinal.costo_unitario,
        precio_venta: itemFinal.precio_venta,
        cantidad_disponible: itemFinal.cantidad_disponible,
        categoria_id: itemFinal.categoria_id,
      }),
      modificado_por: user.id,
      motivo: 'CREACION_PRODUCTO',
    });
  } catch (histError) {
    // Non-blocking: el producto ya fue creado, loguear pero no revertir
    console.warn('[createInventoryItem] InventarioHistorial inicial falló (non-blocking):', histError.message);
  }

  // 11. RETORNAR
  return Response.json({
    success: true,
    data: itemCreado,
  }, { status: 201 });
});
