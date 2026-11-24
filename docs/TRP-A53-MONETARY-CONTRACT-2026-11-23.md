# TRP A5.3c — Contrato monetario e internacionalización
Fecha: 23-nov-2026. Estado: DISEÑO + CANDIDATO AISLADO PROBADO; NO-GO internacional y general.

## Evidencia
- Organization.currency es string requerido. Los esquemas Venta, VentaItem, Cotizacion, Garantia y OrdenTrabajo no declaran moneda; el DTO público de Organization/Venta/Cotizacion tampoco la proyecta.
- 35 archivos de src fuera de diccionarios contienen el símbolo ₡ (corte A5.3b). La presencia del símbolo no implica 35 defectos idénticos: clasificar texto, importación, presentación, PDF y cálculo.
- src/pages/Onboarding.jsx y src/pages/Saas.jsx difieren en países/monedas; commercialIntegrity.ts redondea a dos decimales. No ampliar monedas con distinta precisión sin política de cálculo.
- A5.3b recuperado: el contexto servidor confirma basic/core y licencia activa para alta nueva. No existe Community activo.

## Contrato propuesto
1. Distinguir moneda operativa de tenant, moneda de documento histórica, idioma de UI y moneda de cobro del SaaS. No inferir una de otra. No implementar conversión FX implícita.
2. Nuevas ventas/cotizaciones: moneda explícita, inmutable tras emisión/confirmación, derivada por el backend de la organización autorizada. Alinear line items, costos, descuentos, impuestos, pagos, devoluciones, garantías que incluyan montos y documentos asociados. Proteger contra manipulación de cliente, rutas genéricas y cambios tras emisión.
3. Conversión cotización→venta: exigir mismo tenant y moneda compatible, conservar importe/versión histórica; rechazar mezcla o moneda desconocida. Nunca reetiquetar un documento anterior con moneda actual de organización.
4. Historial: inventario read-only por tenant y documento, demostrar moneda con evidencia verificable (documentos/registro contemporáneo y política histórica). Candidato de migración por lotes idempotente, copia de seguridad y conciliación de totales antes/después. Ambigüedad a revisión humana; no inferir CRC por símbolo hardcodeado ni USD por país/idioma. Sin backfill masivo automático.
5. DTO público: incluir solo moneda del documento autorizado por token, sin ampliar permisos ni exponer datos privados. Si falta moneda verificada, bloquear emisión/descarga nueva o presentar estado de revisión definido por producto; preservar documentos históricos ya emitidos.
6. Formato: centralizar moneda/código y locale independiente; verificar cantidades en POS, PDF (fuentes y códigos ISO), portales, cotizaciones, comprobantes, inventario, CRM, dashboard, WhatsApp, importación y exportación. Agregados de monedas distintas separados, nunca sumados sin FX explícito. No cambiar precisión ni impuesto legal por un cambio de formato.
7. País/moneda: un catálogo común para alta y Super Admin; ofrecer solo combinaciones certificadas en el gate comercial, sin alterar configuraciones existentes. Legislación fiscal, impuestos, factura electrónica, medios de pago y política de soporte son gates separados, no se certifican con Intl.

## Candidato aislado
scripts/candidates/monetaryContract.mjs (sin importaciones desde runtime). Pruebas scripts/verify-a53-monetary-contract.test.mjs: 23/23 PASS.
- CRC, USD, MXN, EUR; es/en/pt/fr/no; código visible, importes con dos decimales; formato PDF en código ASCII. No redondeo contable nuevo ni cálculo tributario. Esas cuatro monedas son alcance de prueba, no mercados certificados.
- Rechazo de moneda ausente/desconocida, importes no numéricos, discrepancia tenant/moneda, agregación mixta y reetiquetado histórico.
- Regresiones actuales: A5.3b 18/18, comercial 12/12, venta atómica 29/29. Pruebas en fuente/fixtures, no runtime autenticado.

## Orden de integración (pendiente)
A5.3d: inventario de flujos, catálogos y proyecciones; preparar fixture con moneda histórica conocida/ambigua y contratos de transición. A5.3e: autorización específica de sincronización backend + esquemas; QA aislado de documentos y transacciones. A5.3f: integración UI, PDF y cinco idiomas; reconciliación histórica, QA humano, gates fiscales y GO por mercado.
No modificar backend/entidades reales, ni activar cobros, ni Publish. A4.3/#12/#13/#15 y demás gates NO-GO siguen abiertos. Mantener A6.1 Community/UGC y Maegency Ads.
