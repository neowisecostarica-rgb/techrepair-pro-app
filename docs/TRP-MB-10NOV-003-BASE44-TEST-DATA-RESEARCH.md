# TRP-MB-10NOV-003 · Investigación Base44 Test Data · 10-nov-2026

**Decisión de Dirección General:** espera técnica controlada; no modificar producción, no crear apps ni ramas, no ejecutar pruebas transaccionales. Informe documental, sin certificación runtime.

## Fuente oficial consultada
- Base44: https://docs.base44.com/documentation/managing-app-data/testing-your-data
- Base44: https://docs.base44.com/Building-your-app/working-with-branches
- Base44: https://docs.base44.com/documentation/managing-app-data/testing-agent

## Capacidades documentadas
1. **Test Data** (plan Builder o superior): base de datos de pruebas independiente, creada vacía al habilitarse desde Dashboard > Settings > Advanced Capabilities; datos productivos preexistentes no se copian automáticamente. Production/Test se selecciona en Data y Preview; un testing link utiliza test data.
2. **Funciones backend**: ejecutadas desde Preview en modo Test o testing link utilizan test data; desde app publicada, siempre producción. Las ejecuciones desde Code/AI chat heredan la última selección del editor; no asumir entorno por defecto.
3. **Autenticación/usuarios**: no aislados. Usuarios compartidos entre Test y Production; modificar perfil/rol durante test modifica cuenta real. Identidad QA y membresías UserAccount (entidades de TRP) necesitan validación sin alterar cuentas reales.
4. **Servicios externos**: llamadas desde funciones (correo, pagos u otros proveedores) son reales aun cuando el contexto de datos sea Test; requieren deshabilitación/credenciales sandbox verificadas antes de pruebas.
5. **Ramas**: la documentación Base44 declara datos compartidos entre ramas, y funciones/código pueden divergir; una rama sola NO es aislamiento de datos. No crear ramas.
6. **Testing Agent**: navegador simulado; no certifica automáticamente identidad aislada ni prohibición de externalidades. Antecedente SEC-012 prohibió seed no supervisado que puede copiar datos productivos.

## Aplicación a TRP
**Hallazgo:** existe mecanismo oficial compatible con restricción de no crear otra aplicación: Test Data para registros y funciones en contexto adecuado. **No hay aislamiento total de auth y servicios externos**, por diseño.

**Estado:** DOCUMENTACIÓN OFICIAL VERIFICADA; **configuración real de TRP, disponibilidad del plan, asociación de contexto en cada gateway y rutas con service role, credenciales externas y disponibilidad de identidades de QA NO VERIFICADAS**. No afirmar que está listo.

## Siguiente gate (solo lectura)
- Verificar en la configuración existente de TRP si Test Data está habilitado y si se muestra alternancia Test/Production. No activarlo sin revisión de impacto.
- Auditar ruta por ruta los gateways de CRM, cotizaciones, inventario, caja, AuditEvent y auth para detectar accesos que no respeten contexto Test; inventariar integraciones con externalidades.
- Diseñar cuentas QA ya autorizadas, sin cambios de rol real, y dos organizaciones/sucursales ficticias en Test Data. Nunca copiar datos de Compu Store.
- Obtener evidencia read-only/confirmación de entorno antes de primera mutación. P0-AUD-01 sigue exigiendo unicidad efectiva y pruebas concurrentes en runtime; Test Data no resuelve UNIQUE/ACID.
- Mantener E2E, SEC-001 y P0-AUD-01 como BLOQUEADO/NO-GO hasta certificación.

No se realizaron escrituras runtime, Publish, deploy, nuevas apps, ramas, importaciones, ventas, cobros o cambios de usuarios. CEO pendiente de executiveProxy autorizado. Prioridad global: Ram Luna.
