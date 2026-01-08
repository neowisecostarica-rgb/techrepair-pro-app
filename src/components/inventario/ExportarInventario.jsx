import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export default function ExportarInventario({ items, organizationName }) {
  const handleExport = () => {
    if (items.length === 0) {
      alert('No hay items para exportar');
      return;
    }

    // Preparar datos para Excel
    const data = items.map(item => ({
      SKU: item.sku || '',
      Nombre: item.nombre || '',
      Categoria: item.categoria || '',
      Stock: item.cantidad_disponible || 0,
      CostoUnitario: item.costo_unitario || 0,
      PrecioVenta: item.precio_venta || 0,
      Ubicacion: item.ubicacion || '',
      Estado: item.estado || 'activo',
      Marca: item.marca || '',
      Modelo: item.modelo || '',
      Proveedor: item.proveedor || '',
    }));

    // Convertir a CSV (Excel puede abrir CSV)
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).join(','));
    const csv = [headers, ...rows].join('\n');

    // Crear blob y descargar
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const fecha = new Date().toISOString().split('T')[0];
    const filename = `inventario_${organizationName || 'export'}_${fecha}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Button
      onClick={handleExport}
      variant="outline"
      className="gap-2"
    >
      <Download className="w-4 h-4" />
      Exportar Inventario
    </Button>
  );
}