# TRP — MB-01E · Auditoría concurrente (7 noviembre 2026)

Aplicación: 695d708948469128f473d080. Rama: trp-sales-mb01-20261106.

## Trabajo ejecutado
- Inspeccionado el checkpoint consolidado de cinco megabloques del 6 de noviembre y los checkpoints CRM/Caja/Auditoría.
- Revisado el writer de `base44/functions/_shared/auditEvent.ts`: secuencia `filter` → `create` sin primitiva de unicidad atómica.
- Añadido `scripts/verify-audit-race-diagnostic.mjs`: barrera determinista que permite a dos solicitudes observar el mismo estado vacío antes de crear.
- Ejecutado `npx tsx --test scripts/verify-audit-race-diagnostic.mjs`: **1/1 PASS diagnóstico**, se reprodujeron **dos registros con el mismo audit_operation_id**. PASS describe la reproducción, NO la seguridad del sistema.
- `git diff --check` sin incidencias; no se repitieron suites anteriormente certificadas.

## Decisión técnica
- **P0-AUD-01 / #13 NO-GO**. Un chequeo previo o una segunda lectura no establece unicidad bajo carreras. Requiere writer respaldado por constraint UNIQUE persistente en (organization_id, audit_operation_id), o comando serializado con garantía equivalente, y reconciliación de replay y conflictos.
- Una rama Base44 de código **no prueba aislamiento del backend/datos**: no sustituir el writer ni emitir escrituras contra datos reales sin un entorno independiente certificado.
- La cancelación definitiva de borrador sigue sin writer soberano, idempotente y auditable; no restaurar `Venta.delete` en UI.
- CRM Lead→Cliente necesita unicidad transaccional org/identidad y pruebas concurrentes; los chequeos existentes son mitigaciones.

## Criterios de cierre
1. Almacén transaccional aislado con unicidad demostrable y rollback documentado.
2. Prueba autenticada: dos solicitudes simultáneas por (organización, operación) ⇒ exactamente un registro, ambas respuestas reconciliables; mismo ID con payload incompatible ⇒ conflicto explícito.
3. Prueba de cancelación de borrador: rol/sucursal, estado permitido, replay, preservación de historial, concurrencia y audit trail.
4. Ejecutar QA-02..09 en fixture multiempresa aislado, sin repetir pruebas ya aprobadas.
5. Revisión del diff y autorización antes de un único merge. Sin Publish/deploy y sin operaciones sobre COMPU STORE.

## Estado
MB-01 PARCIAL; MB-02 PARCIAL; MB-03 QA PENDIENTE; MB-04 PARCIAL; MB-05 QA PENDIENTE; beta NO-GO.
