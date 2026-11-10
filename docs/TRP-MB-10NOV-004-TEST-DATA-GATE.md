# ZEUS · TRP-MB-10NOV-004 · Test Data y gate de pruebas
Fecha: 2026-11-10 · App Base44: `695d708948469128f473d080` · Prioridad P0
**Modo de trabajo:** inspección documental/API de solo lectura, sin activar Test Data, sin escrituras operativas, sin despliegue.

## 1. Disponibilidad real y selección de contexto

**EVIDENCIA DIRECTA:** Base44 Apps API, `GET /api/apps` con filtro exacto por ID y proyección `id,name,dev_environment_enabled`: `dev_environment_enabled: false`. **Test Data DESHABILITADO en TRP.** El catálogo oficial documenta el campo y el cambio a true mediante actualización de aplicación; ese endpoint de escritura NO se ejecutó.

Documentación oficial: https://docs.base44.com/documentation/managing-app-data/testing-your-data

- Requisito documentado: plan Builder o superior; no se comprobó entitlement del workspace.
- Se habilita desde Dashboard > Settings > Advanced Capabilities > Test Data. Tras habilitarlo aparece base independiente inicialmente vacía; no se copian automáticamente los registros productivos.
- Selección: Dashboard > Data, selector Production/Test; Preview, icono Turn on test data. Testing link utiliza Test. App publicada siempre Production.
- Funciones: preview en Test y testing link usan Test; función ejecutada desde Code o chat usa última selección del editor; publicada siempre Production. **Las funciones con service role siguen el contexto de ejecución según documentación, pero no hubo verificación propia en runtime para cada gateway TRP.**
- No se ejecutó ni se habilitó ese selector en TRP.

## 2. Inspección de gateways en main (código, no runtime)

Inspección puntual de `base44/functions/*/entry.ts`. Se observaron uso de `base44.auth.me()`, `resolveAuthorizedContext`, `asServiceRole.entities` y filtros por organización/sucursal en:
- `crmGateway`: CRM, leads, conversión cliente (service role y validación de identidad).
- `operationalGateway`: controles de recursos y operaciones.
- `approveCotizacion`: cotizaciones y órdenes, service role.
- `createInventoryItem`: inventario, autorización, sucursal, AuditEvent.
- `createSale` y `cancelDraftSale`: Caja, stock, venta y AuditEvent, service role.
- `identityGateway`: membresías, superadmin y contextos; `notificationCommand`: notificaciones/auditoría.

**Resultado:** rutas privilegiadas presentes; no se encontró prueba en tiempo de ejecución que garantice contexto Test para todos los gateways. No hay que reprogramar gateways a partir de documentación sin evidencia. No confundir autorización multiempresa con aislamiento entre bases.

## 3. Integraciones/externalidades e identidad

- Base44 connector catalog para TRP muestra conectores OAuth listados sin conexión `connected` en revisión; esto no garantiza ausencia de integraciones Core ni de servicios usados por funciones.
- Stripe status: `stripe_mode=null`, `test_mode_configured=false`, `live_mode_configured=false`.
- Wix Payments status: `connected=false`; sin acceso habilitado a Wix Payments.
- **Riesgo P0 externo identificado:** `processOTEvent/entry.ts` hace `base44.asServiceRole.integrations.Core.SendEmail` en estados CREATED, FINALIZADA, ENTREGADA y CANCELADA; `handleOTLifecycleEvent/entry.ts` contiene `sendEmailIfNeeded` con `Core.SendEmail`. Según Base44, comunicaciones/pagos externos se ejecutan realmente incluso con Test Data. Antes de E2E deben aislarse o bloquearse salidas, sin cambiar producción en este bloque.
- UI contempla acciones de WhatsApp/correo/SMS con confirmación externa; verificar ausencia de envío sin confirmación y evitar contactos reales.
- Identidad: las cuentas Base44 son compartidas por Test y Production. **No modificar roles/perfiles reales**. No se certificó ninguna cuenta QA para TRP; los registros previos de Compu Store (ORG_ADMIN, BRANCH_ADMIN, SALES, TECHNICIAN) no constituyen identidades de prueba autorizadas. El plan SEC-012 registra fixture simulada, no sesión QA autenticada aislada. Se requieren identidades autorizadas previamente y membresías `UserAccount.user_id` enlazadas a usuario real solo para fixture ficticio en Test, sin manipular rol global de Base44.

## 4. Matriz preparada, NO ejecutada

| Caso | Verificación requerida | Gate |
|---|---|---|
| TD-01 | Activación autorizada, selector Test visible y registro de contexto antes/después, ausencia de cambios Production | Pendiente autorización |
| TD-02 | Dos organizaciones ficticias A/B y sucursales en Test sin copia de datos | Bloqueado |
| SEC-001 | Autenticación SALES/ORG_ADMIN/BRANCH_ADMIN/TECHNICIAN con acceso permitido A y denegado B; Super Admin sin bypass | Bloqueado |
| COM-001 | Lead, conversión, replay, identidad única y acceso denegado en org B | Bloqueado |
| COM-002 | Proforma/cotización, aprobación, snapshots, idempotencia, acceso rol | Bloqueado |
| COM-003 | SKU/barcode/serial, stock y duplicados; Excel 10 hojas/132 filas **previsualización sin importación** | Bloqueado |
| COM-004 | Venta ficticia, caja, doble confirmación, inventario, borrador/cancelación, rollback | Bloqueado |
| AUD-01 | Dos o más writers con mismo (org,opId), misma semántica => 1 registro y replay; semántica incompatible => conflicto, dos organizaciones independientes | Bloqueado |
| AUD-02 | Suspensión del writer > lease de 60 s, takeover, expiración, crash/retry y reconciliación; exigir unicidad persistente | Bloqueado |
| OT-001 | Recepción→OT→diagnóstico→reparación→cobro ficticio→entrega, con correos y canales externos bloqueados | Bloqueado |

## 5. Criterio de P0-AUD-01

La mitigación CAS sobre Organization no establece UNIQUE/ACID en AuditEvent. Para cerrar #13 se exige prueba runtime con dos escritores auténticos y un almacenamiento/operación con unicidad atómica persistente de `(organization_id,audit_operation_id)`, conflictos semánticos, retries y fallos temporales. Probar lease expiration con writer lento y comprobar que nunca hay doble escritura, aun tras fallar proceso. Si Base44 no ofrece esa garantía, mantener NO-GO; no implementar infraestructura adicional sin decisión ejecutiva.

## 6. Condiciones exactas antes de la primera escritura aislada

1. **Autorización explícita para activar Test Data** en esta aplicación, tras revisión de coste/plan e impacto. No habilitado.
2. Confirmar Test de extremo a extremo en preview y funciones con contexto fijado; lectura en Data > Test/Production y evidencias comparables, sin importar ni copiar datos reales.
3. Aprobar identidad QA con usuarios reales ya autorizados para iniciar sesión, sin cambiar roles productivos, y crear membresías/organizaciones ficticias únicamente en Test después de nueva autorización de escrituras.
4. Bloqueo confirmado de Core.SendEmail y otras llamadas externas (correo, WhatsApp, SMS y pagos) durante todos los flujos, sin desactivar comunicaciones reales en producción.
5. Plan de rollback, identificadores `QA-TRP`, matriz y evidencia request ID, revisión de autorización de Dirección General para cada fase.
6. No ejecutar QA de ventas/cobros/transacciones antes del levantamiento formal de gates P0 y de autorización separada de operaciones ficticias.

## Dictamen

**NO-GO para iniciar pruebas transaccionales** ahora: Test Data deshabilitado, identidades no certificadas, salidas de correo reales en rutas OT y ledger sin unicidad transaccional demostrada.

**GO condicionado únicamente para solicitar activación de Test Data**, no para pruebas. No crear apps/ramas, no modificar Compu Store, no publicar, no editar roles, no replicar producción.

CEO: registro pendiente mediante `executiveProxy` autorizado. Prioridad global Ram Luna.
