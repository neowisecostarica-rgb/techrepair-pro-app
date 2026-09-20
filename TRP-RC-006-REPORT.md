# TRP RC-006 — Preproducción

**Fecha:** 2026-09-20
**Estado:** CANDIDATO TÉCNICO / pendiente QA humano y Publish

## Alcance cerrado
- MB1: contratos críticos, identidad, roles, navegación e i18n prioritario.
- MB2: E2E contractual de recepción → OT → diagnóstico → cotización → reparación → cobro → entrega, inventario/garantía y Enterprise.
- MB3: web alineada a capacidades reales; precios públicos no aprobados retirados; contacto público persistente gobernado; seguridad pública revalidada.

## Evidencia automática final
- i18n final residual: 5/5 PASS.
- multiuser navigation: 8/8 PASS.
- Super Admin lifecycle: 5/5 PASS.
- security round 2: 13/13 PASS.
- identity/tenant security: 7/7 PASS (corrida MB3 previa).
- security blockers: 9/9 PASS (corrida MB3 previa).
- build: PASS.
- lint: PASS.

## Observaciones no bloqueantes / límites conocidos
- `test:i18n-mb5-closure` es un scanner heurístico: reporta 339 candidatos para revisión y declara explícitamente que no tiene umbral PASS/FAIL autoritativo. Las superficies prioritarias poseen suites específicas PASS; no interpretar el número bruto como 339 defectos.
- La unicidad física exactly-once de filas de auditoría bajo escritores concurrentes continúa siendo un límite arquitectónico conocido; los contratos actuales no deben describirse como garantía de unicidad física.
- `caniuse-lite` está desactualizado 7 meses; es aviso de tooling, no fallo de build.
- Los visuales del website continúan con staging local para selección de screenshots. El **contacto público** ya no depende de localStorage: usa configuración persistente global vía gateway y escritura Super Admin.
- Precio público Core/Business permanece deliberadamente en `Consultar` mientras `publicPricingApproved` sea false.

## Gate restante
1. QA humano de Gustavo sobre recorridos reales y responsive.
2. Confirmar correo público desde Website Visual Editor como Super Admin (puede permanecer vacío durante QA).
3. Confirmar visuales definitivos o aceptar mockups actuales para el primer release.
4. Publish controlado.
5. Smoke post-publish sobre autenticación, recepción, técnico, cotización, cobro/entrega, portal público, Super Admin y Enterprise.

## Decisión RC
La fuente queda preparada como **RC-006**. No declarar producción GO hasta completar QA humano y smoke post-publish.
