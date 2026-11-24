# A5.3d — Inventario e integración monetaria
Corte 23-nov-2026. Fuente: código candidato e977365. NO-GO internacional. No QA autenticado ni cambios runtime.

## Matriz de integración
| Frente | Fuente inspeccionada | Riesgo y aceptación previa a integración |
|---|---|---|
| Caja y venta | PuntoVenta.jsx; createSale fuente canónica | 13% fijo y CRC en UI; moneda de venta persistida por servidor, cálculo/versión fiscal conciliados, replay y borradores preservados |
| Cotización | operationalGateway, transitionWorkOrderStatus, FormularioCotizacion | Validar todos los caminos de creación/actualización; snapshot inmutable después de emisión; conversión en misma moneda |
| Inventario/servicio | createInventoryItem, updateInventoryItem, Inventario, Servicio | Costo y precio requieren autoridad monetaria; mantener proyección SALES sin costo, no modificar precios por cambio de moneda |
| Importación | catalogImportUtils.mjs, ImportarCatalogo.jsx | strictNumber elimina ₡/$ y deduce separador; exigir origen monetario explícito, revisar ambigüedad y formatos; no importar ni convertir automáticamente |
| Comprobante/PDF/WhatsApp | TiqueteVenta, descargarDocumentoCotizacion, EnviarWhatsApp | CRC fijo; preservar importe y moneda histórica, consistencia de representación impresa y mensaje |
| Portales | getPublicCommercialDocument, PortalCotizacion, PortalComprobante, PortalCliente | DTO sin moneda histórica; incorporar solo proyección autorizada por token; no ampliar acceso ni inferir moneda |
| Finanzas | getFinancialMetrics, Finanzas, dashboards | Nunca agregar monedas diferentes; costos históricos, gastos, caja e ingresos reconciliados |
| Proveedores y gastos | PurchaseInvoice, SupplierPayment, Expense, CuentasPorPagar, Gastos | Definir moneda de obligación/pago, parcialidades, saldos y discrepancias; no aplicar FX implícito |
| Taller y reciclaje | WizardDiagnostico, ExpedienteComercial, TimelineViewer, Reciclaje, InventarioInvertido | Identificar estimaciones monetarias, precios recuperados y vínculos a OT; no reetiquetar históricos |
| Registro y configuración | Onboarding, Saas, Settings, identityGateway | Catálogos dispares, currency actual editable mediante backend; gobernar cambios de moneda, sin modificar legacy ni seleccionar mercados no certificados |

## P0 adicional: impuesto y precisión
PuntoVenta.jsx calcula subtotal * 0.13; commercialIntegrity.ts establece COMMERCIAL_TAX_RATE = 0.13 y redondea a dos decimales. No modificar la tasa actual sin política fiscal aprobada. País no basta para determinar obligaciones ni exenciones. Diseñar snapshot de tasa/regla/importe por documento, conciliación de totales y pruebas por mercado, independientemente de moneda/idioma. Revisar otros consumidores de esta constante antes de cambiarla.

## Candidato de revisión histórica
scripts/candidates/monetaryHistoryReview.mjs: función pura sin SDK, sin DB, sin permisos de escritura. Propone metadata únicamente cuando hay evidencia revisada, referenciada, mismo tenant y tipo/ID de documento; nunca modifica importes ni un snapshot existente. Sin evidencia, discrepancia, moneda no soportada o total inválido: revisión humana. Rechaza input cross-tenant y duplicado. Las marcas reviewed/reference son fixtures, no certificación de evidencia real ni autoridad suficiente para escritura.
19/19 pruebas sintéticas PASS; 23/23 contrato monetario PASS. Alcance actual Venta y Cotizacion solamente. No ejecutado contra datos reales, no backfill, no cambios de esquema. Pendiente reconciliación de líneas, política histórica, respaldo, evidencia real, revisión humana y ejecución idempotente bajo aprobación separada.

## Próximo gate
A5.3e: antes de integrar, aprobar sincronización backend/esquemas y entorno QA aislado; establecer guard de cambio de moneda y autoridad de impuesto. Crear snapshot para nuevas operaciones y compatibilidad con legacy sin asumir moneda, pruebas de replay y proyección. No realizar migración real por esta autorización. Reconciliar A4.3 y gates #12/#13/#15. Community/UGC y ads Maegency preservados.
