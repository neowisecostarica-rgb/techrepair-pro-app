# TRP CRM/Caja — cierre incremental de conversión segura
Fecha: 2026-11-06. Rama única trp-sales-mb01-20261106.

## Cambios confirmados de este lote
- crmGateway ya no compensa conversiones ambiguas eliminando Cliente automáticamente. En contexto de concurrencia esa supresión podía destruir un expediente previamente usado.
- Ante duplicados después de crear, devuelve conflicto 409 CRM_CONVERSION_CONCURRENT_CONFLICT. No declara conversión exitosa.
- Ante fallo de actualización del Lead con reconciliación infructuosa, conserva Cliente y devuelve 409 CRM_CONVERSION_LINK_UNCERTAIN para tratamiento controlado.
- Conserva idempotencia cuando el vínculo Lead/Cliente está confirmado; validaciones de organización, sucursal e identificación del lote anterior siguen presentes.

## Evidencia
- Compilación Vite exit 0 y git diff --check limpio.
- 8/8 verificaciones estáticas focalizadas de este cambio PASS; no se repitieron suites anteriores.
- No hay validación runtime de concurrencia ni integración real, no hay QA navegador. Estas correcciones mitigan daño pero NO garantizan unicidad.
- No se crearon usuarios, clientes, ventas, documentos ni movimientos de prueba; ninguna operación sobre COMPU STORE.

## Bloqueos y aceptación
- El flujo de conversión aún requiere persistencia transaccional que garantice unicidad entre org e identificación y vinculación de Lead. Mantener NO-GO para concurrencia real hasta cierre.
- P0-AUD-01 #13 AuditEvent sigue sin operación atómica de unicidad; los candidatos simulados no son implementación.
- Caja mantiene retorno sin borrar borradores y el rechazo operativo de Venta.delete; cancelación definitiva segura sigue pendiente de writer soberano y tests de estado.
- #12 identidad QA multiempresa y #15 inventario SALES/OWNER permanecen abiertos.
- Una sola matriz de aceptación QA-02 a QA-09 al resolver aislamiento. Sin merge, publicación o deploy.

## Próximo cierre de código
Diseñar migración de conversión CRM a operación transaccional soportada. No construir locks de proceso o suponer que consultas antes/después otorgan garantía UNIQUE en Base44.
