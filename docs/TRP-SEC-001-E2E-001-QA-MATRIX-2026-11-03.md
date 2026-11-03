# TRP-SEC-001 / E2E-001 — Matriz de aceptación y estado de ejecución
Fecha: 2026-11-03. App Base44 695d708948469128f473d080. Documento de QA; no se realizaron mutaciones de clientes ni publicación.

## Estado real verificado
- Baseline: commit ebc82144579952f7d72a9df128b5b389235bbcdd.
- AuditEvent tiene RLS create/read/update/delete=false para acceso directo. Su esquema no declara clave única ni garantía atómica por organization_id + audit_operation_id.
- scripts/verify-audit-concurrency-boundary.mjs: reproduce **dos filas** ante dos escritores concurrentes de una misma operación; el resultado PASS certifica **la reproducción del defecto**, no su resolución. **P0-AUD-01 abierto / NO-GO general**.
- Contratos ejecutados nuevamente: multiuser-audit 7/7, enterprise-branch-isolation 7/7, security-round2 13/13, impersonation-session-hardening 10/10 PASS. No equivalen a QA de navegador.
- Base44 Testing Agent: GET flows=[]; GET executions/latest-by-flow={}. **Ningún flujo de navegador registrado, ningún resultado E2E disponible**.
- El API beta de upsert NO proporciona atomicidad bajo solicitudes concurrentes. No usar como solución para AuditEvent.

## Matriz QA requerida (todas PENDIENTES)
| ID | Actor y escenario | Criterio PASS | Estado |
| --- | --- | --- | --- |
| SEC-QA-01 | ORG_ADMIN de empresa A | Ve solamente A y sucursales permitidas; CRM y operaciones válidas funcionan | PENDIENTE |
| SEC-QA-02 | BRANCH_ADMIN sucursal A1 | No consulta ni modifica datos A2 | PENDIENTE |
| SEC-QA-03 | SALES A1 | Puede crear/seguir prospectos y cotizaciones autorizadas, sin acceso admin | PENDIENTE |
| SEC-QA-04 | INVENTORY A1 | Puede consultar y ajustar stock autorizado, sin afectar A2 ni saldos de otra empresa | PENDIENTE |
| SEC-QA-05 | CUSTOMER_SERVICE A1 | Tiene atención autorizada; CRM queda denegado según política vigente | PENDIENTE |
| SEC-QA-06 | TECHNICIAN A1 | No ejecuta cobros/funciones comerciales privilegiadas | PENDIENTE |
| SEC-QA-07 | SUPER_ADMIN sin impersonación | Solo consola plataforma; sin escrituras tenant sin contexto válido | PENDIENTE |
| SEC-QA-08 | SUPER_ADMIN con impersonación | Contexto explícito y auditable; fin de impersonación limpia cachés y permisos | PENDIENTE |
| SEC-QA-09 | Usuario de empresa B | Sin lecturas, escrituras ni acceso a recursos de A mediante ID o URL | PENDIENTE |
| E2E-01 | Crear lead y convertir a cliente | Una conversión coherente y no duplicada | PENDIENTE |
| E2E-02 | Cliente → cotización borrador → envío | Totales canónicos, enlace correcto, sin editar después del envío | PENDIENTE |
| E2E-03 | Aprobación del cliente | Snapshot inmutable y evento, reserva de stock una vez | PENDIENTE |
| E2E-04 | Cotización aprobada → cobro | Una sola venta/cobro aun con reintentos y doble clic | PENDIENTE |
| E2E-05 | Stock y comprobante | Inventario descontado exactamente una vez, ledger correlacionado, comprobante correcto | PENDIENTE |
| E2E-06 | Fallas/reintentos controlados | Sin ventas pagadas duplicadas ni pérdidas de stock | PENDIENTE |
| AUD-QA-01 | 2+ escritores concurrentes en runtime aislado | Exactamente una fila por (organization_id,audit_operation_id) con persistencia atómica | BLOQUEADO |

## Reglas de ejecución
- No usar cuentas o datos reales de clientes para pruebas que creen ventas, cobros o cambios de stock.
- No lanzar Testing Agent de forma indiscriminada: primero crear fixtures y cuentas aisladas, roles, sucursales y un alcance explícito.
- Para cerrar P0-AUD-01 exigir primitiva de persistencia realmente atómica respaldada por plataforma y prueba real concurrente: documento o prueba mock no bastan.
- No hacer Publish ni declarar GO hasta reconcilación código/despliegues y aprobación de release.
- No introducir un segundo sistema de autorización ni cambios en COM-001...004 sin evidencia de regresión.

## Siguiente intervención mínima
1. Obtener soporte/confirmación técnica Base44 sobre índice único/constraint o transacción/compare-and-set para AuditEvent; si no existe, evaluar un almacén auditable transaccional aprobado o mantener release bloqueado.
2. Preparar tenant QA aislado y dos sucursales con roles de prueba; configurar recorridos de Testing Agent sin datos productivos.
3. Ejecutar controles de navegador multi-rol y E2E, registrar identidad, fecha, versión, capturas y resultados por caso.
4. Reconciliar runtime publicado y GitHub antes de dictamen GO/NO-GO.
