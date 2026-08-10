# TRP-MVP-HARDENING-007B — Commercial Integrity

## Alcance y resultado

Este bloque cierra exclusivamente `P0-02` (valores comerciales controlados por el cliente) y `P0-04` (atomicidad de aprobación y lifecycle comercial). No modifica `P0-03`, `P0-05`, `P0-07`, P1, P2, `CEOs/` ni Wise Brain.

## 1. Causa raíz

`createSale` normalizaba y persistía `precio_unitario`, `subtotal`, `impuesto`, `descuento_total` y `total` recibidos desde el navegador. Aunque la venta atómica ya protegía idempotencia e inventario, el payload del cliente todavía era la fuente financiera.

La decisión pública de una cotización ejecutaba escrituras secuenciales sobre `Cotizacion`, `DiagnosticoDocumento`, `OrdenTrabajo` y `OTEvent`, sin un estado durable de operación ni compare-and-set compartido. Una falla intermedia podía dejar efectos parciales sin un contrato explícito de recuperación.

Además, el gateway operacional protegía parte de las transiciones en `update`, pero no impedía que una creación intentara nacer aprobada/convertida, y dos pantallas aún precreaban una `Venta`/`VentaItem` borrador o generaban el token público en frontend.

## 2. Modelo comercial anterior

- El POS calculaba totales y `createSale` los aceptaba como valores finales.
- Una conversión desde cotización podía precargar y persistir una venta borrador desde UI.
- La aprobación pública actualizaba primero la cotización y luego evidencia, OT y evento.
- El replay se deduplicaba parcialmente por estado/tipo de evento, sin identidad durable de la decisión.
- El token y metadata de envío podían originarse en el navegador.

## 3. Nueva frontera server-authoritative

`createSale` recibe intención y resuelve la fuente comercial dentro del tenant y branch canónicos:

- Con cotización: carga la cotización persistida, exige `estado=aprobada`, `decision_status=COMMITTED` y snapshot aprobado; valida organización, branch, cliente y OT; recalcula las líneas y rechaza discrepancias.
- Venta directa: resuelve cada producto desde `Inventario` de la sucursal o cada servicio activo desde `Servicio`; usa precio persistido, aplica descuento efectivo cero y calcula IVA y total server-side.
- El costo de inventario se toma exclusivamente del registro persistido al crear `VentaItem`.
- Los hints financieros del frontend se comparan con el cálculo canónico. Una diferencia falla cerrada y nunca se persiste.

El gateway operacional también recalcula los totales de la cotización al crear, editar o enviar. Toda cotización nueva inicia en `borrador` y `SIN_CONVERTIR`; un descuento por línea superior al 20% requiere decisión interna de `ORG_ADMIN`.

## 4. Client intent vs server authority

| CLIENT INTENT | SERVER AUTHORITY |
|---|---|
| ID de producto/servicio | Existencia, tenant, branch, estado y precio de catálogo |
| Cantidad solicitada | Cantidad permitida por snapshot/catálogo y validación de stock existente |
| Método de pago | Subtotal, descuento efectivo, impuesto y total |
| Cliente, OT y cotización solicitados | Relaciones canónicas cliente–OT–cotización–branch |
| Tipo/origen operacional | Estado de cotización, snapshot aprobado y estado de conversión |
| Clave idempotente para venta directa | Costo, costo snapshot, utilidad y derivados financieros |

## 5. Flujo quote → approval → OT

1. El gateway crea la cotización únicamente como borrador y deriva sus totales.
2. El envío valida contenido y aprobación interna requerida; backend genera token, expiración, actor, timestamp e historial.
3. La decisión pública valida token, expiración, unicidad, estado previo, quote y OT.
4. Para aprobación se recalculan las líneas y se construye el snapshot inmutable.
5. Se toma el lifecycle lock persistido de la OT.
6. La cotización se reclama por CAS como `PENDING` con `decision_operation_key` determinista.
7. Se confirma evidencia diagnóstica, transición de OT y un único `OTEvent` identificado por la operación.
8. La cotización se confirma al final como `COMMITTED` y `aprobada`/`rechazada`.
9. Conversión a venta ocurre únicamente dentro de `createSale`, que vuelve a verificar aprobación/snapshot y reclama la conversión por CAS.

Transiciones públicas válidas: `enviada → aprobada` o `enviada → rechazada`. Una decisión opuesta, una reaprobación arbitraria o la conversión de una cotización sin aprobación confirmada fallan cerradas.

## 6. Atomicidad, compensación y recuperación

Base44 no expone en este flujo una transacción multi-entidad única. No se simula una transacción inexistente. El contrato usa:

- operation key determinista por cotización y decisión;
- lifecycle lock persistido para serializar la OT;
- compare-and-set en cotización y OT;
- estado durable `PENDING → COMMITTED`;
- escrituras ordenadas, dejando el commit de cotización al final;
- reconciliación de respuestas ambiguas;
- side effects idempotentes y retry seguro.

Una falla intermedia conserva `decision_status=PENDING` y `decision_error`. El mismo retry revalida y completa únicamente los efectos faltantes. Una respuesta ambigua del commit final se reconcilia leyendo el estado persistido antes de reportar error.

## 7. Idempotencia

- La venta mantiene el lock persistido, operation key y fingerprint ya existentes.
- El fingerprint ahora se calcula sobre valores canónicos, no sobre importes manipulables.
- Reintentos de venta retornan la misma venta y no duplican cobro, líneas, historial ni descuento de inventario.
- La aprobación usa `quote-decision:{quoteId}:{targetStatus}`.
- Replay de aprobación retorna éxito idempotente y conserva un único evento.
- Dos aprobaciones concurrentes se serializan; el intento que no obtiene lock recibe conflicto retryable.

## 8. Escrituras directas eliminadas o cerradas

- `GestionCotizaciones` dejó de crear `Venta`, `VentaItem` y estado de conversión desde UI.
- La conversión navega al POS; la materialización pertenece a `createSale`.
- `GestionCotizaciones` y `VentasCotizaciones` dejaron de generar tokens y timestamps públicos.
- El gateway genera token, expiración, actor e historial de envío.
- El gateway rechaza estados finales, campos de conversión y creación ya aprobada/convertida.
- El gateway ignora campos internos de decisión, token, snapshot y auditoría enviados por cliente.
- La implementación pública secuencial anterior fue retirada; solo se enruta al handler recuperable V2.
- La aprobación/rechazo interno de descuentos usa campos separados y gobernados; no falsifica el estado final del cliente.

## 9. Pruebas de tampering

`test:atomic-sale` contiene 25/25 casos PASS e incluye intentos de alterar:

- subtotal, impuesto y total;
- precio unitario;
- descuento;
- costo/costo snapshot;
- cantidad frente al snapshot;
- quote ID;
- OT relacionada;
- cotización no aprobada.

También confirma venta directa legítima, conversión aprobada, idempotencia, concurrencia, compensación de inventario y reconciliación de respuestas ambiguas.

## 10. Replay, concurrencia y falla parcial

`test:commercial-integrity` contiene 7/7 casos PASS:

- commit completo de quote, snapshot, OT, evidencia y evento;
- replay idempotente sin duplicar evento;
- falla intermedia y recuperación por retry;
- respuesta ambigua del commit final reconciliada;
- dos aprobaciones simultáneas serializadas;
- decisión opuesta rechazada;
- contratos fuente de gateway, lifecycle y venta autoritativa.

## 11. Regresiones

Resultados de la validación del bloque:

| Gate | Resultado |
|---|---|
| Commercial Integrity | PASS — 7/7 |
| Operational Authorization | PASS — 9 grupos |
| Identity/Tenant Security | PASS — 7/7 |
| Security & Integrity | PASS — 7/7 |
| CRM/Customer 360 | PASS — 8/8 |
| Recepción atómica | PASS — 24/24 |
| Asignación | PASS — 22 |
| Smart Intake | PASS — 23 + 12 source checks |
| Comercial/lifecycle | PASS — 16 |
| Venta atómica/inventario | PASS — 25/25 |
| ESLint | PASS |
| Production build | PASS |
| `git diff --check` | PASS |

## 12. Riesgos residuales

- Cotizaciones legacy marcadas aprobadas sin `decision_status=COMMITTED` o sin snapshot aprobado fallan cerradas al convertir. Deben reenviarse/reaprobarse o migrarse explícitamente; no se adopta evidencia incompleta de forma automática.
- Una operación `PENDING` requiere replay del mismo endpoint para completar; no se agregó un job de recuperación automática en este bloque. El error queda durable y no es silencioso.
- La tasa de IVA permanece centralizada en 13%. Una futura configuración tributaria por organización requerirá un contrato adicional.
- La venta directa no admite descuentos arbitrarios desde cliente; cualquier política de descuento directo futura deberá tener una fuente persistida/autorizada.
- Integridad avanzada de inventario (`P0-03`) y atomicidad de entrega/garantía (`P0-05`) permanecen explícitamente fuera de este bloque.
- Falta el gate manual autenticado en Base44 sobre datos reales y cotizaciones legacy.

## Estado

`BLOCK B CLOSED — READY FOR BLOCK C`
