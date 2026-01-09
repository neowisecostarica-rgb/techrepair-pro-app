import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, XCircle, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ImportarInventario({ effectiveOrgId, effectiveRole, userEmail, onImportSuccess }) {
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1); // 1: upload, 2: preview, 3: confirming
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Solo ADMIN puede ver este botón
  if (!['ORG_ADMIN', 'BRANCH_ADMIN'].includes(effectiveRole)) {
    return null;
  }

  const descargarPlantilla = () => {
    const plantilla = [
      'CodigoBarras*,SKU,Nombre*,Categoria*,Stock,CostoUnitario*,PrecioVenta*,Ubicacion,Estado',
      '7501234567890,SKU-001,Pantalla LCD 15.6",repuesto,10,25000.00,45000.00,bodega,activo',
      '7501234567891,SKU-002,Teclado USB,accesorio,25,3500.00,7500.00,vitrina,activo',
      '7501234567892,SKU-003,Mouse Inalámbrico,accesorio,15,4000.00,8500.00,vitrina,activo',
    ].join('\n');

    const blob = new Blob([plantilla], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'plantilla_inventario.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.xlsx')) {
      alert('Por favor selecciona un archivo .csv o .xlsx');
      return;
    }

    setFile(selectedFile);
    setProcessing(true);

    // Leer y validar archivo
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const lines = text.split('\n').filter(l => l.trim());
        
        if (lines.length < 2) {
          alert('El archivo está vacío o no tiene datos');
          setProcessing(false);
          return;
        }

        // Parsear CSV
        const headers = lines[0].split(',').map(h => h.trim().replace('*', ''));
        const rows = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const row = {};
          headers.forEach((header, i) => {
            row[header] = values[i] || '';
          });
          return row;
        });

        // Validar y clasificar
        await validarYPrevisualizarImportacion(rows);
      } catch (error) {
        console.error('Error parsing file:', error);
        alert('Error al leer el archivo: ' + error.message);
        setProcessing(false);
      }
    };

    reader.readAsText(selectedFile);
  };

  const validarYPrevisualizarImportacion = async (rows) => {
    // Obtener códigos existentes para detectar duplicados
    const existingItems = await base44.entities.Inventario.filter({
      organization_id: effectiveOrgId
    });
    const existingCodes = new Set(existingItems.map(item => item.codigo_barras?.toLowerCase()));

    const categorias = ['repuesto', 'equipo_nuevo', 'accesorio', 'consumible', 'suministro'];
    const ubicaciones = ['bodega', 'vitrina', 'taller', 'otro'];
    const estados = ['activo', 'descontinuado', 'agotado'];

    const validadas = [];
    const advertencias = [];
    const errores = [];

    rows.forEach((row, idx) => {
      const lineNum = idx + 2; // +2 porque línea 1 es header
      const issues = [];
      const warnings = [];
      let isValid = true;

      // Validaciones obligatorias
      if (!row.CodigoBarras) {
        issues.push('CodigoBarras requerido');
        isValid = false;
      }

      if (!row.Nombre) {
        issues.push('Nombre requerido');
        isValid = false;
      }

      if (!row.Categoria) {
        issues.push('Categoría requerida');
        isValid = false;
      } else if (!categorias.includes(row.Categoria.toLowerCase())) {
        issues.push(`Categoría inválida: ${row.Categoria}`);
        isValid = false;
      }

      if (!row.CostoUnitario || isNaN(parseFloat(row.CostoUnitario))) {
        issues.push('CostoUnitario requerido y debe ser numérico');
        isValid = false;
      }

      if (!row.PrecioVenta || isNaN(parseFloat(row.PrecioVenta))) {
        issues.push('PrecioVenta requerido y debe ser numérico');
        isValid = false;
      }

      // Validar stock
      if (row.Stock && isNaN(parseFloat(row.Stock))) {
        issues.push('Stock debe ser numérico');
        isValid = false;
      }

      if (row.Stock && parseFloat(row.Stock) < 0) {
        issues.push('Stock no puede ser negativo');
        isValid = false;
      }

      // Validar ubicación (opcional)
      if (row.Ubicacion && !ubicaciones.includes(row.Ubicacion.toLowerCase())) {
        warnings.push(`Ubicación "${row.Ubicacion}" no válida, se usará "bodega"`);
      }

      // Validar estado (opcional)
      if (row.Estado && !estados.includes(row.Estado.toLowerCase())) {
        warnings.push(`Estado "${row.Estado}" no válido, se usará "activo"`);
      }

      // Detectar duplicados
      const codeLower = row.CodigoBarras?.toLowerCase();
      if (existingCodes.has(codeLower)) {
        warnings.push('Código ya existe - se actualizará');
      }

      const processedRow = {
        lineNum,
        codigo_barras: row.CodigoBarras,
        sku: row.SKU || undefined,
        nombre: row.Nombre,
        categoria: row.Categoria?.toLowerCase(),
        cantidad_disponible: parseFloat(row.Stock) || 0,
        costo_unitario: parseFloat(row.CostoUnitario) || 0,
        precio_venta: parseFloat(row.PrecioVenta) || 0,
        ubicacion: row.Ubicacion?.toLowerCase() || 'bodega',
        estado: row.Estado?.toLowerCase() || 'activo',
        marca: row.Marca || '',
        modelo: row.Modelo || '',
        proveedor: row.Proveedor || '',
        issues,
        warnings,
        isValid,
        isUpdate: existingCodes.has(codeLower),
      };

      if (isValid && warnings.length === 0) {
        validadas.push(processedRow);
      } else if (isValid && warnings.length > 0) {
        advertencias.push(processedRow);
      } else {
        errores.push(processedRow);
      }
    });

    setPreviewData({
      validadas,
      advertencias,
      errores,
      total: rows.length,
    });

    setStep(2);
    setProcessing(false);
  };

  const confirmarImportacion = async () => {
    setStep(3);
    setProcessing(true);

    try {
      const itemsAImportar = [
        ...previewData.validadas,
        ...previewData.advertencias,
      ];

      let creados = 0;
      let actualizados = 0;

      // Buscar existentes para actualizar
      const existingItems = await base44.entities.Inventario.filter({
        organization_id: effectiveOrgId
      });

      const existingMap = new Map(
        existingItems.map(item => [item.codigo_barras?.toLowerCase(), item])
      );

      for (const item of itemsAImportar) {
        const data = {
          organization_id: effectiveOrgId, // CRÍTICO: inyectar organization_id
          codigo_barras: item.codigo_barras,
          sku: item.sku,
          nombre: item.nombre,
          categoria: item.categoria,
          cantidad_disponible: item.cantidad_disponible,
          costo_unitario: item.costo_unitario,
          precio_venta: item.precio_venta,
          ubicacion: item.ubicacion,
          estado: item.estado,
          marca: item.marca,
          modelo: item.modelo,
          proveedor: item.proveedor,
          punto_reorden: 5, // default
        };

        const existing = existingMap.get(item.codigo_barras.toLowerCase());
        
        if (existing) {
          await base44.entities.Inventario.update(existing.id, data);
          actualizados++;
        } else {
          await base44.entities.Inventario.create(data);
          creados++;
        }
      }

      // Registrar auditoría
      await base44.entities.SuperAdminAudit.create({
        super_admin_id: 'system',
        super_admin_email: userEmail,
        action: 'inventory_import',
        target_organization_id: effectiveOrgId,
        context: `Importación completada: ${creados} creados, ${actualizados} actualizados, ${previewData.errores.length} rechazados`,
      });

      alert(`✅ Importación completada!\n\n${creados} productos creados\n${actualizados} productos actualizados\n${previewData.errores.length} rechazados`);

      setShowModal(false);
      resetModal();
      onImportSuccess();
    } catch (error) {
      console.error('Error importing:', error);
      alert('Error al importar: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const resetModal = () => {
    setStep(1);
    setFile(null);
    setPreviewData(null);
    setProcessing(false);
  };

  return (
    <>
      <Button
        onClick={() => setShowModal(true)}
        variant="default"
        className="gap-2 bg-gradient-to-r from-emerald-500 to-blue-500"
      >
        <Upload className="w-4 h-4" />
        Importar Inventario
      </Button>

      <Dialog open={showModal} onOpenChange={(open) => {
        if (!open) resetModal();
        setShowModal(open);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              Importar Inventario desde Excel
            </DialogTitle>
          </DialogHeader>

          {step === 1 && (
            <div className="space-y-6 py-4">
              {/* Paso 1: Descargar plantilla */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <FileSpreadsheet className="w-6 h-6 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-900 mb-2">Paso 1: Descarga la plantilla oficial</h3>
                    <p className="text-sm text-blue-700 mb-3">
                      Usa la plantilla oficial para evitar errores. Columnas obligatorias están marcadas con *.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={descargarPlantilla}
                      className="gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Descargar Plantilla
                    </Button>
                  </div>
                </div>
              </div>

              {/* Paso 2: Subir archivo */}
              <div className="space-y-3">
                <Label htmlFor="file" className="text-base font-semibold">
                  Paso 2: Sube tu archivo
                </Label>
                <Input
                  id="file"
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleFileChange}
                  disabled={processing}
                />
                <p className="text-sm text-slate-500">
                  Solo archivos .csv o .xlsx. Máximo recomendado: 1000 items.
                </p>
              </div>

              {processing && (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                  <span className="text-slate-600">Validando archivo...</span>
                </div>
              )}
            </div>
          )}

          {step === 2 && previewData && (
            <div className="space-y-6 py-4">
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-emerald-900">{previewData.validadas.length}</p>
                  <p className="text-sm text-emerald-700">Válidos</p>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                  <AlertCircle className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-amber-900">{previewData.advertencias.length}</p>
                  <p className="text-sm text-amber-700">Advertencias</p>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <XCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-red-900">{previewData.errores.length}</p>
                  <p className="text-sm text-red-700">Errores</p>
                </div>
              </div>

              {/* Detalles */}
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {/* Errores */}
                {previewData.errores.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                      <XCircle className="w-5 h-5" />
                      Items con errores (no se importarán)
                    </h3>
                    <div className="space-y-2">
                      {previewData.errores.slice(0, 10).map((item) => (
                        <div key={item.lineNum} className="bg-red-50 border border-red-200 rounded p-3 text-sm">
                          <p className="font-medium text-red-900">Línea {item.lineNum}: {item.codigo_barras || 'Sin Código'}</p>
                          <ul className="list-disc list-inside text-red-700 mt-1">
                            {item.issues.map((issue, i) => (
                              <li key={i}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      {previewData.errores.length > 10 && (
                        <p className="text-sm text-red-600">... y {previewData.errores.length - 10} más</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Advertencias */}
                {previewData.advertencias.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5" />
                      Items con advertencias (se importarán)
                    </h3>
                    <div className="space-y-2">
                      {previewData.advertencias.slice(0, 5).map((item) => (
                        <div key={item.lineNum} className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
                          <p className="font-medium text-amber-900">
                            {item.codigo_barras} - {item.nombre}
                            {item.isUpdate && <Badge className="ml-2 bg-blue-100 text-blue-700">ACTUALIZAR</Badge>}
                          </p>
                          <ul className="list-disc list-inside text-amber-700 mt-1">
                            {item.warnings.map((warn, i) => (
                              <li key={i}>{warn}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      {previewData.advertencias.length > 5 && (
                        <p className="text-sm text-amber-600">... y {previewData.advertencias.length - 5} más</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Válidos */}
                {previewData.validadas.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-emerald-900 mb-2 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      Items válidos (listos para importar)
                    </h3>
                    <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                      <p className="text-sm text-emerald-700">
                        {previewData.validadas.filter(i => !i.isUpdate).length} productos nuevos y {' '}
                        {previewData.validadas.filter(i => i.isUpdate).length} actualizaciones
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirmación */}
              <div className="border-t pt-4 space-y-3">
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-slate-900 mb-2">
                    ¿Confirmas la importación?
                  </p>
                  <ul className="text-sm text-slate-700 space-y-1">
                    <li>✓ Se importarán {previewData.validadas.length + previewData.advertencias.length} items</li>
                    <li>✓ Se rechazarán {previewData.errores.length} items con errores</li>
                    <li>✓ Esta acción quedará registrada en auditoría</li>
                  </ul>
                </div>

                <div className="flex gap-3 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => resetModal()}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    onClick={confirmarImportacion}
                    className="bg-gradient-to-r from-emerald-500 to-blue-500"
                    disabled={previewData.validadas.length + previewData.advertencias.length === 0}
                  >
                    ✅ CONFIRMAR IMPORTACIÓN
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-emerald-600 mb-4" />
              <p className="text-lg font-semibold text-slate-900">Importando inventario...</p>
              <p className="text-sm text-slate-600">Por favor espera, no cierres esta ventana</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}