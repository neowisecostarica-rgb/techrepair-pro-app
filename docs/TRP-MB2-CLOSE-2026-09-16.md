# TRP — MB2 CIERRE DE DEFINICIÓN Y SIMPLIFICACIÓN

Fecha: 2026-09-16
App: 695d708948469128f473d080
Estado: MB2 CLOSED / MB3 NEXT

## Resultado
MB2 queda cerrado como definición de producto y primera implementación de simplificación.

### Producto
- ICP, roles/JTBD y workflow F0–F8 definidos en TRP-PRODUCT-DEFINITION-MB2-2026-09-15.md.
- OT es el objeto central; Expediente OT es el centro de verdad de cada reparación.
- Onboarding prioriza primera OT/primer equipo antes que configuración exhaustiva.
- Navegación primaria reduce exposición de capacidades contextuales/avanzadas.
- Calidad/No Conformidades y Reciclaje vinculados aparecen contextualmente en Expediente OT.
- CRM/Leads, Cola de Revisión, Historial de Ventas, Calidad y Reciclaje no compiten como destinos primarios del menú.
- Vocabulario principal converge en Hoy / Negocio / Operación / Órdenes / Expediente / Finanzas / Caja y Cobros.

### Escala / MB2-E
- DashboardOrgAdmin dejó de truncar OTs a 500: consume listWorkOrders paginado por cursor.
- El backend getFinancialMetrics ya es la autoridad de métricas financieras principales, pero actualmente carga colecciones y filtra período en memoria. Esto NO bloquea MB2; queda como hardening de escala para MB7 antes de certificación runtime/piloto a escala.
- useOrgAdminMetrics/useTecnicoMetrics y algunas vistas analíticas siguen agregando client-side. No presentar esas superficies como exhaustivas a escala hasta MB7.
- El ledger de inventario de useOrgAdminMetrics mantiene límite explícito 500; debe migrarse a agregación/paginación backend en MB7.

### QA automatizado del cierre
- lint PASS
- build PASS
- git diff --check PASS
- operational authorization: 9 groups PASS
- multiuser navigation: 8/8 PASS (contrato actualizado para CRM contextual, no primario)
- controlled pilot: 10 groups PASS

Nota: una ejecución manual directa del script de autorización con `node` falló por loader TypeScript; se reejecutó correctamente mediante el script oficial npm/tsx y pasó 9 grupos. No fue defecto del producto.

## Deuda deliberadamente diferida a MB7
1. Agregación/paginación backend para KPIs operacionales y técnicos a gran escala.
2. Eliminar dependencia de límites silenciosos/colecciones completas en getFinancialMetrics y hooks analíticos.
3. Revisar cursor compuesto de listWorkOrders para empates exactos de created_date si la plataforma lo requiere.
4. Revalidar repo ↔ runtime real y gates legacy.

## Gate
MB2 CLOSED.
No reabrir por microajustes visuales. Reabrir únicamente por regresión o si MB3/MB4 descubre un conflicto de producto real.

## NEXT
MB3 — Nombre + Marca + Posicionamiento.
No renombrar código/app/repositorio todavía. Primero decidir nombre comercial, categoría, promesa, arquitectura de marca y lenguaje. Los candidatos históricos no fueron recuperados con fiabilidad; no inventarlos como decisiones previas.
