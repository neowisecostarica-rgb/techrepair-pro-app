import { base44 } from '@/api/base44Client';

/**
 * PRODUCTO DIAGNÓSTICO - SETUP AUTOMÁTICO
 * Garantiza que exista el producto estándar de diagnóstico/revisión
 * Evita duplicación mediante búsqueda previa
 */

export async function verificarOCrearProductoDiagnostico(organizationId) {
  try {
    // 1. Buscar producto existente de diagnóstico
    const categorias = await base44.entities.CategoriaInventario.filter({
      organization_id: organizationId,
      nombre: 'Servicios'
    });

    let categoriaServicios = categorias[0];

    // Crear categoría Servicios si no existe
    if (!categoriaServicios) {
      const categoryResponse = await base44.functions.invoke('createCategoriaInventario', {
        organization_id: organizationId,
        nombre: 'Servicios',
        permite_stock: false,
        permite_precio: true,
        es_vendible: true,
        activo: true
      });
      categoriaServicios = categoryResponse?.data ?? categoryResponse;
    }

    // 2. Buscar si ya existe el producto de diagnóstico
    const productosExistentes = await base44.entities.Inventario.filter({
      organization_id: organizationId,
      categoria_id: categoriaServicios.id
    });

    const productoDiagnostico = productosExistentes.find(
      p => p.nombre?.toLowerCase().includes('diagnóstico') || 
           p.nombre?.toLowerCase().includes('revisión')
    );

    if (productoDiagnostico) {
      console.log('Producto diagnóstico ya existe:', productoDiagnostico.id);
      return productoDiagnostico;
    }

    // 3. Crear producto si no existe
    const productResponse = await base44.functions.invoke('createInventoryItem', { itemData: {
      codigo_barras: null,
      sku: 'SERV-DIAG-001',
      nombre: 'Revisión / Diagnóstico',
      descripcion: 'Servicio de revisión y diagnóstico técnico',
      categoria_id: categoriaServicios.id,
      tipo_item: 'servicio_diagnostico',
      marca: null,
      modelo: null,
      cantidad_disponible: 0,
      cantidad_reservada: 0,
      ubicacion: 'otro',
      costo_unitario: 0,
      precio_venta: 10000, // Precio por defecto - ORG_ADMIN puede ajustar
      punto_reorden: 0,
      proveedor: null,
      estado: 'activo'
    } });
    const nuevoProducto = productResponse?.data?.data ?? productResponse?.data ?? productResponse;

    console.log('Producto diagnóstico creado:', nuevoProducto.id);
    return nuevoProducto;
  } catch (error) {
    console.error('Error en setup de producto diagnóstico:', error);
    throw error;
  }
}
