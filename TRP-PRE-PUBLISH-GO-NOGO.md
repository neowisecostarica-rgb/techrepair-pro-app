# TRP Pre-Publish GO/NO-GO Checklist + Runtime Inventory

> **Estado:** Template — se completa durante la ejecución del plan.
> **Criterio GO global:** 85/85 smoke tests PASS + todos los checklist items ✅ + aprobación explícita.

> **Evidencia runtime 2026-08-27:** inventario de solo lectura contra la app
> principal `695d708948469128f473d080` confirmó 31 funciones desplegadas. El
> repositorio aprobado contiene 51; las 20 ausencias de la sección 1.1 son
> reales y explican el error de autenticación del frontend por ausencia de
> `identityGateway`. Este hallazgo es **NO-GO** para publicar de inmediato; no
> se han hecho cambios remotos.

---

## Sección 1 — Inventario runtime de funciones

### 1.1 Funciones NO desplegadas en producción (20) — críticas

> Hallazgo base: creadas el/after Aug 10, 2026. Ausentes del registro runtime de producción.

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

### 1.4 Historial de Publish (completar desde dashboard)
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
- [ ] **NO-GO** — Documentar bloqueadores y reintentar tras corrección

**Firmado:** _______________ **Fecha:** _______________

---

## Sección 4 — Riesgos residuales conocidos

1. **Las 31 funciones desplegadas están stale** (pre-Aug-10). Un Publish las actualiza a Aug 17, cambiando comportamiento (endurecimiento RBAC/piloto). Requiere validación de que los cambios de Aug 17 (`operator-only mutation envelope`, `multi-user stabilization`) están listos para producción.
2. **No hay rollback nativo en Base44.** El rollback es git-revert + re-publish + pausa de mutaciones. El mecanismo de pausa debe estar ensayado antes de depender de él.
3. **Datos escritos por código nuevo** no se revierten con git-revert. Si el nuevo lifecycle escribe estados de OT/Actividad/AuditEvent distintos, la pausa de mutaciones previene escrituras futuras pero no deshace las ya hechas. Considerar reconciliación de datos post-rollback si aplica.
4. **Webhooks de providers** siguen apuntando a producción. Durante la ventana de Publish/rollback, los webhooks pueden encolar eventos. Confirmar que los procesadores de eventos son idempotentes.
