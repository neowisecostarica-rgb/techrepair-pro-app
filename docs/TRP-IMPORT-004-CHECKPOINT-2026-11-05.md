# TRP-IMPORT-004 — Megabloque de importación multihoja (05-nov-2026)
**Aplicación:** TRP Base44 695d708948469128f473d080
**Objetivo:** procesar listas XLSX/CSV heterogéneas mediante el importador existente sin alterar registros reales.
**Dictamen:** CÓDIGO FRONTEND / PARSER PASS (15/15 pruebas de contrato y Vite build). INTEGRACIÓN BACKEND / QA REAL NO VERIFICADA. RELEASE NO-GO.

## Archivo real: inspección local de solo lectura
Archivo aportado por Dirección General: `Stock In House Proveedores Octubre 2026.xlsx`. No se cargó a la base de datos, ni se importó como producto.
Conteo verificado mediante lectura local del libro original: **10 hojas, 132 filas de producto**: HDDs 75, Laptops 14, CPUS 6, Monitores 14, Combos 4, Insumos 10, POS 2, Encapsulador 2, Docking Stations 3, Quemadores 2. **132/132 precios numéricos**, **76/132 cantidades numéricas**, **0/132 costos de compra**. El registro anterior con 129 filas/73 cantidades era inexacto y queda corregido.
El usuario confirmó que `Precio` es precio **de venta público** y `Cantidad` es existencia **propia**; no asumir costo desde el precio. Cantidad ausente o N/A no es cero.

## Implementación de código
- `src/components/inventario/catalogImportUtils.mjs`: normalización genérica de hojas; identificación de cabeceras por hoja, composición de nombre, separación de tipo de artículo/condición NUEVO-REF, precio/costo/stock, serial, SKU y barcode; referencias de hoja/fila.
- `src/components/inventario/ImportarCatalogo.jsx`: lee hojas visibles mediante ExcelJS, presenta conteos por hoja y filas, valida con barreras de costos y cantidades faltantes, evita crear registros sin revisión; plantilla actualizada con SKU, CódigoBarras y NumeroSerie; IDs de cliente independientes del código TRP interno. Categoría existente y sucursal son requeridas para producto. Normalización por defecto no pretende crear categorías nuevas.
- `base44/functions/createInventoryItem/entry.ts`: fuente modificada para agregar verificación de duplicado por `numero_serie` y persistir ese campo, manteniendo SKU/barcode separados. **IMPORTANTE: la herramienta Base44 rechazó el empaquetado del backend** por imports preexistentes `../_shared/*` fuera del bundle. El archivo fuente fue confirmado modificado; **no se pudo verificar que se aplicó al runtime de Base44**. No confiar en persistencia de serie ni cerrar esta integración hasta que la herramienta de despliegue soporte dependencias compartidas y se pruebe en runtime autorizado.
- `scripts/verify-trp-import-004.test.mjs`: suite de datos sintéticos representativos; no escribe en Base44.

## Validaciones y alcance
- **15/15 PASS**: 10 hojas distintas en una previsualización sintética; serial separado, precio distinto de costo, costo desconocido bloqueado, N/A distinto de cero, precio ausente bloqueado, cero explícito distinguible, SKU duplicado, barcode distinto, REF no se vuelve Servicio, protección de código numérico, servicios plantilla, N/A stock bloqueado, barcode duplicado, sucursal obligatoria.
- **Vite build PASS**. Sin llamadas de creación, modificación de usuarios ni cobros.
- **Real Excel:** inspección estadística local PASS. No se ejecutó carga en navegador con cuentas reales ni previsualización real en TRP (NO VERIFICADO).
- **No se registraron productos reales.** Las 132 filas quedan sin elegibilidad para importación hasta conocer el costo de compra; adicionalmente 56 carecen de cantidad numérica. Evitar rellenar costo con cero arbitrario o permitir inventario sin revisión.
- **Riesgos abiertos:** backend import serial en runtime NO VERIFICADO, QA con archivo real en interfaz NO VERIFICADA, búsqueda equivalente por SKU/barcode en Caja/POS NO VERIFICADA, riesgos P0-AUD-01 y SEC-013 sin resolver.

## Continuidad
1. Resolver bundle compartido de `createInventoryItem` **sin publicar** ni tocar datos, después validar número de serie en runtime aislado autorizado.
2. Ejecutar previsualización de las 10 hojas con archivo original en UI (solo lectura), comparar total por hoja, duplicados y mensajes, verificar categorías/sucursal; **no confirmar importación**.
3. Definir costos reales con propietario y cantidades N/A: cero únicamente cuando se confirma que es cero real. No inventar.
4. QA de SKU/código barras en Inventario y Caja, con permisos adecuados. Revisar #12/#13/#15 antes de cualquier GO.
5. Cualquier Publish/deploy o escritura real requiere aprobación explícita de Dirección General.

**Prohibición observada:** no Publish/deploy, no mutación de COMPU STORE, sin datos reales creados.
