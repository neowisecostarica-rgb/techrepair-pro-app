# TRP-MB-06 — Candidato único de beta y paquete de QA
Fecha: 2026-11-04 · Responsable: DIRECCIÓN GENERAL / PRODUCTO / QA
App Base44: `695d708948469128f473d080`
Repositorio: `neowisecostarica-rgb/techrepair-pro-app`
**Dictamen:** CANDIDATO DE CÓDIGO IDENTIFICADO; QA pendiente; **NO-GO para operaciones reales**.

## 1. Reconciliación de fuente
- **SHA verificado:** `1c1c8c2bb5f2ed9b7c1217d62e0f7541e49e2528`.
- Base44 main y origin/main en sandbox: mismo SHA; workspace limpio al iniciar MB-06.
- Base44 `get_app_status`: `ready`, versión reportada idéntica al SHA.
- Búsqueda directa GitHub de commits en repo: último commit visible idéntico al SHA, timestamp 2026-11-04T19:46:24Z; no se encontró divergencia en ese punto.
- La rama local `remotes/github/main` del sandbox apunta a `f664db2`, referencia **desactualizada** frente a GitHub consultado directamente; **no implica merge pendiente**. No se ejecutó fetch/merge/push.
- **IMPORTANTE:** SHA de editor no certifica qué versiones de cada función backend están desplegadas o atienden requests. Validación de hashes/runtime aún NO VERIFICADA; no confundir `ready` con QA.
- El commit de este documento y su checkpoint serán posteriores al SHA candidato; el QA debe registrar el SHA exacto al iniciarse, sin seleccionar uno anterior por accidente.

## 2. Avances integrados en candidato (código, no aceptación funcional)
- Importador XLSX/CSV con plantilla, vista previa, mapeo, confirmación, controles de duplicados. Archivo real: sesión del jueves 05-nov, no ejecutado antes.
- PDF comercial común para cotización/proforma; creación válida con fixture. CRM: conversión solamente cierra al éxito; cotizaciones: envío y copia con errores separados.
- Caja: apertura sin creación automática de producto a precio fijo y bloqueo sincrónico ante doble confirmación.
- UX navegación: scroll al inicio del nuevo módulo (confirmación visual de Dirección General en TRP).
- Super Admin: error en overview y consultas secundarias no simulan recuento cero. Roles: menú Garantías consistente con PageGuard.
- Taller: órdenes, expediente y diagnósticos distinguen datos vacíos de fallas de consulta; Operación: atraso histórico separado del período de gráficas, carga técnica actual, KPIs pendientes sin falsos ceros.
- Auditoría: candidato aislado SQL/TS para ledger con hash estable y conflicto único. **NO integrado en backend real**. El writer `appendAuditEvent` existente sigue siendo vulnerable a concurrencia.

## 3. Una sola matriz QA final (sin repetir regresiones estáticas)
| ID | Secuencia en navegador | Evidencia necesaria | Condición | Estado |
|---|---|---|---|---|
| QA-01 | Importación Excel real: seleccionar, revisar cabeceras, precios, tipo, sucursal, existencias y duplicados | Captura de vista previa, matriz de filas, decisión explícita antes de importar | 05-nov con usuario autorizado; nada se escribe hasta aprobación | PENDIENTE |
| QA-02 | SALES vs OWNER Inventario: existencia/precio sin costos o botones para SALES; OWNER mantiene administración | Capturas 2 roles, consola si falla, sin cambios | Lectura en Preview, issue #15 | PENDIENTE |
| QA-03 | CRM: vistas, crear prospecto, conversión, reintento controlado | Solo lectura primero; escrituras con fixture de test aislado | Issue #12 | BLOQUEADO escritura |
| QA-04 | Cotización→proforma PDF→aprobación y enlace de cliente | Documentos correctos, estados, sin mensajes reales ni comprobantes fiscales | Fixture aislado | PENDIENTE |
| QA-05 | Caja: catálogo, pago, protección doble clic, stock, recibo e idempotencia | 1 venta, 1 efecto de stock, 1 comprobante, registro de reintentos | Issue #12 + gate #13 | BLOQUEADO |
| QA-06 | Multirol: SUPER_ADMIN, ORG_ADMIN, BRANCH_ADMIN, SALES, INVENTORY, CUSTOMER_SERVICE, TECHNICIAN; A1/A2 y tenant B | Acceso/denegación, fugas de campo, cambio de contexto, capturas | Identidad canónica aislada, issue #12 | BLOQUEADO |
| QA-07 | OT completa: recepción→diagnóstico→cotización→reparación→QA→entrega | Estados, historial, garantías, controles negativos de ciclo | Fixture aislado, issue #12 | BLOQUEADO |
| QA-08 | Auditoría concurrente 2/8 escritores reales y claves de 2 empresas | Conteo de filas, collision hash, retries/timeout, logs, SHA backend | Unicidad atómica REAL, issue #13 | BLOQUEADO |
| QA-09 | Regresión visual 1440/390: scroll TRP, errores de carga, gráficos, roles y proforma | PASS/FAIL/NO VERIFICADO y capturas | QA-02 y fixture de prueba para mutaciones | PENDIENTE |
| REL-01 | Reconciliar versión exacta de funciones backend, candidate QA, publicación, rollback y decisión release | Tabla de SHA/version backend, tests, autorizaciones | QA crítica PASS + aprobación Dirección General | NO AUTORIZADO |

## 4. Bloqueos absolutos
- **GitHub #12:** usuario y membresía QA realmente aislados; Testing Agent temporal no permite suplantar membresía por email. NO seed de datos vivos, NO backdoor de auth.
- **GitHub #13 / P0-AUD-01:** unicidad atómica de AuditEvent no demostrada en Base44; prueba que reproduce duplicación sigue PASS como *evidencia de defecto*. Candidato PostgreSQL aislado no elimina el bloqueo. **NO-GO para operaciones reales.**
- **GitHub #15:** contratos de INVENTORY_READ en SALES PASS, pero QA visual autenticado de ambos roles y permiso negativo aún pendiente.
- Versión runtime individual de backend no verificada; una etiqueta `ready` en Base44 no basta.

## 5. Guía operativa para QA (evitar circularidad)
1. Abrir Base44 Preview con usuario nativo autorizado. Registrar versión visible, usuario y organización, sin capturar PII, tokens ni claves.
2. Ejecutar primero las verificaciones solo lectura de SALES/OWNER y comprobar la pantalla de Inventario con **cero escrituras**; registrar PASS/FAIL/NO VERIFICADO por fila.
3. El 05-nov cargar Excel real solamente para **previsualización** y validar todas las columnas; solicitar autorización antes de aplicar importación. Si hay duplicados/conflictos, detener y corregir mapeo.
4. NO ejecutar QA mutacional comercial/taller hasta disponer de fixture aislado y con `UserAccount.user_id` canónico, y resolver los bloqueos de auditoría de efectos reales.
5. Unificar el E2E de CRM/OT/Caja, sin micro-regresiones repetidas, y validar negativa cross-tenant/cross-branch.
6. Al final comparar SHA de código con backend desplegado, emitir GO/NO-GO firmado por QA; solo publicar tras autorización Dirección General.

## 6. Release y rollback
- No se creó rama nueva ni PR; los cambios existentes ya están en la rama main que usa el editor de Base44.
- **No Publish/deploy** de esta operación. Candidato de QA no es beta operativa.
- Último checkpoint previo a MB-06: `6aeb8bacf32fb6ed57fe2a47` (MB-05A, SHA candidato `1c1c8c2...`).
- El checkpoint posterior MB-06 queda registrado en Base44; usar únicamente un checkpoint conocido como punto de restauración. Antes de operaciones sensibles respaldar y confirmar reversión funcional de backend/BD; restaurar frontend no revierte datos.
- Fecha objetivo beta privada viernes 06-nov-2026 **condicionada**; sin controles críticos PASS dictamen NO-GO.

## 7. Referencias obligatorias
- `docs/TRP-BACKLOG-MASTER-2026-11-04.md`
- `docs/TRP-SEC-001-E2E-001-QA-MATRIX-2026-11-03.md`
- `docs/TRP-SEC-013-QA-IDENTITY-GATE-2026-11-03.md`
- `docs/TRP-COM-QA-002-SALES-INVENTORY-READONLY-2026-11-03.md`
- `docs/TRP-P0-AUD-01-ATOMIC-LEDGER-ADR-2026-11-03.md`
- `docs/TRP-SEC-005-RUNTIME-RECONCILIATION-2026-11-03.md`
