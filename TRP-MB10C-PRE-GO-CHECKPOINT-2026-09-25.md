# TRP-MB10C-PRE-GO-CHECKPOINT-2026-09-25

## 1. ESTADO GENERAL

| Bloque | Estado |
|---|---|
| MB1 | Completado |
| MB2 | Completado |
| MB3 | Completado |
| MB4 | Completado |
| MB5 | Completado |
| MB6 | Pendiente / in progress. **P0-AUD-01 sigue abierto**; debe revisarse después de MB10. |
| MB7 Performance | Completado |
| MB8 Global Search & Navigation | Completado |
| MB9 Guided Onboarding | Implementación y verificación técnica completadas. **QA humano / E2E pendiente** para el QA final. |
| MB10 | En progreso. MB10-A y MB10-B parcialmente completados. **MB10-C planificado pero NO ejecutado** (pausa deliberada para preservar créditos de mensaje). |

## 2. TODO LO YA IMPLEMENTADO EN MB10

### Archivos modificados (migrados a i18n)
- `src/pages/Saas.jsx` — 9 residuales migrados (badges de estado, ternary de readiness, botón "enter", plan cards, labels per-month/year).
- `src/pages/ColaRevision.jsx`
- `src/components/search/GlobalSearch.jsx`
- `src/components/ventas/ComunicacionCliente.jsx` — claves i18n + patrón de acceso a plantillas corregido.
- `src/components/ot/OTOperationalLayer.jsx` — soporte i18n + constantes convertidas a funciones de traducción.
- `src/pages/Settings.jsx`
- `src/pages/Proveedores.jsx`
- `src/pages/ActivoDetalle.jsx`
- `src/pages/PortalCliente.jsx`
- `src/pages/CRM.jsx`
- `src/pages/Inventario.jsx`
- `src/pages/EnterpriseCommand.jsx`
- `src/components/expediente/CentroMando.jsx` — fix de scope: `t` pasada a `evaluarRiesgos`.
- `src/components/diagnostico-tecnico/WizardDiagnosticoTecnico.jsx` — imports y dependencias i18n migrados.
- `src/components/diagnostico-tecnico/pruebasPorComponente.jsx` — convertido a patrón de inyección funcional: `getPruebasPorComponente(t)` y `getComponentesDisponibles(t)`. Constantes legacy `PRUEBAS_POR_COMPONENTE` / `COMPONENTES_DISPONIBLES` aún presentes (pendiente eliminación tras migrar consumidores).
- `src/components/diagnostico-tecnico/generarResumenTecnico.jsx` — convertido para aceptar `t` opcional con fallback `tr`.

### Message bundles creados
- `src/i18n/saas-messages.js` — bundle específico de Saas, 80+ claves × 5 locales.
- `src/i18n/search-messages.js` — integrado al index i18n.

### Namespaces creados
- `saas.*` (saas-messages.js)
- `search.*` (search-messages.js)

### Helpers convertidos para recibir `t`
- `generarResumenTecnico(diagnosticoTecnico, t)` — `t` opcional, fallback `tr`.
- `getPruebasPorComponente(t)` — inyección funcional.
- `getComponentesDisponibles(t)` — inyección funcional.
- `evaluarRiesgos(..., t)` en CentroMando (parámetro añadido).

### Fixes técnicos realizados
- Fix de lint `t is not defined` en CentroMando.jsx (paso de parámetro).
- Fix de lint en OTOperationalLayer.jsx: `TIMELINE_STEPS` → `TIMELINE_STEPS_BASE` en `getStepStatus`.
- Integración de `search-messages.js` al index i18n.

### Scans realizados y resultados
- Scans i18n previos (MB5): Inventario, customer/inventory, OT/tech, admin/inventory, journeys, ops/finance, tail/ops, residual/docs, public/portals, commercial surfaces, governance, operational, MB5 closure — todos verificados.
- Scans MB10 parciales: Settings, Proveedores, ActivoDetalle, PortalCliente, CRM, Inventario, EnterpriseCommand, Saas, CentroMando, ColaRevision, GlobalSearch, ComunicacionCliente, OTOperationalLayer, WizardDiagnosticoTecnico, pruebasPorComponente, generarResumenTecnico — migrados.
- **Global scan final de src/ NO ejecutado** — pendiente en MB10-C.

### Decisiones arquitectónicas tomadas
- Sistema i18n único centralizado (`src/i18n/`); prohibida infraestructura paralela de traducción.
- Patrón MB10-C: helpers/constantes que generan texto localizable viven fuera del componente e inyectan `t`.
- Separación display traducido vs. data canónica persistida.
- Bundles organizados por dominio funcional, no por macrobloque.

## 3. ESTADO EXACTO DE MB10-C

### Plan aprobado (pendiente de ejecución — NO ejecutar ahora)
PRD "MB10-C i18n Closure" aprobado. 14 core flows:
1. SeguimientoCliente.jsx
2. StepInviteTeam.jsx
3. StepWelcome.jsx
4. QuickStartCard.jsx
5. TenantManageDialog.jsx
6. UserManagementPanel.jsx
7. PanelOperativoDiagnostico.jsx
8. CuentasPorPagar.jsx
9. FormularioCita.jsx
10. Message bundles por dominio (diagTest/diagResumen → diag-messages.js; seguimiento/quickStart/onboarding/tenantManage → ops-messages.js)
11. Auditoría de call sites de generarResumenTecnico
12. Auditoría y eliminación de constantes legacy en pruebasPorComponente.jsx
13. Global scan final de src/
14. Verificación técnica final + declaración MB10 CLOSED

### Pendientes conocidos
- SeguimientoCliente.jsx
- StepInviteTeam.jsx
- StepWelcome.jsx
- QuickStartCard.jsx
- TenantManageDialog.jsx
- UserManagementPanel.jsx
- PanelOperativoDiagnostico.jsx
- CuentasPorPagar.jsx
- FormularioCita.jsx
- Finalizar cualquier residual real restante descubierto por el global scan.

## 4. DECISIONES YA TOMADAS

- Bundles organizados **por dominio**.
- `diagTest.*` y `diagResumen.*` → `diag-messages.js`.
- `seguimiento.*`, `quickStart.*`, `onboarding.*`, `tenantManage.*` → `ops-messages.js`.
- **NO crear** `mb10c-messages.js` ni bundles por macrobloque.
- Migrar todos los consumidores de `PRUEBAS_POR_COMPONENTE` y `COMPONENTES_DISPONIBLES` a `getPruebasPorComponente(t)` / `getComponentesDisponibles(t)`, y **después eliminar las constantes legacy** si no quedan consumidores.
- Auditar todos los call sites de `generarResumenTecnico` y pasar `t` explícitamente desde UI localizada.
- Mantener separados display traducido y valores canónicos/persistidos.
- No buscar cero artificial en el scanner.
- No publicar ni hacer deploy.

## 5. CRITERIO DE CIERRE MB10

MB10 solo queda **CLOSED** cuando:
- global scan final ejecutado;
- toda deuda i18n **REAL** de UI corregida;
- restantes clasificados como técnico/canónico/persistido o falso positivo **con justificación**;
- ES/EN/PT/FR/NO completos;
- sin claves undefined / crudas / fallback-only en UI;
- imports / sintaxis / scopes de `t` / call sites verificados;
- estado Green.

## 6. NUEVOS HALLAZGOS — 25 SEP 2026

### 6.1 ROLE / MODULE EXPOSURE
Durante QA visual/manual detectamos que algunos workspaces por rol parecen incompletos.
Ejemplos confirmados visualmente:
- SALES parece no tener expuesto Mi Día correctamente.
- CRM no aparece donde se esperaba.
- Debe auditarse la matriz completa ROLE × MODULE antes del GO.
- No asumir que una página existente está correctamente expuesta por navegación/permisos.

Roles a reconciliar:
SUPER_ADMIN, ORG_ADMIN, BRANCH_ADMIN, TECHNICIAN, SALES, INVENTORY, SUPPORT.

### 6.2 SUPER ADMIN FUNCTIONAL GAPS
Durante QA manual se detectó que varios botones/acciones visibles del workspace SUPER_ADMIN no producen el comportamiento esperado.

Debe realizarse una auditoría funcional de:
- botones;
- CTAs;
- row actions;
- dropdowns;
- cards accionables;
- icon buttons;
- navegación;
- modals/dialogs;
- organizaciones;
- sucursales;
- usuarios;
- impersonación;
- activar/desactivar;
- configuración;
- planes/licencias;
- mantenimiento;
- health;
- accesos y contexto de organización.

Hay que distinguir si cada fallo proviene de handler, routing, permisos, context, impersonación, backend action, state o event propagation.

### 6.3 VISUAL CONSISTENCY
El QA visual muestra que TRP todavía no se siente como un único sistema visual coherente entre módulos.

Auditar:
page headers, typography, spacing/gutters, cards, tables/lists, buttons, badges, forms, radius, shadows, density, empty states, sidebar/navigation y responsive.

No homogeneizar artificialmente todas las pantallas: Inventario puede ser denso, Clientes más visual y Mi Día más accionable. Debe unificarse el sistema de primitives/tokens.

## 7. ORDEN PRE-GO ACTUALIZADO

A. Auditoría **SOLO LECTURA** Role × Module + Super Admin actions + Visual System.
B. Reparar P0 funcionales encontrados.
C. Reparar P1 de módulos/routing/roles.
D. Ejecutar la pasada de coherencia visual priorizada.
E. Retomar y cerrar MB10-C desde su checkpoint exacto.
F. Revisar/cerrar MB6 / P0-AUD-01.
G. QA final E2E/Nielsen/multi-tenant/roles/responsive/i18n.
H. Correcciones finales.
I. Pre-publish → Publish → smoke test → GO.

## 8. SIGUIENTE PASO EXACTO AL RETOMAR

- **NO** repetir auditorías ni scans iniciales de MB10.
- **NO** reconstruir contexto.
- **NO** volver a migrar archivos ya completados.
- Retomar directamente **aprobando/ejecutando el paso A** del orden pre-GO actualizado (auditoría solo lectura Role × Module + Super Admin actions + Visual System).

Después:
`A → B → C → D → E (MB10-C CLOSED) → F (MB6 / P0-AUD-01) → G (QA final) → H (correcciones) → I (Publish + smoke test + GO).`

## 9. CRÉDITOS

- **Pausa deliberada** para preservar créditos de mensaje.
- Estado al momento de la pausa: 149,67 de 250 créditos de mensaje restantes (reinician 2026-10-20); 9.944 de 10.000 créditos de integración disponibles.
- **No ejecutar trabajo adicional de implementación** durante la creación del checkpoint.