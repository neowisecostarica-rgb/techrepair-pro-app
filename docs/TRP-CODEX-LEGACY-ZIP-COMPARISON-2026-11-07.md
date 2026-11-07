# Codex · TRP-LEGACY-ZIP-RECONCILIATION-001

Rol: equipo senior de arquitectura, recuperación de código legado, seguridad, producto, QA. Trabajá sobre `neowisecostarica-rgb/techrepair-pro-app`, rama `main`, app Base44 `695d708948469128f473d080`.

## Meta
Compará el **código vigente del repo** con los **primeros respaldos ZIP** de TRP, especialmente el ZIP documentado `tech-repair-pro-f473d080 - 2026-08-06T065450.962.zip` y cualquier respaldo anterior que Dirección General aporte. Detectá qué funciones, pantallas, menús, esquemas, flujos y reglas de negocio originalmente existentes se perdieron, deshabilitaron o quedaron inaccesibles durante la evolución del SaaS. NO interpretés un cambio de nombre o una reubicación como pérdida sin comprobar el reemplazo.

## Auditoría diferencial exhaustiva
1. Inventario del ZIP: árbol y hashes; contrastá `src/pages`, `src/components`, rutas, navegaciones, roles, funciones `base44/functions`, entidades `base44/entities`, workflows, migraciones y documentos.
2. Revisá el circuito técnico recepción→OT→diagnóstico→cotización→reparación→control de calidad→cobro→entrega/garantías, y circuito comercial CRM→cliente→cotización→proforma→venta/POS→inventario/caja.
3. Revisá interfaces Super Admin, OWNER/ORG_ADMIN, BRANCH_ADMIN, SALES, TECHNICIAN, INVENTORY, permisos multiempresa/sucursal, gestión de usuarios, dashboards, exportaciones y PDFs.
4. Compará comportamiento, no solo nombres: `import` por hojas XLSX/CSV, serie/SKU/barcode, stock/reservas, costos/precios, auditoría y duplicados/idempotencia.
5. La versión actual usa **bundle.ts** autónomo para funciones Base44. Compará lógica editable en `scripts/base44-function-sources/<función>/entry.ts`, `scripts/candidates/cancelDraftSaleSource.ts`, helpers `base44/functions/_shared`, copias locales `*/_shared`, y bundles. No reportés como “perdido” un código que está en copia editable y en el bundle correcto.
6. Identificá todo lo que fue **eliminado intencionalmente por seguridad** (creación de usuarios de prueba desde frontend, seed/reset, rutas con JWT decode, credenciales en claro, accesos directos sin gateway, etc.); no lo propongás de regreso automáticamente. Revisá `TRP_Auditoria_Completa_2026-08-06.md` y documentos de seguridad actuales.
7. Verificá si lo visible en el código activo es alcanzable desde las rutas y menús sin crear vistas o sistemas duplicados.

## Entregables
- Tabla por capacidad: `FUNCIONAL / REEMPLAZADA / PERDIDA / BLOQUEADA / RETIRADA INTENCIONALMENTE / NO VERIFICABLE`, archivo ZIP, ruta actual, evidencia, severidad e impacto en Compu Store.
- Lista priorizada P0/P1/P2 de recuperación, NO de rediseño.
- Diff de archivos y hashes del ZIP comparados con MAIN, identificando funcionalidad removida sin explicación.
- Resumen ejecutivo **para dummies** (máximo 10 líneas) y reporte técnico detallado.
- Guardar reporte `docs/TRP-LEGACY-ZIP-RECONCILIATION-001.md` y checkpoint/backlog.

## Reglas estrictas
- **Solo auditoría, no modificar MAIN, no merge, no deploy, no escribir datos, no importar inventario de Compu Store.**
- No abrir otra rama si no es indispensable; no reintroducir implementaciones inseguras ni borrar features actuales para “igualar el ZIP”.
- Si los primeros ZIP no están accesibles, reportar archivo faltante exacto y NO inventar una comparación con un ZIP que no se revisó.
- Una vez presentado el informe, Dirección General decide qué recuperar; las correcciones se implementan luego en megabloques con QA.
- Enfocar en recuperar capacidades de producto, no en repetir suites de CI ya comprobadas.
