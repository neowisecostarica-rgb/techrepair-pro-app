# TRP-MVP-MODULE-AUDIT-001 — Full Product Module Audit

**Fecha:** 2026-08-10

**Rama auditada:** `rc/product-readiness-stabilization`

**HEAD auditado:** `256ffe0372c052eca394ad8345543935fd2f9578`

**PR de referencia:** `#10 — OPEN / DRAFT / MERGEABLE` (estado suministrado)

**Modalidad:** auditoría read only; no se modificó código funcional, no se hizo commit, push ni merge.
**Fuera de alcance:** `CEOs/`, Wise Brain y cualquier contenido no perteneciente a TechRepair Pro.

## 1. Executive Summary

**Decisión:** el Release Candidate **no es seguro para continuar a merge review**. La revisión encontró siete grupos de P0 verificables en código. No se encontró evidencia de una regresión cross-tenant en la autoridad soberana cerrada por TRP-SEC-006: las pruebas de identidad, membresía canónica, impersonación y aislamiento entre organizaciones continúan pasando. El bloqueo aparece en una frontera distinta y todavía abierta: la autorización operacional dentro del tenant, el alcance por sucursal y la integridad de operaciones comerciales, inventario y lifecycle.

Los gateways nuevos son una base sólida: Recepción, Asignación, Smart Intake, venta atómica, Customer 360, CRM e identidad pasan sus suites contractuales. Sin embargo, numerosos schemas permiten CRUD directo a cualquier miembro activo de la organización sin distinguir rol o sucursal. Por tanto, `PageGuard` y los gateways no constituyen una frontera de seguridad completa: un cliente autenticado puede omitir la UI y mutar ventas, cotizaciones, inventario, historial, citas y otros objetos operacionales.

Además:

- `createSale` acepta importes y precios calculados por el cliente sin recomputarlos ni exigir que la cotización relacionada esté aprobada y sea equivalente; esto permite un cobro persistido con monto manipulado.
- El editor normal de inventario modifica stock sin CAS y registra historial antes de confirmar el cambio, admitiendo lost updates y trazabilidad falsa o incompleta.
- La aprobación pública y la entrega ejecutan múltiples escrituras críticas sin una transacción/compensación completa, por lo que una falla intermedia puede separar la evidencia legal del estado real de la OT.
- Un `BRANCH_ADMIN` no está confinado server-side a su sucursal en listados, métricas y reasignación.
- Finanzas/Dashboard consumen un contrato diferente al que devuelve el backend, por lo que muestran ceros aunque existan datos; Mi Día, Expediente, Operación y Ventas Métricas también contienen relaciones o campos obsoletos.
- Settings puede borrar la última sucursal por una clave de caché incorrecta, y `manageOrgUser` llama un helper no importado.

**Resultado global:** 0 módulos con `PASS` limpio, 11 con `PASS WITH ISSUES` y 9 con `FAIL`. El flujo E2E no representa todavía una única historia operacional confiable desde cotización hasta entrega.

## 2. Matriz completa de módulos

| Área | Ruta | Estado | Función real | Blocker principal |
|---|---|---:|---|---|
| Mi Día | `/MiDia` | FAIL | Tablero y acciones según rol | Campos de venta inexistentes y autoría incorrecta (`P1-03`); alcance branch incompleto (`P0-06`) |
| Negocio | `/Dashboard` | FAIL | Resumen por rol | Contrato financiero incompatible y truncamiento (`P1-01`, `P1-11`) |
| Negocio | `/Finanzas` | FAIL | KPIs, tendencias y ventas | Payload/respuesta incompatibles; branch ignorado (`P1-01`, `P0-06`) |
| Negocio | `/VentasMetricas` | FAIL | Métricas comerciales | “Cobrado” incluye ventas no pagadas (`P1-02`) |
| Negocio | `/ProductividadTecnicos` | PASS WITH ISSUES | Métricas de actividad técnica | Ventana/branch/campos obsoletos (`P1-10`) |
| Negocio | `/AnalisisTrabajo` | PASS WITH ISSUES | Análisis de OT, actividad e inventario | Métricas derivadas de datos no persistidos (`P1-10`) |
| Negocio | `/Operacion` | FAIL | Supervisión en vivo | Cotizaciones branch siempre vacías y estados incompletos (`P1-11`) |
| Taller | `/OrdenesTrabajo` | PASS WITH ISSUES | Recepción, listado, asignación y expediente | Límite de 100, expediente roto y autorización org-wide (`P1-04`, `P1-12`, `P0-06`) |
| Taller | `/ColaRevision` | PASS WITH ISSUES | Cola y asignación | Gateway consistente, pero sin confinamiento branch y listado truncado (`P0-06`, `P1-12`) |
| Taller | `/Agenda` | PASS WITH ISSUES | Citas y agenda | Solapamiento solo cliente; CRUD org-wide (`P1-06`, `P0-01`) |
| Taller | `/Reciclaje` | PASS WITH ISSUES | Registro y actualización de reciclaje | CRUD directo, desconectado de lifecycle/inventario (`P1-13`) |
| Taller | `/Calidad` | PASS WITH ISSUES | No conformidades | CRUD directo, sin vínculo obligatorio a OT/QA (`P1-13`) |
| Ventas | `/PuntoVenta` | FAIL | Cobro y venta atómica | Backend confía montos del cliente (`P0-02`) |
| Ventas | `/VentasHistorial` | PASS WITH ISSUES | Consulta de ventas | Acceso branch no forzado y sin paginación (`P0-06`, `P2-02`) |
| Ventas | `/VentasCotizaciones` | FAIL | Cotización, envío y conversión | Escrituras directas, pre-venta fragmentada y aprobación no atómica (`P0-01`, `P0-04`, `P1-08`) |
| Ventas | `/VentasGarantias` | PASS WITH ISSUES | Consulta de garantías | Emisión depende de side effect previo a entrega; alcance org-wide (`P0-05`, `P0-06`) |
| Clientes | `/Clientes` | PASS WITH ISSUES | CRUD, Customer 360, equipos/OT/ventas | Customer 360 es gobernado; lista/quote embebida conserva rutas directas (`P0-01`, `P1-08`) |
| Clientes | `/CRM` | PASS WITH ISSUES | Leads, asignación y conversión | Gateway tenant-safe; carrera de duplicados (`P1-05`) |
| Inventario | `/Inventario` | FAIL | Catálogo, stock y ajustes | Bypass CRUD, ajuste no CAS, historial mutable, reservas ausentes (`P0-01`, `P0-03`, `P1-07`) |
| Configuración | `/Settings` | FAIL | Organización, sucursales, usuarios y términos | Borrado de última sucursal, helper ausente y CRUD directo (`P0-07`, `P1-09`) |

## 3. PASS/FAIL por módulo — fichas técnicas

### 3.1 Mi Día — FAIL

- **Frontend:** `src/pages/MiDia.jsx`, `src/components/midia/MiDiaTech.jsx`, `MiDiaSales.jsx`, `MiDiaAdmin.jsx`.
- **Backend:** `initTechnicalActivity`, `transitionWorkOrderStatus`, `updateWorkOrderAttentionStatus`; varias lecturas/escrituras siguen siendo SDK directo.
- **Entities:** `OrdenTrabajo`, `ActividadTecnica`, `Lead`, `Cotizacion`, `Venta`, `Cita`, `Garantia`.
- **Authorization:** `PageGuard` admite `ORG_ADMIN`, `BRANCH_ADMIN`, `TECHNICIAN`, `SALES`; las entidades no reproducen esas restricciones ni el branch.
- **Flujo real:** técnico puede iniciar, pausar, retomar y cerrar actividad; ventas/admin reciben tarjetas y accesos rápidos.
- **Integraciones:** OT, Agenda, CRM, Cotizaciones, POS, actividades técnicas.
- **Hallazgos:** `P0-01`, `P0-06`, `P1-03`. `MiDiaSales` compara `created_by` con email aunque `Venta` usa `created_by_user_id`, y ambos tableros leen `estado_pago`, campo inexistente.

### 3.2 Dashboard — FAIL

- **Frontend:** `src/pages/Dashboard.jsx`, `src/components/dashboard/DashboardOrgAdmin.jsx` y dashboards por rol.
- **Backend:** `getFinancialMetrics`, `listWorkOrders`; otras métricas se agregan client-side.
- **Entities:** `OrdenTrabajo`, `Cliente`, `Venta`, `ActividadTecnica`, `Inventario`.
- **Authorization:** guard por rol en UI; lecturas operacionales siguen siendo org-wide.
- **Flujo real:** renderiza conteos de OT/clientes y tarjetas financieras; las tarjetas de ingresos/ventas quedan en cero por contrato incompatible.
- **Integraciones:** Finanzas, Taller, Clientes, Inventario.
- **Hallazgos:** `P1-01`, `P1-10`, `P1-12`, `P2-02`.

### 3.3 Finanzas — FAIL

- **Frontend:** `src/pages/Finanzas.jsx`.
- **Backend:** `base44/functions/getFinancialMetrics/entry.ts`.
- **Entities:** `Venta`, `VentaItem`, `Inventario`, `Cliente`, `Organization`, `Branch`.
- **Authorization:** backend admite `ORG_ADMIN` y `BRANCH_ADMIN`, pero agrega toda la organización y no aplica `branch_id`.
- **Flujo real:** UI envía `start_date`, `end_date`, `branch_id` y espera `metrics.sales.*`; backend lee `period_start`, `period_end` y devuelve un objeto plano.
- **Integraciones:** PuntoVenta, Clientes, Inventario, Dashboard.
- **Hallazgos:** `P0-06`, `P1-01`.

### 3.4 Ventas Métricas — FAIL

- **Frontend:** `src/pages/VentasMetricas.jsx`.
- **Backend:** no tiene agregador gobernado; consulta entidades y agrega en navegador.
- **Entities:** `Venta`, `Cotizacion`, `Garantia`.
- **Authorization:** guard UI para ventas/admin; filtros branch/usuario se construyen cliente-side.
- **Flujo real:** calcula totales, ticket, métodos y conversión sobre registros cargados.
- **Integraciones:** POS, Cotizaciones, Garantías.
- **Hallazgos:** `P0-01`, `P0-06`, `P1-02`: excluye solo `anulada`, por lo que `borrador`, `procesando` e `inconsistente` se cuentan como cobradas.

### 3.5 Productividad de Técnicos — PASS WITH ISSUES

- **Frontend:** `src/pages/ProductividadTecnicos.jsx`, `src/components/hooks/useOrgAdminMetrics.jsx`.
- **Backend:** ninguno específico; agregación cliente-side.
- **Entities:** `ActividadTecnica`, `OrdenTrabajo`, `Inventario`.
- **Authorization:** UI solo `ORG_ADMIN`; RLS no limita por función de negocio.
- **Flujo real:** promedia duración y tasas usando registros creados en ventana seleccionada.
- **Integraciones:** Mi Día técnico, OT, Inventario.
- **Hallazgos:** `P1-10`, `P2-01`: usa `created_date` en vez de la ventana real de ejecución, filtra `ActividadTecnica.branch_id` aunque el schema no lo define, conserva `CERRADA` y deja `tecnicosIdle: null`.

### 3.6 Análisis de Trabajo — PASS WITH ISSUES

- **Frontend:** `src/pages/AnalisisTrabajo.jsx`, `useOrgAdminMetrics.jsx`.
- **Backend:** ninguno específico.
- **Entities:** `ActividadTecnica`, `OrdenTrabajo`, `Inventario`.
- **Authorization:** UI solo `ORG_ADMIN`; consultas directas org-wide.
- **Flujo real:** muestra salud del taller, tiempos, reproceso, antigüedad y repuestos.
- **Integraciones:** Taller, Actividades, Inventario.
- **Hallazgos:** `P1-10`: “repuestos usados” depende de `ActividadTecnica.inventario_id`, no del ledger real de inventario; antigüedad ignora el filtro de fecha/branch seleccionado.

### 3.7 Operación — FAIL

- **Frontend:** `src/pages/Operacion.jsx`.
- **Backend:** ninguno específico; consultas directas.
- **Entities:** `OrdenTrabajo`, `Cliente`, `UserAccount`, `Branch`, `Cotizacion`, `Garantia`.
- **Authorization:** UI para `ORG_ADMIN`/`BRANCH_ADMIN`; el filtro de branch no es una frontera server-side.
- **Flujo real:** muestra OT activas, técnicos, cotizaciones y garantías con filtros locales.
- **Integraciones:** Cola, Cotizaciones, Garantías, Usuarios.
- **Hallazgos:** `P0-06`, `P1-11`: filtra cotizaciones por `branch_id`, campo ausente en `Cotizacion`; omite estados `APROBADA` y `PRUEBAS`; “+48h” usa `updated_date`, no última actividad; el nombre de branch puede no cargarse para `BRANCH_ADMIN`.

### 3.8 Órdenes de Trabajo — PASS WITH ISSUES

- **Frontend:** `src/pages/OrdenesTrabajo.jsx`, `src/pages/ExpedienteOT.jsx`, componentes `ot/`, `expediente/` y diagnóstico.
- **Backend:** `createWorkOrder`, `listWorkOrders`, `reassignWorkOrderTechnician`, `initTechnicalActivity`, `transitionWorkOrderStatus`, gateways DMR/QA.
- **Entities:** `Cliente`, `Equipo`, `OrdenTrabajo`, `DiagnosticMasterRecord`, `Prediagnostico`, `DiagnosticoTecnico`, `DiagnosticoDocumento`, `OTEvent`, `ActividadTecnica`, `Cotizacion`, `Venta`.
- **Authorization:** gateways críticos resuelven membresía canónica y tenant; listado y reasignación no confinan branch, y entidades relacionadas siguen org-wide.
- **Flujo real:** recepción y asignación están orquestadas e idempotentes; lifecycle y QA poseen gates; expediente consolida datos, salvo cotizaciones.
- **Integraciones:** toda la cadena E2E.
- **Hallazgos:** `P0-01`, `P0-04`, `P0-05`, `P0-06`, `P1-04`, `P1-12`. `ExpedienteOT` consulta `Cotizacion.referencia_ot_id`; el campo canónico es `orden_trabajo_id`.

### 3.9 Cola de Revisión — PASS WITH ISSUES

- **Frontend:** `src/pages/ColaRevision.jsx`.
- **Backend:** `listWorkOrders`, `reassignWorkOrderTechnician`.
- **Entities:** `OrdenTrabajo`, `Cliente`, `Equipo`, `UserAccount`, `OTEvent`.
- **Authorization:** rol y tenant se validan en asignación; no se compara la sucursal de OT, caller y técnico destino.
- **Flujo real:** lista OT pendientes y asigna/reasigna de forma idempotente con auditoría canónica.
- **Integraciones:** Recepción, Mi Día, OT, Actividad técnica.
- **Hallazgos:** `P0-06`, `P1-12`; la suite de asignación pasa 21 casos, pero no prueba ni implementa el límite branch.

### 3.10 Agenda — PASS WITH ISSUES

- **Frontend:** `src/pages/Agenda.jsx`.
- **Backend:** no hay gateway transaccional de citas.
- **Entities:** `Cita`, `OrdenTrabajo`, `Cliente`, `UserAccount`.
- **Authorization:** guard UI; RLS por organización sin rol/branch.
- **Flujo real:** crea/edita citas y valida solapamiento mediante lectura previa en navegador.
- **Integraciones:** OT, Clientes y técnicos.
- **Hallazgos:** `P0-01`, `P0-06`, `P1-06`: dos solicitudes concurrentes pueden superar el precheck y crear doble reserva.

### 3.11 Reciclaje — PASS WITH ISSUES

- **Frontend:** `src/pages/Reciclaje.jsx`.
- **Backend:** ninguno específico.
- **Entities:** `Reciclaje`.
- **Authorization:** guard para admin/branch/técnico; mutación real es CRUD directo org-wide.
- **Flujo real:** registra y actualiza materiales, destino e impacto.
- **Integraciones:** no existe vínculo obligatorio con una OT, equipo, baja o movimiento de inventario.
- **Hallazgos:** `P0-01`, `P1-13`, `P2-01`.

### 3.12 Calidad — PASS WITH ISSUES

- **Frontend:** `src/pages/Calidad.jsx`.
- **Backend:** ninguno específico.
- **Entities:** `NoConformidad`.
- **Authorization:** guard admin/branch; CRUD directo org-wide.
- **Flujo real:** registra severidad, causa, acción y estado de una no conformidad.
- **Integraciones:** no obliga relación con OT, técnico, evidencia QA o ciclo de reproceso.
- **Hallazgos:** `P0-01`, `P1-13`.

### 3.13 Punto de Venta — FAIL

- **Frontend:** `src/pages/PuntoVenta.jsx`.
- **Backend:** `createSale`, `processPostSaleActions`, `transitionWorkOrderStatus`.
- **Entities:** `Venta`, `VentaItem`, `Inventario`, `InventarioHistorial`, `Cotizacion`, `OrdenTrabajo`, `Garantia`, `OTEvent`.
- **Authorization:** `createSale` limita roles y tenant, pero las entidades comerciales permiten bypass directo; `BRANCH_ADMIN` no queda confinado a su branch fuera de validaciones puntuales.
- **Flujo real:** construye carrito, cobra por gateway idempotente, descuenta stock con CAS y reconcilia respuestas ambiguas.
- **Integraciones:** Cotización, OT, Inventario, Finanzas, Garantía, Entrega.
- **Hallazgos:** `P0-01`, `P0-02`, `P1-08`. La suite atómica pasa 19/19, pero usa el mismo payload confiado y no prueba manipulación de precios/totales contra fuente autoritativa.

### 3.14 Historial de Ventas — PASS WITH ISSUES

- **Frontend:** `src/pages/VentasHistorial.jsx`.
- **Backend:** ninguno específico.
- **Entities:** `Venta`, `Cliente`, `OrdenTrabajo`.
- **Authorization:** guard UI; lectura org-wide y sin enforcement branch.
- **Flujo real:** filtra, busca y abre detalle de ventas.
- **Integraciones:** POS, Clientes, OT.
- **Hallazgos:** `P0-06`, `P2-02`: carga colecciones completas y filtra en cliente, sin cursor/paginación gobernada.

### 3.15 Cotizaciones — FAIL

- **Frontend:** `src/pages/VentasCotizaciones.jsx`, `src/components/ventas/GestionCotizaciones.jsx`, `FormularioCotizacion.jsx`, `AprobacionesPanel.jsx`, `src/pages/PortalCotizacion.jsx`.
- **Backend:** decisión pública en `transitionWorkOrderStatus`; conversión final en `createSale`.
- **Entities:** `Cotizacion`, `DiagnosticoDocumento`, `OrdenTrabajo`, `Venta`, `VentaItem`, `OTEvent`.
- **Authorization:** página por roles; edición/envío/preconversión usan entidad directa. Portal valida token server-side.
- **Flujo real:** crea y calcula cotización en cliente, solicita/aplica aprobación de descuento, envía token, recibe decisión pública y precrea venta antes de POS.
- **Integraciones:** Diagnóstico, OT, POS, Inventario, Cliente.
- **Hallazgos:** `P0-01`, `P0-02`, `P0-04`, `P1-08`: la ruta embebida crea `Venta` y `VentaItem` uno por uno; la cancelación de preload borra la venta pero no sus items.

### 3.16 Garantías — PASS WITH ISSUES

- **Frontend:** `src/pages/VentasGarantias.jsx`, `src/pages/PortalGarantia.jsx`, `src/components/ot/EntregarOT.jsx`.
- **Backend:** lectura pública gobernada por `getPublicCommercialDocument`; emisión de reparación permanece en cliente durante entrega.
- **Entities:** `Garantia`, `Cliente`, `OrdenTrabajo`, `Venta`.
- **Authorization:** consulta autenticada por guard; portal por token; creación subyacente es CRUD directo.
- **Flujo real:** consulta garantías y emite una garantía de reparación al confirmar entrega.
- **Integraciones:** Venta, OT, Configuración y Entrega.
- **Hallazgos:** `P0-01`, `P0-05`, `P0-06`.

### 3.17 Clientes / Customer 360 — PASS WITH ISSUES

- **Frontend:** `src/pages/Clientes.jsx`, paneles Customer 360 y `GestionCotizaciones` embebido.
- **Backend:** `createClient`, `updateClient`, `customer360Gateway`.
- **Entities:** `Cliente`, `Equipo`, `OrdenTrabajo`, `Venta`, `Cotizacion`, mensajes/actividad Customer 360.
- **Authorization:** Customer 360 y mutaciones principales resuelven tenant/rol en backend; el listado y cotizaciones embebidas conservan SDK directo.
- **Flujo real:** crea/edita cliente, muestra equipos/OT/ventas y registra comunicaciones gobernadas.
- **Integraciones:** CRM, Recepción, Expediente, Ventas.
- **Hallazgos:** `P0-01`, `P1-05`, `P1-08`. La suite Customer 360 pasa 8/8 junto con CRM.

### 3.18 CRM — PASS WITH ISSUES

- **Frontend:** `src/pages/CRM.jsx`, `src/api/crm.js`.
- **Backend:** `base44/functions/crmGateway/entry.ts`.
- **Entities:** `Lead`, `Cliente`, `UserAccount`.
- **Authorization:** gateway valida membresía canónica, tenant, rol y restricciones de reasignación.
- **Flujo real:** lista, crea, actualiza/asigna y convierte lead a cliente.
- **Integraciones:** Clientes, Ventas, Mi Día.
- **Hallazgos:** `P1-05`: el precheck de identificación y `Cliente.create` no están protegidos por lock/índice único; conversiones concurrentes pueden duplicar clientes antes de que el lead quede marcado.

### 3.19 Inventario — FAIL

- **Frontend:** `src/pages/Inventario.jsx`.
- **Backend:** `createInventoryItem`, `updateInventoryItem`, `adjustInventoryStock`, consumo de venta dentro de `createSale`.
- **Entities:** `Inventario`, `InventarioHistorial`, `CategoriaInventario`, `VentaItem`.
- **Authorization:** guard UI incluye inventario/técnico/admin; funciones aplican roles, pero RLS permite CRUD org-wide y el historial es editable/borrable.
- **Flujo real:** crea/edita productos y stock; el ajuste especializado usa CAS, pero el formulario normal también modifica `cantidad_disponible` por una ruta no CAS.
- **Integraciones:** Diagnóstico, Cotización, POS, métricas, Reciclaje.
- **Hallazgos:** `P0-01`, `P0-03`, `P1-07`, `P1-14`: no hay reservas operativas, devolución ni ledger de consumo de reparación; `cantidad_reservada` solo se inicializa a cero.

### 3.20 Configuración — FAIL

- **Frontend:** `src/pages/Settings.jsx`, `UserManagementPanel.jsx`, `ConfiguracionNegocio.jsx`, `TerminosYCondicionesPanel.jsx`, `GarantiaPanel.jsx`.
- **Backend:** `identityGateway`, `manageOrgUser`.
- **Entities:** `Organization`, `Branch`, `UserAccount`, `TerminosYCondiciones`.
- **Authorization:** página solo `ORG_ADMIN`; identidad/organización gobernadas, pero sucursales y términos usan SDK directo.
- **Flujo real:** edita configuración, crea/elimina branches, invita/cambia usuarios y versiona términos.
- **Integraciones:** Recepción, POS, Entrega, todos los permisos.
- **Hallazgos:** `P0-01`, `P0-07`, `P1-09`, `P1-15`: identidad central conserva TRP-SEC-006, pero operaciones de usuarios existentes fallan por símbolo no definido; versión de términos desactiva primero y crea después sin compensación.

## 4. Todos los P0

### P0-01 — CRUD operacional elude roles y gateways

- **Archivos:** `base44/entities/Inventario.jsonc:164-204`, `InventarioHistorial.jsonc:60-100`, `Venta.jsonc:173-213`, `Cotizacion.jsonc:245-285`, `OrdenTrabajo.jsonc:371-411` y schemas operacionales con el mismo patrón.
- **Causa:** RLS verifica únicamente `organization_id == user.data.organization_id` o rol platform `admin`; no distingue `UserAccount.role`, `branch_id` ni operación permitida. Campos críticos de venta, cotización, inventario y auditoría no están protegidos por FLS.
- **Impacto:** cualquier miembro activo del tenant puede omitir `PageGuard`, invocar SDK directo y alterar/borrar objetos fuera de su rol. Incluye stock, precios, estados comerciales, tokens y registros de historial. Es escalación de privilegios dentro del tenant; no se demostró escape entre organizaciones.
- **Solución recomendada:** convertir las entidades críticas en backend-owned (FLS `write:false` para cliente), exponer gateways por comando con rol/branch server-side y hacer append-only todo ledger/auditoría.
- **Riesgo de regresión:** alto; muchas pantallas dependen de CRUD directo y deben migrarse por dominio con pruebas negativas por rol.

### P0-02 — El backend de cobro confía montos y precios del cliente

- **Archivos:** `base44/functions/createSale/entry.ts:72-140`, `683-724`; `src/pages/PuntoVenta.jsx:297-329`.
- **Causa:** `normalizeInput` solo exige números finitos/positivos; acepta `precio_unitario`, subtotal de línea, subtotal, impuesto, descuento y total. No recompone importes desde catálogo/snapshot ni verifica igualdad con la cotización aprobada. `convertQuote` reclama la conversión, pero no exige `estado === aprobada` ni equivalencia del contenido.
- **Impacto:** un request manipulado puede cobrar y persistir cualquier total, aun asociado a una cotización distinta/no aprobada, mientras el stock se descuenta correctamente. Es riesgo directo de cobro incorrecto y fraude interno.
- **Solución recomendada:** resolver precios/costos/impuestos en backend, recalcular todas las sumas, validar tolerancia exacta y, para OT, usar exclusivamente snapshot aprobado e inmutable.
- **Riesgo de regresión:** alto en descuentos, impuestos, servicios manuales, preloads e idempotencia; ampliar suite con payloads adulterados.

### P0-03 — Dos dueños de stock y auditoría no atómica

- **Archivos:** `src/pages/Inventario.jsx:126-149,621-626`; `base44/functions/updateInventoryItem/entry.ts:172-212`; `adjustInventoryStock/entry.ts`; schemas de inventario/historial.
- **Causa:** el editor estándar envía `cantidad_disponible`; `updateInventoryItem` crea historial antes de actualizar stock, ignora fallos de historial y ejecuta `Inventario.update` sin CAS. Esto coexiste con `adjustInventoryStock`, que sí implementa CAS/rollback.
- **Impacto:** ediciones concurrentes pierden cantidades; puede quedar historial de un cambio no aplicado o stock cambiado sin historial. El historial también es mutable/borrable por cliente.
- **Solución recomendada:** prohibir FLS de cantidad, centralizar todo movimiento en un único ledger/CAS, crear evidencia obligatoria después de claim exitoso y compensar de manera propietaria.
- **Riesgo de regresión:** alto; migrar edición inicial, ajustes, ventas, devoluciones y reparaciones al mismo contrato.

### P0-04 — Decisión pública de cotización puede persistir parcialmente

- **Archivos:** `base44/functions/transitionWorkOrderStatus/entry.ts:693-879`.
- **Causa:** actualiza `Cotizacion`, luego `DiagnosticoDocumento`, luego OT por CAS y finalmente `OTEvent`, sin adquirir lifecycle lock ni compensar escrituras anteriores.
- **Impacto:** falla o carrera en la OT puede dejar cotización/documento aprobados con OT aún `COTIZADA`/otro estado, o estado sin evento. Una transición concurrente incompatible vuelve permanente la divergencia.
- **Solución recomendada:** comando idempotente con lock propietario sobre OT/cotización, snapshot/claim previo, orden de commit definido y compensación/reconciliación completa.
- **Riesgo de regresión:** alto en portal público, reintentos y decisiones simultáneas.

### P0-05 — Evidencia legal y garantía se crean antes de confirmar entrega

- **Archivos:** `src/components/ot/EntregarOT.jsx:76-160`.
- **Causa:** finaliza actividades, crea `EntregaLog` y activa `Garantia`; solo al final solicita transición `ENTREGADA`. Hay idempotencia básica por existencia, pero no compensación si la transición falla.
- **Impacto:** puede existir constancia legal de entrega y garantía activa mientras la OT permanece `FINALIZADA`, o actividades cerradas sin entrega. Una carrera hacia estado incompatible impide reconciliación automática.
- **Solución recomendada:** mover entrega completa a un gateway backend con lock lifecycle, revalidación de pago/configuración, commit/reconciliación de log-garantía-estado-evento y estados explícitos `PENDING/COMMITTED` si no hay transacción.
- **Riesgo de regresión:** alto; involucra pago, garantía, actividad, notificaciones y portal.

### P0-06 — Límite por sucursal no es una frontera server-side

- **Archivos:** `base44/functions/listWorkOrders/entry.ts:11-20`, `reassignWorkOrderTechnician/entry.ts:35-64`, `getFinancialMetrics/entry.ts:12-43`; RLS org-wide; páginas Finanzas/Operación/Agenda/Ventas.
- **Causa:** se resuelve organización/rol, pero no se aplica `account.branch_id` a lectura, reasignación o agregación. La UI filtra cuando puede.
- **Impacto:** `BRANCH_ADMIN` puede leer métricas y OT de otras sucursales y reasignar OTs/técnicos fuera de su branch; otros roles pueden consultar datos org-wide mediante entidades. Es escalación de privilegios y fuga intra-tenant.
- **Solución recomendada:** centralizar una política `allowedBranches`, exigir/derivar branch en cada gateway y denegar mismatch entre caller, recurso y destino; eliminar lecturas directas sensibles.
- **Riesgo de regresión:** medio-alto, especialmente ORG_ADMIN multi-branch y SUPER_ADMIN impersonado.

### P0-07 — Settings permite eliminar la última sucursal y orfanar operaciones

- **Archivos:** `src/pages/Settings.jsx:41-66` y schema `Branch`.
- **Causa:** la query se guarda como `['branches', effectiveOrgId]`, pero el guard de borrado lee `getQueryData(['branches'])`; normalmente obtiene `undefined` y no bloquea. No hay gateway que compruebe referencias a usuarios, OT o ventas.
- **Impacto:** un admin —o cualquier miembro que explote el CRUD directo— puede borrar la última o una sucursal en uso. Recepción y venta requieren branch válido, y los registros existentes quedan referenciando un ID inexistente.
- **Solución recomendada:** gateway backend ORG_ADMIN, prohibición de borrar última branch activa, chequeo de dependencias y preferencia por desactivar; FLS/backend ownership del schema.
- **Riesgo de regresión:** medio; afecta onboarding, asignaciones, filtros y datos históricos.

## 5. Todos los P1

### P1-01 — Contrato financiero frontend/backend incompatible

- **Archivos:** `getFinancialMetrics/entry.ts:24-128`, `Finanzas.jsx:100-158`, `DashboardOrgAdmin.jsx:60-69,163-164`.
- **Causa/impacto:** nombres de fechas y forma de respuesta no coinciden; filtros se ignoran y tarjetas muestran cero. `avg_margin` es monto promedio, no porcentaje.
- **Solución:** DTO versionado compartido, branch y periodo validados, tests contractuales de consumidor. **Regresión:** media.

### P1-02 — Ventas Métricas confunde ventas creadas con dinero cobrado

- **Archivos:** `src/pages/VentasMetricas.jsx:58-150`.
- **Causa/impacto:** excluye solo `anulada`; infla total, ticket y métodos con estados no pagados. Conversión excluye rechazadas del denominador.
- **Solución:** métricas server-side sobre `estado=pagada` y definición explícita de embudo. **Regresión:** baja-media.

### P1-03 — Mi Día usa campos comerciales obsoletos

- **Archivos:** `MiDiaSales.jsx:84,217-218`, `MiDiaAdmin.jsx:141-143,446-447`, `Venta.jsonc`.
- **Causa/impacto:** `created_by`/`estado_pago` no existen; ventas propias desaparecen y ventas pagadas parecen pendientes.
- **Solución:** usar `created_by_user_id` y `estado`; agregar fixtures por rol. **Regresión:** baja.

### P1-04 — Expediente no relaciona cotización canónica

- **Archivos:** `src/pages/ExpedienteOT.jsx:98-108`, `Cotizacion.jsonc`.
- **Causa/impacto:** consulta `referencia_ot_id` en vez de `orden_trabajo_id`; omite cotización, aprobación y contexto comercial.
- **Solución:** usar FK canónica vía gateway/DTO del expediente. **Regresión:** baja.

### P1-05 — Duplicados de Cliente/Lead por carrera

- **Archivos:** `crmGateway/entry.ts:126-169`, `createClient/entry.ts`.
- **Causa/impacto:** precheck y create separados sin lock/índice único; dos conversiones pueden crear clientes duplicados.
- **Solución:** clave normalizada única o resource lock y claim idempotente. **Regresión:** media.

### P1-06 — Solapamiento de Agenda no es atómico

- **Archivos:** `src/pages/Agenda.jsx:114-198`.
- **Causa/impacto:** read-before-write en navegador; doble booking concurrente.
- **Solución:** gateway con lock por técnico/intervalo y validación server-side. **Regresión:** media.

### P1-07 — Reservas, devoluciones y consumo de reparación no implementados

- **Archivos:** `Inventario.jsonc:56`, `createInventoryItem/entry.ts:156`, diagnóstico/cotización.
- **Causa/impacto:** `cantidad_reservada` solo se inicializa; cotizar/reparar no reserva ni consume, no hay devolución/ledger de reparación. Stock puede venderse antes de ejecutar una reparación aprobada.
- **Solución:** modelo de movimientos y reservas con estados, expiración y commit/rollback por OT. **Regresión:** alta.

### P1-08 — Preconversión de cotización fragmenta Venta/VentaItem

- **Archivos:** `GestionCotizaciones.jsx:449-503`, `PuntoVenta.jsx:91-112`.
- **Causa/impacto:** crea venta borrador e items secuencialmente; fallos dejan huérfanos. Cancelación borra `Venta` pero no `VentaItem`.
- **Solución:** eliminar preload persistido o crear/cancelar agregado en backend idempotente. **Regresión:** alta.

### P1-09 — Gestión de usuarios referencia helper no importado

- **Archivos:** `base44/functions/manageOrgUser/entry.ts:7,94,142,183,191,231,236`.
- **Causa/impacto:** importa solo `resolveAuthorizedContext` pero llama `isCanonicalActiveUserAccount`; reinvitación y cambios/protección del último admin lanzan `ReferenceError`.
- **Solución:** importar helper compartido y ampliar suite a todas las acciones. **Regresión:** baja.

### P1-10 — Productividad/Análisis calculan métricas semánticamente incorrectas

- **Archivos:** `src/components/hooks/useOrgAdminMetrics.jsx:45-160`, `useTecnicoMetrics.jsx:83-84`.
- **Causa/impacto:** fecha de creación, branch inexistente en actividad, estado `CERRADA`, repuestos no ligados al ledger y tendencias placeholder.
- **Solución:** agregador backend con definiciones de negocio y snapshots. **Regresión:** media.

### P1-11 — Operación usa campos/estados incompletos

- **Archivos:** `src/pages/Operacion.jsx:72-212`, schema `Cotizacion`.
- **Causa/impacto:** `Cotizacion.branch_id` no existe; cotizaciones branch vacías, estados críticos omitidos y SLA basado en timestamp incorrecto.
- **Solución:** derivar branch por OT, usar estados canónicos y `ultima_actividad_at`. **Regresión:** baja-media.

### P1-12 — Listados y KPIs truncados sin indicarlo

- **Archivos:** `listWorkOrders/entry.ts:16-20`, `DashboardOrgAdmin.jsx`, páginas con filtros cliente-side.
- **Causa/impacto:** OT limitadas a 100 y otras colecciones a 500; conteos dejan de representar el tenant al crecer.
- **Solución:** paginación/cursor y endpoints de agregación. **Regresión:** media.

### P1-13 — Calidad y Reciclaje no producen una historia operacional enlazada

- **Archivos:** `src/pages/Calidad.jsx`, `src/pages/Reciclaje.jsx`.
- **Causa/impacto:** objetos independientes sin FK/gate obligatorio a OT, QA, equipo o stock; no demuestran reproceso ni baja física.
- **Solución:** comandos de lifecycle y relaciones obligatorias cuando el origen sea una OT/inventario. **Regresión:** media.

### P1-14 — Alta de inventario usa unicidad precheck y auditoría opcional

- **Archivos:** `createInventoryItem/entry.ts`.
- **Causa/impacto:** códigos/SKU pueden duplicarse concurrentemente; si falla historial, el producto queda creado sin evidencia inicial.
- **Solución:** clave única/lock y auditoría obligatoria compensable. **Regresión:** media.

### P1-15 — Activación de términos no es atómica

- **Archivos:** `src/components/admin/TerminosYCondicionesPanel.jsx:29-57`.
- **Causa/impacto:** desactiva versiones antes de crear/activar la nueva; una falla deja a la organización sin términos activos y puede bloquear recepción.
- **Solución:** gateway que cree nueva versión y haga swap mediante CAS/compensación. **Regresión:** media.

## 6. Todos los P2

### P2-01 — Semántica/UX incompleta en módulos secundarios

- **Archivos:** Productividad, AnalisisTrabajo, Reciclaje y Calidad.
- **Causa/impacto:** placeholders como `tecnicosIdle:null`, tendencia `sin_datos`, estados heredados y feedback limitado; no corrompe datos por sí solo.
- **Solución:** catálogo de métricas, empty states y definición de estados. **Regresión:** baja.

### P2-02 — Carga completa y filtros cliente-side

- **Archivos:** Historial, Garantías, Clientes, Agenda, dashboards.
- **Causa/impacto:** latencia y memoria crecientes; resultados pueden truncarse sin una estrategia uniforme.
- **Solución:** paginación, búsqueda backend y virtualización. **Regresión:** baja-media.

### P2-03 — Feedback de errores inconsistente

- **Archivos:** páginas que usan `alert`, `console.warn` o catches no visibles, incluidos PuntoVenta/Agenda/Entrega.
- **Causa/impacto:** el operador no recibe correlación o guía de recuperación; dificulta QA y soporte.
- **Solución:** error boundary/toasts persistentes con códigos seguros y retry explícito. **Regresión:** baja.

### P2-04 — Gate de typecheck no está operativo

- **Archivos:** `jsconfig.json` y tipado de componentes UI/JSX en gran parte de `src/`.
- **Causa/impacto:** `npm run typecheck` devuelve numerosos errores de props/aritmética; reduce la capacidad de detectar regresiones estáticas, aunque no prueba un fallo runtime concreto.
- **Solución:** corregir declaraciones de UI, gradual typing y convertir el gate en obligatorio cuando llegue a cero. **Regresión:** baja si se aborda incrementalmente.

## 7. Riesgos transversales y auditoría E2E

| Etapa | Evidencia actual | Estado | Riesgo |
|---|---|---:|---|
| Cliente | Gateway/Customer 360 tenant-aware | PASS WITH ISSUES | Carrera de duplicados |
| Equipo | Recepción resuelve/reutiliza equipo | PASS | Contrato atómico pasa |
| OT / Recepción | Agregado Equipo+OT+DMR+evento compensable | PASS | 24/24 pruebas |
| Asignación | Gateway con lock, rollback e idempotencia | PASS WITH ISSUES | Falta branch server-side |
| Smart Intake | Gateway canónico y puente legacy | PASS | 23 pruebas + 12 source checks |
| Diagnóstico | DMR/diagnóstico/Documento enlazados | PASS WITH ISSUES | Decisión posterior puede fragmentarse |
| Cotización | Se crea/envía desde cliente | FAIL | Montos mutables y CRUD directo |
| Aprobación | Portal valida token | FAIL | Multi-write no atómico (`P0-04`) |
| Reparación | Actividades y lifecycle disponibles | PASS WITH ISSUES | Actividades editables y alcance org-wide |
| Inventario | Venta usa CAS; editor no | FAIL | Dos dueños de stock, sin reservas |
| Pruebas QA | Evidencia backend-owned y freshness gate | PASS | Suite de seguridad pasa |
| Finalización | Lifecycle exige QA exitoso | PASS | Side effects posteriores aún frágiles |
| Cobro | Orquestador idempotente/compensable | FAIL | Montos confiados al cliente (`P0-02`) |
| Venta | Agregado atómico con reconciliación | PASS WITH ISSUES | Preload directo puede dejar huérfanos |
| Garantía | Portal público gobernado | FAIL | Emisión previa a commit de entrega |
| Entrega | Estado exige venta pagada | FAIL | Log/garantía/actividad previos al estado |

**Conclusión transversal:** los IDs principales (`cliente_id`, `equipo_id`, `orden_trabajo_id`, `referencia_ot_id`, `venta_id`) son mayormente coherentes en gateways nuevos, pero existen dos dialectos comerciales (`orden_trabajo_id` para Cotización y `referencia_ot_id` para Venta) que ya provocaron una consulta rota en Expediente. La historia deja de ser confiable en Cotización/Aprobación y vuelve a fragmentarse en Inventario, preload de Venta y Entrega. Un E2E feliz puede completar, pero no es seguro bajo manipulación, concurrencia o falla parcial.

No se detectó un bypass confirmado entre `organization_id` distintos en los gateways de TRP-SEC-006. Sí se confirmó acceso excesivo entre roles y sucursales de la misma organización; debe tratarse como autorización, no como una reapertura especulativa de identidad soberana.

## 8. Dependencias entre módulos

| Productor | Contrato/dato | Consumidores | Riesgo actual |
|---|---|---|---|
| Settings / Branch | `branch_id`, membresía/rol | Recepción, OT, Agenda, POS, Finanzas | Branch borrable y no confinado server-side |
| Clientes/CRM | `cliente_id` | Equipo, OT, Cotización, Venta, Garantía | Duplicados concurrentes |
| Recepción | `equipo_id`, `orden_trabajo_id`, DMR, evento | Asignación, Smart Intake, Expediente | Base sólida y compensable |
| Diagnóstico | documento, repuestos, snapshot | Cotización, QA, Garantía | Repuestos no reservan stock |
| Cotización | `orden_trabajo_id`, items/totales, aprobación | POS, Expediente, Finanzas | Mutable/directa; Expediente usa FK errónea |
| Inventario | cantidades, costo y ledger | POS, Finanzas, métricas, reparación | Dos rutas de stock y ledger mutable |
| POS/createSale | Venta/Items, pago, descuento stock | Finanzas, Entrega, Garantía | Atomicidad estructural buena; monto no autoritativo |
| QA/Lifecycle | estado y eventos | Finalización, Entrega, dashboards | Core gobernado; decisión pública es excepción |
| Entrega | log, garantía, `ENTREGADA` | Portal, Historial, CRM | Orden de side effects no atómico |

## 9. Release Blockers

No autorizar merge mientras cualquiera de los siguientes permanezca abierto:

1. `P0-01`: bloquear escrituras directas a entidades críticas y hacer cumplir rol/branch en backend.
2. `P0-02`: recomputar y validar importes de venta/cotización server-side.
3. `P0-03`: unificar movimientos de inventario bajo CAS + ledger inmutable.
4. `P0-04`: atomicidad/reconciliación de decisión pública.
5. `P0-05`: gateway transaccional/reconciliable de entrega.
6. `P0-06`: confinamiento real de sucursal.
7. `P0-07`: impedir borrar última branch o una branch referenciada.

Para cerrar cada P0 se requieren pruebas negativas que llamen directamente al backend/entidad, no solo pruebas del flujo UI feliz.

## 10. MVP Fixes

Además de todos los P0, el MVP requiere cerrar `P1-01` a `P1-15`. Prioridad funcional mínima:

- corregir Finanzas/Dashboard, Mi Día, Ventas Métricas, Expediente y Operación para que representen datos persistidos reales;
- añadir unicidad/locks en Cliente y Agenda;
- eliminar preloads comerciales fragmentados;
- reparar `manageOrgUser` y versionado de términos;
- implementar reservas/consumo/devolución de inventario o, si se reduce alcance, declarar y bloquear explícitamente esos flujos;
- enlazar Calidad/Reciclaje con la operación cuando se originan en OT;
- introducir paginación/agregación antes de exceder límites silenciosos.

Después debe ejecutarse QA manual autenticado con al menos ORG_ADMIN, BRANCH_ADMIN, SALES, TECHNICIAN, INVENTORY y SUPPORT, dos sucursales y dos tenants.

## 11. Post-MVP Backlog

- `P2-01`: completar semántica de métricas y empty states.
- `P2-02`: paginación/búsqueda server-side uniforme.
- `P2-03`: manejo de errores con correlación y recuperación.
- `P2-04`: sanear tipado y promover `typecheck` a gate obligatorio.
- Consolidar nombres de FK (`orden_trabajo_id` vs. `referencia_ot_id`) mediante DTOs de dominio.
- Reemplazar agregaciones client-side por read models versionados y observables.

## 12. Orden recomendado de corrección

1. **Cerrar bypass de autorización (`P0-01`, `P0-06`)**: primero definir matriz rol/branch por entidad/comando; luego bloquear FLS y migrar callers.
2. **Asegurar dinero (`P0-02`)**: cálculo backend y snapshot aprobado; ampliar tests de manipulación.
3. **Unificar inventario (`P0-03`, `P1-07`, `P1-14`)**: ledger/CAS, reservas, devoluciones y consumo.
4. **Cerrar comandos lifecycle multi-write (`P0-04`, `P0-05`)**: aprobación y entrega con locks/reconciliación.
5. **Proteger topología organizacional (`P0-07`, `P1-09`, `P1-15`)**: branch, usuarios y términos.
6. **Reparar integridad comercial fragmentada (`P1-08`)**.
7. **Corregir contratos y relaciones visibles (`P1-01` a `P1-04`, `P1-10`, `P1-11`)**.
8. **Cerrar concurrencia restante (`P1-05`, `P1-06`)**.
9. **Completar módulos operacionales y escalabilidad (`P1-12`, `P1-13`)**.
10. **Reejecutar suites, lint, build y diff-check; después QA manual autenticado E2E antes de reconsiderar merge.**

### Validaciones diagnósticas ejecutadas

| Validación | Resultado |
|---|---:|
| `test:assignment` | PASS — 21 pruebas |
| `test:atomic-reception` | PASS — 24/24 |
| `test:smart-intake` | PASS — 23 pruebas + 12 source checks |
| `test:commercial-flow` | PASS — 16 checks |
| `test:atomic-sale` | PASS — 19/19 |
| `test:security-integrity` | PASS — 7/7 |
| `test:identity-tenant-security` | PASS — 7/7 |
| `test:crm-customer360` | PASS — 8/8 |
| `npm run lint` | PASS |
| `npm run typecheck` | FAIL — errores globales preexistentes de tipado JSX/props y operaciones Date |
| `git diff --check` antes del informe | PASS |
| Production build | No ejecutado: no era un gate solicitado para esta auditoría read only y genera artefactos locales |

Las suites PASS prueban propiedades de sus gateways, pero no cubren los bypasses de entidad, la autoridad de precios, el límite branch ni todas las fallas parciales enumeradas. Por eso no son evidencia suficiente para aprobar el merge.
