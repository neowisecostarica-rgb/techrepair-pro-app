# TRP · PRE-QA Compu Store · Megabloques del sábado 7 de noviembre de 2026

## MB-01 — Auditoría, concurrencia y duplicados (desarrollo)
- Cambiado el escritor `appendAuditEvent`: se obtiene un bloqueo condicional de la Organization existente antes de consultar/crear AuditEvent. `Organization.updateMany` es autoridad de claim, `audit_lock_token`/`audit_lock_at` se excluyen de lectura y escritura directas por RLS. Liberación condicionada al token propietario, expiración de 60 s, espera hasta 8 s y errores fail-closed si no hay organización o el bloqueo está inaccesible. Idempotencia/collision check existentes conservados.
- Test de carrera con dos escritores simultáneos sobre adaptador CAS atómico: **1 único evento, 1 replay; PASS**.
- **Prueba nativa Base44 (no inventada):** dos `update_entities` concurrentes en una organización de prueba, ambos con precondición de campo de lock ausente: uno actualizó **1** registro y el otro **0**; consulta confirmó un solo token vencedor, seguido de limpieza validada. No se usó la organización de Compu Store.
- Actualizadas 14 copias de helper de auditoría y generados bundles de los 23 consumidores activos. Los 23 se registraron mediante endpoint de redespliegue de función de Base44. Contrato de cobertura de bundles **2/2 PASS**, audit identity **9/9 PASS**.
- **Límite técnico:** el serializador CAS mitiga la carrera entre escritores cooperantes, pero no sustituye índice UNIQUE en AuditEvent ni una transacción ACID entre evento y efectos. La rotura de lease/temporización extrema aún requiere pruebas runtime del flujo completo. No afirmar garantía absoluta de exactly-once.

## MB-02 — Inventario, Caja y usuarios Compu Store
- Organización Compu Store: `698bc7cadce06ca69e4ead17`. Sucursal activa: TRES RIOS, `69a63168e2500f22cefedbf8`.
- **Inventario 4/4:** los cuatro artículos existentes están asociados a la única sucursal; cantidades observadas 1,0,0,0. Esta sesión fue solo lectura: no se alteraron stock, costos, precios, nombres ni SKU.
- **Caja:** 16 ventas históricas con estado `pagada`; no se crearon cobros nuevos en este lote. Código de createSale y cancelDraftSale registrado con nuevo escritor, sin mutación a ventas reales.
- **Roles:** 1 ORG_ADMIN, 1 BRANCH_ADMIN, 1 SALES y 3 TECHNICIAN; los tres perfiles comerciales tienen `user_id` y usuario Base44 coincidente. Dos cuentas TECHNICIAN igualmente vinculadas; una tercera `TECHNICIAN active` no tiene usuario registrado/correspondencia y no debe usarse hasta activar/invitar correctamente, sin asignar ID ajeno.
- **Pruebas de código:** ventas atómicas 29/29 PASS; inventario 22/22 PASS; integridad comercial 12/12 PASS; autorización operacional 9 grupos PASS; identidad/tenant 7/7 PASS; audit identidad 9/9 PASS; frontend build PASS. Estas pruebas no reemplazan los flujos que Compu Store ejecutará el lunes 9-nov.
- **Hallazgo para QA:** consulta de AuditEvent por Compu Store devolvió 0 registros, pese a 16 ventas pagadas existentes. Podría tratarse de registros históricos previos al escritor o limitación de visibilidad; NO inferir auditoría existente. Conservar sin alterar y comprobar nuevos eventos con el QA autorizado.

## MB-03 — Revisión de primeros ZIP con Codex (siguiente traspaso)
- Archivo histórico mencionado por auditoría anterior: `tech-repair-pro-f473d080 - 2026-08-06T065450.962.zip`, citado en `TRP_Auditoria_Completa_2026-08-06.md`. El ZIP exacto **no fue localizado como archivo accesible en Biblioteca**. Pedir el ZIP original y respaldos aún más antiguos si existen.
- Instrucción Codex completa en `docs/TRP-CODEX-LEGACY-ZIP-COMPARISON-2026-11-07.md`.
- No hacer restore ni copiar código legacy sin análisis de seguridad: había credenciales en texto plano, escritura directa y JWT sin validación en antiguos respaldos.

## Entrega y límites
- `main` es la fuente de verdad, 0 ramas nuevas, sin reiniciar importación ni cambiar existencias. App pública: https://tech-repair-pro-f473d080.base44.app (requiere login).
- La aceptación funcional y decisión de QA corresponde a Compu Store el **lunes 9-nov-2026**. Lo técnicamente pendiente es comprobar respuesta real de todas las rutas con su sesión, incluidos roles y auditoría de nuevas operaciones.
- No declarar producto 100% certificado desde simulaciones ni desde etiqueta READY.
