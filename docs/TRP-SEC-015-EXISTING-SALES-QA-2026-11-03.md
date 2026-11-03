# TRP-SEC-015 — Identidades existentes elegibles para QA de acceso
Fecha: 2026-11-03 | Modo: SOLO LECTURA / NO E2E TRANSACCIONAL
App: 695d708948469128f473d080 | GitHub issue #12

## Comprobación directa (datos mínimos)
- Se consultaron por email dos cuentas indicadas expresamente por Dirección General, solamente proyecciones limitadas de User y UserAccount.
- Cuenta comercial solicitada: `ventas@compustorecr.com` → User nativo `role=user` y UserAccount con `role=SALES`, `status=active`, `user_id` igual al ID nativo de User. Organización COMPU STORE COSTA RICA, `status=active`. Sucursal TRES RÍOS, `active=true`, pertenece a esa organización.
- Cuenta administrativa solicitada: `gustavo@compustorecr.com` → User nativo `role=admin`, `is_super_admin=false`; UserAccount con `role=ORG_ADMIN`, `status=active`, `user_id` coincide con ID nativo y pertenece a la misma organización. **No es Super Admin SaaS**, ni debe ser elevado para QA.
- Por seguridad no se incluyen IDs nativos de usuario, organización ni sucursal en este documento. Los registros no fueron editados.
- Un informe previo obtuvo `count=0` con filtro `user_id:{$exists:true}`; la inspección posterior POR EMAIL muestra claramente user_id poblado en estas dos cuentas. El filtro anterior fue insuficiente para deducir ausencia de IDs en la base; **no realizar backfill basándose en él**.

## Decisión y alcance
- Seleccionar **ventas@compustorecr.com** para QA de navegación y lectura comercial, porque la membresía SALES ya está válida. Seleccionar ORG_ADMIN solo para pruebas de contraste de visibilidad y sin modificar configuraciones.
- La cuenta está vinculada a una organización existente, no a un tenant ficticio. QA queda restringido a **solo lectura**, comprobación de CRM/listados de cotización/inventario/ventas y denegaciones de acceso a otras sucursales. No crear prospectos, ventas, cobros, ítems, ni datos de test en COMPU STORE.
- La validación de navegación real requiere una sesión autenticada de estas cuentas en navegador. La conexión backend no permite asumir su sesión sin un flujo de identidad específico. No solicitar token por adelantado, guardarlo en repositorio ni mostrarlo en documentación.
- `Testing Agent` sigue creando usuarios temporales, de modo que seleccionar `role=SALES` no reutiliza automáticamente la cuenta comercial existente; su resultado de onboarding NO implica que la cuenta real sea inválida.
- Para E2E transaccional se requiere tenant/dataset ficticio verdaderamente aislado y autorización de crear registros de prueba, nunca utilizar el tenant comercial vigente.

## Próximas pruebas y criterio
1. Navegador con sesión legítima de ventas@...: confirmar auth context, entrada a CRM y lectura de leads, visibilidad de cotizaciones/ventas/inventario, ausencia de consola SaaS.
2. Confirmar que intento de acceso a recursos de otra empresa/sucursal se deniega, sin hacer mutaciones ni leer datos privados ajenos.
3. QA con cuenta ORG_ADMIN sin convertirla en SaaS SUPER_ADMIN; registrar permisos permitidos/denegados.
4. Reportar evidencia por fecha, SHA, contexto/rol y rutas (sin tokens ni PII); solo entonces cerrar parte de SEC-QA de navegación.
5. Mantener E2E-001 y P0-AUD-01 NO-GO hasta los gates independientes.