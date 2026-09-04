# TRP — checkpoint MVP READY TO SELL

Fecha: 2026-08-26
Estado: **código operativo listo para candidato de piloto; venta productiva todavía bloqueada por gates runtime y de release**

## Lectura ejecutiva

El recorrido funcional mínimo existe en el código y tiene contratos locales para
provisionamiento, usuarios, recepción, asignación, diagnóstico, decisión comercial,
reparación, venta/cobro operativo, entrega y auditoría. El cobro de la suscripción
TRP puede comenzar de forma manual por SINPE o transferencia; Stripe no es un
requisito del primer piloto.

TRP todavía no debe declararse READY TO SELL en producción. Falta demostrar la
garantía concurrente de AUD-01B en la app aislada, integrar la rama candidata con
el `main` vigente y ejecutar un recorrido E2E autenticado en Base44 con una misma
OT y evidencia correlacionada.

## Estado real de GitHub y rama

- Rama integrada: `codex/trp-aud-01b-blocker-fixes` en `c2acbe5`, que incorpora
  `origin/main` (`807fa5a`) y conserva los commits AUD-01B/monetización.
- El único solape previsto era `package.json`; Git resolvió la integración sin
  conflicto y el árbol integrado pasó build y regresiones.
- La rama está publicada y tiene el PR borrador #11. El último PR de
  estabilización relevante integrado en `main` es PR #10; los bloques
  comerciales/recepción anteriores llegaron por PR #9 y #8.
- GitHub está reautenticado y la rama rastrea
  `origin/codex/trp-aud-01b-blocker-fixes`.
- La CLI local de Base44 no está instalada en este checkout. No se ejecutó deploy,
  publish, sync ni escritura remota.
- `CEOs/` continúa preexistente, sin tracking y sin cambios de este trabajo.

## Camino funcional mínimo

| Etapa | Autoridad/camino canónico encontrado | Evidencia local | Gate restante |
| --- | --- | --- | --- |
| Crear/configurar empresa | `identityGateway` + manifest de provisionamiento | 6/6 provisioning PASS | E2E autenticado y aprobación para crear tenant real |
| Crear sucursal y usuarios | `manageBranchLifecycle` + `manageOrgUser` | 43/43 branch PASS; observación de plan 5/5 PASS | Validar invitación real y onboarding en staging |
| Cliente, equipo y recepción | gateways + `createWorkOrder` | 24/24 atomic reception PASS | Una OT real correlacionada en staging |
| Asignar técnico | escritor canónico de asignación | 22/22 assignment PASS | Handoff visual/permisos con usuarios reales |
| Diagnosticar y reparar | comandos técnicos y lifecycle soberano | 7 grupos technical PASS | Persistencia real de actividad/QA en staging |
| Autorizar cotización | core comercial soberano y token público acotado | 12/12 commercial integrity PASS | Envío y decisión reales de prueba |
| Cobrar/finalizar | `createSale` server-authoritative | 28/28 atomic sale PASS | Configuración real de método de pago operativo |
| Entregar | `deliverWorkOrder` | 35/35 delivery PASS | Comprobante/garantía reales en staging |
| Conservar trazabilidad | `AuditEvent` append-only | 20/20 identity + 7/7 coverage PASS | AUD-01B concurrente runtime |
| Controlar plan/acceso | `Organization.plan`, `Organization.status`, autoridad backend y observación de límites | basic/pro/premium + suspensión canónica; observación 5/5 PASS | Cobro manual fuera de TRP; sin enforcement automático |

## BLOQUEA VENTA

1. **AUD-01B runtime:** ejecutar el probe de dos escritores en
   `TRP-AUD01B-CAS-CERT-DO-NOT-PUBLISH` y clasificar CAS como `PROVEN`,
   `UNPROVEN` o `INVALID`. La causa del bloqueo es autenticación válida ausente
   para la app aislada, no una contraseña que deba reintentarse a ciegas.
2. **Integración/release:** incorporar `origin/main` a la rama candidata, resolver
   el solape de `package.json`, repetir gates, publicar la rama, abrir PR y obtener
   revisión/merge. GitHub requiere reautenticación antes de push/PR.
3. **E2E Base44 autenticado:** completar una misma OT desde provisionamiento hasta
   entrega con evidencia correlacionada. Los contratos locales prueban segmentos,
   pero no sustituyen ese recorrido runtime.
4. **Publish controlado:** desplegar schema/funciones/site únicamente después del
   merge y con autorización explícita; ejecutar auditorías de datos legacy y
   smoke tests antes de crear datos de un cliente.
5. **Cobro comercial habilitado:** antes de recibir dinero, confirmar la cuenta
   SINPE/transferencia, responsable de conciliación y documento fiscal/comercial.
   La evidencia del pago debe quedar fuera del repositorio.

## NECESARIO PARA PILOTO

1. Seleccionar un taller y responsable de soporte; aprobar creación de su tenant y
   datos productivos.
2. Preparar usuarios/roles, sucursal, categorías, inventario mínimo y un caso real
   para la sesión guiada.
3. Registrar manualmente plan fundador, fecha de inicio, pago confirmado y estado
   de acceso; no suspender automáticamente durante el piloto.
4. Ejecutar onboarding de 60–90 minutos y scorecards de días 3, 7 y 14.
5. Revisar los eventos `PLAN_ENTITLEMENT_OBSERVED_EXCEEDED` antes de considerar
   cualquier límite obligatorio.

## POST-MVP

- Stripe Checkout, webhooks, invoices, refunds, dunning y portal self-service.
- Entidad `Subscription`/billing ledger y suspensión/reactivación automática.
- Enforcement concurrente de cuotas, downgrades y flags Premium.
- Enterprise, BAC/Municipalidad, RustDesk, AI Technician Glasses, SLA y
  personalizaciones sofisticadas.

## Cambio de monetización de este checkpoint

La observación de cupos de usuario ahora cubre toda transición que agrega consumo:
invitación nueva, reinvitación desde `suspended`, activación y edición integral que
reactive la cuenta. `invited` y `active` consumen asiento; `suspended` no. El cambio
solo observa después de la mutación persistida y no introduce `PLAN_LIMIT_REACHED`
ni una respuesta de rechazo.

La prueba de entitlements pasó de dos verificaciones de texto a cinco pruebas que
incluyen comportamiento de límites, transiciones de asiento, uso persistido,
sucursales y Premium ilimitado. También se actualizó de 23 a 24 el inventario de
callers de `appendAuditEvent`, porque el observador de planes es un escritor de
auditoría adicional.

La regresión descubrió además que el mock de `test:multiuser-policy-pipeline`
seguía representando la auditoría anterior al claim CAS. El runtime de prueba fue
alineado con `Organization.audit_claim_*` y con lookup por `audit_operation_id`;
el pipeline canónico volvió a 12/12 PASS sin cambiar código productivo.

## Distancia real

- **Listo para demo guiada:** sí, sujeto al entorno existente.
- **Listo para PR candidato:** sí; PR #11 está abierto como borrador y la rama
  integrada pasó build/regresión.
- **Listo para piloto pagado productivo:** no; faltan AUD-01B runtime, PR/merge,
  publish autorizado y E2E autenticado.
- **Listo para venta autoservicio o escala multi-cliente:** no; eso es post-MVP.

El camino mínimo restante tiene tres gates técnicos secuenciales: certificar
AUD-01B, integrar/publicar/revisar el candidato y validar el E2E autenticado antes
del publish productivo. Después de eso, la activación comercial puede operar con
cobro manual y acompañamiento sin construir billing automático.
