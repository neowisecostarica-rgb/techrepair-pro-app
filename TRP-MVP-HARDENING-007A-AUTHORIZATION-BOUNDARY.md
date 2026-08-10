# TRP-MVP-HARDENING-007A — Operational Authorization Boundary

Fecha: 2026-08-10

Rama: `rc/product-readiness-stabilization`

Alcance: únicamente `P0-01` y `P0-06`

## 1. Causa raíz

La autorización operacional terminaba en controles de interfaz (`PageGuard`, navegación, botones y filtros) y en RLS que comprobaban solo `user.data.organization_id`. Esas RLS no reproducían la membresía canónica, el rol ni la sucursal. Por ello, un miembro activo podía omitir la UI y usar el SDK directamente para leer o mutar entidades fuera de su función dentro del tenant.

La segunda causa era que varios gateways resolvían organización y rol, pero no convertían `UserAccount.branch_id` en una frontera obligatoria. Algunos comandos aceptaban `branch_id`, `orgId` o snapshots operacionales enviados por el cliente.

## 2. Entidades afectadas

Se convirtieron en backend-owned 40 schemas operacionales:

- Taller y lifecycle: `ActividadTecnica`, `BloqueoTecnico`, `Cita`, `DiagnosticMasterRecord`, `Diagnostico`, `DiagnosticoDocumento`, `DiagnosticoEvidencia`, `DiagnosticoResultado`, `DiagnosticoTecnico`, `EntregaLog`, `NoConformidad`, `NotaInterna`, `OrdenTrabajo`, `PreDiagnostico`, `PruebaTecnica`, `Reciclaje`, `RegistroTiempo`, `SolicitudTecnica`, `WorkflowGate` y `OTEvent`.
- Comercial: `Cotizacion`, `Garantia`, `Venta`, `VentaItem` y `ComprobanteVentaLog`.
- Clientes/CRM: `Cliente`, `Equipo`, `Lead` y `MensajeCliente`.
- Inventario/configuración: `Inventario`, `InventarioHistorial`, `CategoriaInventario`, `Servicio`, `TerminosYCondiciones` y `Branch`.
- Administración financiera: `Expense`, `PurchaseInvoice`, `Supplier` y `SupplierPayment`.
- Operación transversal: `Notificacion`.

Se incorporó `branch_id` a los registros que necesitaban propiedad explícita y no la tenían: citas, clientes, cotizaciones, garantías, inventario, equipos, reciclaje, no conformidades, solicitudes técnicas, leads, mensajes, notificaciones y pagos a proveedores. Cuando existe una relación canónica con OT, venta, inventario o factura, la sucursal también se deriva del padre.

## 3. Rutas directas encontradas

Se encontraron CRUD directos desde páginas/componentes de agenda, expediente, clientes, cotizaciones, ventas, garantías, inventario, gastos, cuentas por pagar, proveedores, notificaciones, términos y configuración. También se encontraron rutas backend privilegiadas que confiaban contexto del request:

- `dmrOrchestrator` aceptaba `orgId`, OT, cliente y equipo completos enviados por el caller.
- `updateCustodiaData` leía y mutaba una OT por ID con service role sin resolver membresía canónica.
- `handleOTLifecycleEvent` aceptaba el snapshot de OT enviado por el caller.
- Smart Intake, métricas, listados y asignación resolvían tenant, pero no siempre branch.

El SDK crudo dejó de exportarse. La compatibilidad de CRUD de las pantallas termina ahora en `operationalGateway`; el acceso directo real contra las entidades falla por RLS.

## 4. Gateways/backend utilizados o creados

- Nuevo `operationalGateway`: aplica entidad × operación × rol, sanitiza filtros/mutaciones, deriva actor, tenant y branch, resuelve relaciones y rechaza recursos fuera de scope.
- Nuevo `_shared/operationalAuthorization.ts`: política central, branch canónico, validación de hints y ownership de registros.
- Gateways existentes endurecidos: `createWorkOrder`, `listWorkOrders`, `reassignWorkOrderTechnician`, `getSmartIntakeByWorkOrder`, `transitionWorkOrderStatus`, `initTechnicalActivity`, `recordTechnicalTest`, `updateDiagnosticoResumen`, `updateWorkOrderAttentionStatus`, `changeWorkOrderStatus`, `createSale`, `processPostSaleActions`, `create/updateClient`, `createEquipment`, `create/update/adjustInventory`, `crmGateway`, `customer360Gateway`, `getFinancialMetrics`, `updateCustodiaData`, `dmrOrchestrator`, `handleOTLifecycleEvent` y el camino manual de `processOTEvent`.
- Los comandos con lógica de negocio siguen siendo dueños exclusivos de lifecycle, venta pagada, stock, recepción, asignación y pruebas. El gateway genérico no puede forzar esos estados ni escribir sus ledgers.

## 5. RLS modificadas

Los 40 schemas listados en la sección 2 quedaron con:

```json
{ "create": false, "read": false, "update": false, "delete": false }
```

`Lead` y `MensajeCliente` se consumen únicamente mediante `crmGateway` y `customer360Gateway`. Las otras 38 entidades se exponen, cuando su política lo permite, mediante el gateway operacional o mediante comandos de dominio dedicados. `InventarioHistorial`, `OTEvent`, DMR, evidencias de QA y logs permanecen append-only/backend-only.

## 6. Matriz Role × Operation

| Rol canónico | Lectura | Mutación permitida | Denegaciones relevantes |
|---|---|---|---|
| `ORG_ADMIN` | Toda la organización autorizada | Administración, comercial y operación según política; lifecycle/stock/venta pagada por comandos dedicados | No cruza tenant; superadmin requiere impersonación para mutar |
| `BRANCH_ADMIN` | Solo branch canónico; catálogos org-wide compartidos cuando aplica | Administración operacional, agenda, comercial, gastos y CxP de su branch | No puede elegir Branch B, reasignar OT B, pagar factura B ni modificar recursos B |
| `SALES` | Comercial, clientes, OT, agenda e inventario de consulta de su branch | Ventas borrador, items borrador, cotizaciones permitidas, agenda y recepción; venta pagada por `createSale` | Sin configuración, proveedores, gastos, inventario administrativo ni operación técnica |
| `TECHNICIAN` | OT y objetos técnicos de su branch | Solo OT asignada, actividad/diagnóstico/evidencia propia y citas propias | Sin ventas, cotizaciones, configuración, gastos ni mutación de inventario |
| `INVENTORY` | Catálogo/stock e historial permitido de su branch | Stock únicamente por funciones dedicadas | Sin CRUD comercial, técnico o administrativo |
| `SUPPORT` | Clientes, equipos, OT y contexto comercial necesario de su branch | Intake/atención estrictamente permitido | Sin venta, configuración, stock o lifecycle privilegiado |
| `SUPER_ADMIN` soberano | Lectura global gobernada | Ninguna mutación tenant sin impersonación activa | La organización del request nunca sustituye la impersonación canónica |

## 7. Modelo de branch scope

La cadena efectiva es:

`authenticated identity → UserAccount active → role → organization_id → canonical branch_id → operation policy → resource ownership`

- `ORG_ADMIN` tiene scope organizacional.
- Todo rol operacional no organizacional requiere `UserAccount.branch_id`; si falta, falla cerrado con `OPERATIONAL_BRANCH_REQUIRED`.
- Un `branch_id` del frontend es solo un hint. Si contradice la membresía, se rechaza con `OPERATIONAL_CROSS_BRANCH_DENIED`.
- Recursos directos usan `record.branch_id`.
- Recursos relacionados derivan branch de OT, venta, inventario, garantía, factura de compra o sujeto de workflow.
- Clientes/equipos legacy se autorizan por branch explícito o por sus OT/ventas autorizadas.
- Reasignación valida tanto la OT como la membresía branch del técnico destino.

## 8. Bypasses eliminados

- CRUD directo contra SDK/API en entidades operacionales.
- Escalación mediante `PageGuard`, botones ocultos, filtros o navegación.
- Suplantación de `organization_id`, `branch_id`, actor y campos internos de locks/ledgers.
- Lectura de OT, métricas, CRM, Customer 360, agenda, ventas, garantías, inventario y administración de Branch B por un miembro de Branch A.
- Reasignación de OT o técnico destino fuera del branch.
- Creación de ventas pagadas, escritura de historial de stock, QA, DMR, OTEvent y WorkflowGate por CRUD genérico.
- DMR construido con snapshots suministrados por el caller y custodia/eventos legacy ejecutados sobre una OT no revalidada.

## 9. Pruebas nuevas

`npm run test:operational-authorization` cubre:

- capacidades y denegaciones de `SALES`;
- capacidades técnicas y denegaciones administrativas de `TECHNICIAN`;
- `BRANCH_ADMIN` A contra recursos/hints de B;
- acceso organizacional de `ORG_ADMIN`;
- membresías sin branch que fallan cerrado;
- RLS backend-owned de los 40 schemas;
- terminación del adapter frontend en el gateway;
- branch enforcement en OT, métricas, reasignación, ventas, inventario, CRM y Customer 360;
- rechazo de tenant/branch/snapshots controlados por caller en rutas privilegiadas.

La suite de asignación agrega además una ejecución contractual real donde Branch A intenta reasignar una OT de Branch B y recibe `403` sin mutación ni evento.

## 10. Regresiones

Gates ejecutados sobre el working tree final:

| Gate | Resultado |
|---|---|
| Operational Authorization | PASS |
| Identity/Tenant Security | PASS |
| Security & Integrity | PASS |
| CRM / Customer 360 | PASS |
| Recepción atómica | PASS |
| Asignación | PASS |
| Smart Intake | PASS |
| Comercial / lifecycle | PASS |
| Venta atómica / inventario | PASS |
| ESLint | PASS |
| Production build | PASS |
| `git diff --check` | PASS |

## 11. Riesgos residuales

- Registros legacy sin `branch_id` y sin relación canónica derivable quedan invisibles para roles branch-scoped; `ORG_ADMIN` conserva acceso. Debe revisarse/backfillearse la data real antes de concluir QA.
- El gateway limita lecturas a 500 registros y algunas derivaciones legacy a 100 relaciones; es fail-closed, pero puede omitir resultados en tenants grandes. La paginación sigue siendo un P1 separado.
- La validez del canal service-context de las automations Base44 y el comportamiento RLS desplegado deben verificarse tras sync/publish con sesiones autenticadas reales.
- `P0-02`, `P0-03`, `P0-04`, `P0-05` y `P0-07` permanecen fuera de este bloque por instrucción expresa. No se alteraron precios autoritativos, atomicidad de inventario, decisión pública, entrega/garantía ni borrado de última sucursal.
- No se rediseñó UI. Los roles legacy no canónicos como `CFO` no adquieren autoridad backend; la matriz soberana continúa siendo la definida por `UserAccount` en TRP-SEC-006.
- No se modificó `CEOs/` ni artefactos de Wise Brain.
