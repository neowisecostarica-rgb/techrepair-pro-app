# TRP Pre-Publish GO/NO-GO Checklist + Runtime Inventory

> **Estado:** NO-GO / recuperación de runtime en curso — actualizado 2026-09-07.
> **Criterio GO global:** 85/85 smoke tests PASS + todos los checklist items ✅ + aprobación explícita.
>
> **Incidente runtime 2026-09-07:** los 20 `function.jsonc` correspondientes exactamente a las 20 funciones históricamente ausentes ya existen y están versionados en Git. `identityGateway` fue probado como deploy unitario mediante CLI; la operación agotó el tiempo de espera y la consulta posterior de funciones remotas también expiró. Preview continúa mostrando `Error de Autenticación`. No se desplegaron deliberadamente las otras 19 funciones y no se hizo Publish.

---

## Sección 1 — Inventario runtime de funciones

### 1.1 Funciones NO desplegadas en producción (20) — críticas

> Hallazgo histórico: creadas el/after Aug 10, 2026 y ausentes del registro runtime observado. Estado fuente actual 2026-09-07: las 20 poseen `function.jsonc` válido y versionado. El estado remoto actual no se puede certificar todavía porque `functions list` expira; NO asumir que siguen ausentes ni que fueron registradas.

| # | Función | Creada | Estado prod | Estado staging | Smoke test |
|---|---------|--------|------------|----------------|-----------|
| 1 | `identityGateway` | Aug 10 | ❌ Ausente | ⬜ | Flujo 1, 2, 3 |
| 2 | `operationalGateway` | Aug 10 | ❌ Ausente | ⬜ | Scripts 1, 2 |
| 3 | `customer360Gateway` | Aug 10 | ❌ Ausente | ⬜ | Script 8 |
| 4 | `crmGateway` | Aug 10 | ❌ Ausente | ⬜ | Script 8 |
| 5 | `deliverWorkOrder` | Aug 11 | ❌ Ausente | ⬜ | Flujo 7 |
| 6 | `validateTenantReadiness` | Aug 12 | ❌ Ausente | ⬜ | Flujo 2 |
| 7 | `technicalActivityCommand` | Aug 12 | ❌ Ausente | ⬜ | Flujo 5 |
| 8 | `technicalRequestCommand` | Aug 12 | ❌ Ausente | ⬜ | Script 7 |
| 9 | `technicalRecordCommand` | Aug 12 | ❌ Ausente | ⬜ | Script 7 |
| 10 | `notificationCommand` | Aug 12 | ❌ Ausente | ⬜ | Scripts |
| 11 | `manageBranchLifecycle` | Aug 12 | ❌ Ausente | ⬜ | Script 12 |
| 12 | `issuePublicDocumentToken` | Aug 12 | ❌ Ausente | ⬜ | Flujo 7 |
| 13 | `getWorkOrderTechnicalContext` | Aug 12 | ❌ Ausente | ⬜ | Flujo 5 |
| 14 | `recordTechnicalTest` | Aug 12 | ❌ Ausente | ⬜ | Flujo 5 |
| 15 | `revealDeviceCredential` | Aug 12 | ❌ Ausente | ⬜ | Script 4 |
| 16 | `migrateSupportRole` | Aug 12 | ❌ Ausente | ⬜ | Flujo 3 |
| 17 | `auditBranchLegacyData` | Aug 12 | ❌ Ausente | ⬜ | Script 12 |
| 18 | `auditDeliveryLegacyData` | Aug 12 | ❌ Ausente | ⬜ | Script 11 |
| 19 | `auditInventoryLegacyData` | Aug 12 | ❌ Ausente | ⬜ | Script 9 |
| 20 | `auditMultiUserLegacyData` | Aug 12 | ❌ Ausente | ⬜ | Script 3 |

### 1.2 Funciones desplegadas en producción (31) — se actualizan a Aug 17

> Hallazgo base: creadas may 2 – jun 15, 2026. Desplegadas pero en versión pre-Aug-10. Un Publish las actualiza a Aug 17 (commits `8ccab0161109` + `44194d003a4e`).

| # | Función | Creada | Último commit | Estado prod | Estado staging |
|---|---------|--------|---------------|-------------|-----------------|
| 1 | `adjustInventoryStock` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 2 | `changeWorkOrderStatus` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 3 | `createCategoriaInventario` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 4 | `createClient` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 5 | `createEquipment` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 6 | `createInventoryItem` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 7 | `createSale` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 8 | `createWorkOrder` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 9 | `dmrAuditor` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 10 | `dmrOrchestrator` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 11 | `dmrUtils` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 12 | `getFinancialMetrics` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 13 | `getOTEventHealth` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 14 | `getPublicCommercialDocument` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 15 | `getSmartIntakeByWorkOrder` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 16 | `handleOTLifecycleEvent` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 17 | `initTechnicalActivity` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 18 | `listWorkOrders` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 19 | `manageOrgUser` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 20 | `migrateLegacyUsers` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 21 | `processOTEvent` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 22 | `processPostSaleActions` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 23 | `reassignWorkOrderTechnician` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 24 | `repairUserIdentity` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 25 | `resourceLockLite` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 26 | `transitionWorkOrderStatus` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 27 | `updateClient` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 28 | `updateCustodiaData` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 29 | `updateDiagnosticoResumen` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 30 | `updateInventoryItem` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |
| 31 | `updateWorkOrderAttentionStatus` | may 2 | Aug 17 | ⚠️ Stale | ⬜ |

### 1.3 Dependencias `_shared` (verificar despliegue)
| Módulo | Importado por | Estado staging |
|--------|---------------|-----------------|
| `auditEvent.ts` | múltiples | ⬜ |
| `superAdminAudit.ts` | identityGateway, manageOrgUser | ⬜ |
| `tenantProvisioning.ts` | identityGateway | ⬜ |
| `roleCapabilities.ts` | identityGateway | ⬜ |
| `publicResourceRelations.ts` | operationalGateway | ⬜ |
| `inventoryStockCas.ts` | createSale, adjustInventoryStock | ⬜ |
| `workOrderLifecycleLock.ts` | transitionWorkOrderStatus | ⬜ |
| `commandPolicy.ts` | comandos soberanos | ⬜ |
| `operationalAuthorization.ts` | operationalGateway | ⬜ |
| `lifecycleAuthority.ts` | lifecycle | ⬜ |
| `userAuthorization.ts` | múltiples | ⬜ |
| `dataProjections.ts` | operationalGateway | ⬜ |
| `branchProtection.ts` | operationalGateway | ⬜ |
| `commandExecution.ts` | comandos | ⬜ |
| `inventoryMutationService.ts` | inventario | ⬜ |
| `qaEvidence.ts` | QA | ⬜ |
| `publicTokenContract.ts` | tokens públicos | ⬜ |
| `lifecycleSecurity.ts` | lifecycle | ⬜ |
| `lifecycleAuditRecovery.ts` | lifecycle | ⬜ |
| `commercialIntegrity.ts` | comercial | ⬜ |
| `branchLifecycle.ts` | manageBranchLifecycle | ⬜ |
| `controlledPilotAuthority.ts` | piloto | ⬜ |
| `deliveryAtomicity.ts` | deliverWorkOrder | ⬜ |
| `deviceCredentialAudit.ts` | revealDeviceCredential | ⬜ |

### 1.4 Historial de Publish / recuperación runtime

**Evidencia 2026-09-07**
- App verificada: TechRepair Pro / TRP Legacy — `695d708948469128f473d080`.
- Fuente actual: 51 directorios de función con `entry.ts`.
- Manifests actuales: 20 `function.jsonc`, correspondientes a las 20 funciones históricamente ausentes.
- Los manifests fueron incorporados en Git el 2026-09-03 en commits `b4f9ae1`, `e6f9ae6`, `ec4ea23` (`External agent changes`).
- `identityGateway/function.jsonc`: `name=identityGateway`, `entry=entry.ts`.
- `identityGateway/entry.ts` expone `Deno.serve` y sus imports `_shared` requeridos están presentes en fuente.
- Build/lint/validaciones PRE-DEPLOY ejecutadas sin error bloqueante antes del intento unitario.
- Intento autorizado: `base44 functions deploy identityGateway` solamente.
- Resultado: timeout del comando; posterior `base44 functions list` también timeout.
- Preview posterior: sigue mostrando `Error de Autenticación`.
- STOP aplicado: no repetir deploy, no desplegar las otras 19, no Publish hasta obtener evidencia del estado del job/registro remoto.

**Comparación con respaldo histórico aportado por Gustavo (2026-09-07)**
- El ZIP histórico no contiene `base44/functions/` ni `identityGateway`.
- La versión histórica autenticaba directamente con SDK/Base44; la arquitectura actual inicia contexto mediante `identityGateway`.
- Conclusión operacional: el ZIP se conserva como baseline histórico; NO restaurarlo sobre TRP actual porque eliminaría la arquitectura multi-tenant/gateways/endurecimiento posterior.

### 1.5 Historial de Publish (completar desde dashboard)
| Campo | Valor |
|-------|-------|
| Fecha último Publish exitoso | ⬜ (confirmar entre jun 15 – Aug 10) |
| Hubo deploys fallidos post-Aug-10? | ⬜ |
| Logs de build de identityGateway | ⬜ |
| Logs de build de operationalGateway | ⬜ |

---

## Sección 2 — Checklist GO/NO-GO

### 2.1 Reconciliación
- [ ] Draft del workspace = GitHub `main` (último commit Aug 26)
- [ ] `identityGateway/entry.ts` reconciliado (L1, L89, L193, L587)
- [ ] `operationalGateway/entry.ts` reconciliado (L1, L671, L728)
- [ ] Todas las entidades reconciliadas
- [ ] Todas las dependencias `_shared` presentes

### 2.2 Staging
- [ ] App de staging creada y aislada
- [ ] Sincronizada con `main`
- [ ] Datos sintéticos creados (1 org, 1 branch, 8 roles)
- [ ] Aislamiento confirmado (no comparte DB, secrets, webhooks)
- [ ] 51 funciones + `_shared` desplegadas en staging (verificadas función por función)

### 2.3 Smoke tests
- [ ] 14/14 scripts de contrato PASS
- [ ] 7/7 flujos E2E PASS
- [ ] 64/64 verificaciones de seguridad PASS
- [ ] **85/85 total PASS**

### 2.4 Seguridad y fail-closed
- [ ] Lectura branch-scoped para todos los roles
- [ ] Escritura solo vía comandos canónicos
- [ ] 401 sin auth
- [ ] 403 rol insuficiente
- [ ] Cross-tenant rechazado
- [ ] Campos backend-only no manipulables
- [ ] Writers alternativos bloqueados
- [ ] Controlled pilot sin bypass

### 2.5 Rollback y pausa
- [ ] Mecanismo de pausa global de mutaciones diseñado
- [ ] Implementado en rama feature
- [ ] Ensayado en staging (Runbook B)
- [ ] Runbook de rollback documentado (Runbook C)
- [ ] Drain window definido (60s)

### 2.6 Producción
- [ ] Checklist de producción revisado
- [ ] Historial de Publish confirmado
- [ ] Logs de build revisados
- [ ] **Aprobación explícita para Publish** (separada de este plan)

---

## Sección 3 — Decisión

| Criterio | Estado |
|----------|--------|
| Reconciliación | ⬜ |
| Staging aislado | ⬜ |
| 85/85 smoke tests | ⬜ |
| Seguridad fail-closed | ⬜ |
| Rollback ensayado | ⬜ |
| Aprobación explícita | ⬜ |

### Decisión final
- [ ] **GO** — Solicitar autorización de Publish a producción
- [x] **NO-GO TEMPORAL** — Bloqueador de plataforma/runtime: el deploy unitario de `identityGateway` y la consulta remota expiran; Preview continúa bloqueado. Escalar al soporte Base44 antes de desplegar las otras 19 funciones.

**Firmado:** _______________ **Fecha:** _______________

---

## Sección 4 — Riesgos residuales conocidos

1. **Las 31 funciones desplegadas están stale** (pre-Aug-10). Un Publish las actualiza a Aug 17, cambiando comportamiento (endurecimiento RBAC/piloto). Requiere validación de que los cambios de Aug 17 (`operator-only mutation envelope`, `multi-user stabilization`) están listos para producción.
2. **No hay rollback nativo en Base44.** El rollback es git-revert + re-publish + pausa de mutaciones. El mecanismo de pausa debe estar ensayado antes de depender de él.
3. **Datos escritos por código nuevo** no se revierten con git-revert. Si el nuevo lifecycle escribe estados de OT/Actividad/AuditEvent distintos, la pausa de mutaciones previene escrituras futuras pero no deshace las ya hechas. Considerar reconciliación de datos post-rollback si aplica.
4. **Webhooks de providers** siguen apuntando a producción. Durante la ventana de Publish/rollback, los webhooks pueden encolar eventos. Confirmar que los procesadores de eventos son idempotentes.