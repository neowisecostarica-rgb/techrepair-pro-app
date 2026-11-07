# TRP-SALES-MB-01B — Seguridad de cotizaciones y borradores
Fecha: 2026-11-06. Rama: trp-sales-mb01-20261106. Origen: MB01–MB05 919d3a4.

## Hallazgo nuevo: NO duplicar gateway
El adaptador src/api/base44Client.js enruta Cotizacion y Venta mediante operationalGateway aun cuando la pantalla usa base44.entities.create/update. El esquema Cotizacion.jsonc bloquea RLS directo. La sospecha de bypass directo desde componentes NO se confirma. Reutilizar el writer autorizado.

## Cambios en rama
- operationalAuthorization.ts: Venta.delete denegado para todos los roles operativos.
- operationalGateway/entry.ts: denegación explícita SALE_DELETE_SOVEREIGN_WRITER_REQUIRED de eliminación de Venta.
- operationalGateway/entry.ts: una cotización independiente de OT ahora usa el branch_id guardado, y una cotización OT con sucursal incoherente falla cerrada.
- GestionCotizaciones.jsx: lectura filtrada por organización y sucursal, clave de cache sensible a tenant y sucursal, sin lectura sin sucursal autorizada.

## Evidencia
Build Vite exit 0; 10/10 comprobaciones estáticas focalizadas PASS; git diff --check sin errores.
NO se ejecutó QA autenticada, backend deploy, pruebas de concurrencia ni mutación de registros de COMPU STORE. Una rama de código no garantiza aislamiento de datos.

## Pendientes
P0-AUD-01 / issue 13 audit log atómico bloqueado. Issue 12 identidades de QA multiempresa bloqueado. Issue 15 QA SALES/OWNER inventario pendiente.
Validar cotizaciones sin OT y coherencia de sucursales con fixture aislado; diseñar cancelación definitiva del borrador autorizada, trazable e idempotente; completar matriz QA-02..09.
No repetir tests aprobados. Cero merge, Publish o deploy. RELEASE NO-GO.
