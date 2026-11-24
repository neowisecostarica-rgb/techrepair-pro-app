# TRP — Activación de QA funcional en Test Data
App oficial 695d708948469128f473d080. 23-nov-2026.
Test Data habilitado (API verificada). No crear otra app ni rama por ahora.

## Verificación actual
Documentación oficial: https://docs.base44.com/documentation/managing-app-data/testing-your-data
Preview con Test activado y Testing link dirigen operaciones a Test Data; publicado usa producción. Usuarios nativos compartidos y efectos externos reales. La API de entidades disponible al agente no declara selector Test; no utilizarla para escribir fixtures. El SDK instalado 0.8.63 no mostró mecanismo explícito de data_env en búsqueda textual; no improvisar parámetros.
Sin navegador autenticado controlable en esta sesión, no se certifica runtime.

## Paso operativo mínimo
1. Operador abre editor de TRP oficial > Preview, activa icono Test Data y confirma indicador. En Publish > Testing link > Copy testing link (no pulsar publicación); usar sesión autorizada.
2. Dashboard > Data > Test: comprobar tablas Organization, Branch, UserAccount y demás, sin copiar producción. No borrar registros existentes; si hay datos no sintéticos, detenerse y clasificar. Usar identidades QA dedicadas, no cambiar cuentas existentes ni roles nativos reales. Alias example.invalid del manifiesto son solo fixtures; no invitar ni provisionar esos correos.
3. Reconciliar código/runtime y comprobar transporte de cada gateway. Inventariar automatizaciones/webhooks y su contexto. No cambiar el secreto global para Test: podría afectar producción. Bloquear todas las salidas por entorno con evidencia independiente, incluidas invitaciones nativas de manageOrgUser/adminCreateOrganization; no probar esas rutas hasta resolverlo. No usar Testing Agent/seed automático.
4. Tras certificar 10 controles de qaEnvironmentGate, aprobar y crear dataset ficticio únicamente en Test desde editor o testing link; registrar IDs de prueba y verificar ausencia en Production. No crear directamente en API de producción. Comenzar con QA read-only y después transacciones sintéticas conforme E2E-T01.
5. Capturar resultado por rol, tenant, sucursal, fecha, SHA, contexto, HTTP, captura móvil/escritorio y eventos auditables. No compartir credenciales/tokens ni PII. A4.3/#13 sigue requiriendo persistencia durable.

## Evidencia nueva
scripts/verify-qa-matrix-13-identities.mjs: 140/140 PASS en helpers fuente con BD mock (dos organizaciones, tres sucursales, trece identidades), incluyendo rechazo de ID incorrecto con email coincidente, suspensión, acceso cruzado de empresa/sucursal, permisos de cotización e inventario y proyección de precio/stock versus costo/proveedor. No equivale a runtime ni certificación RLS.
Regresiones gate 14/14 y A3 31/31 PASS. No invocación de API operativa, no correos ni cobros ni cambio de roles, datos, esquemas o backend. NO-GO para transacciones hasta gate cumplido.
