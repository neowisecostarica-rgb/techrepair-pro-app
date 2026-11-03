# TRP-SEC-014 — Ruta QA con usuario de Base44 provisionado y acceso embebido
Fecha 2026-11-03 | ESTADO: API VERIFICADA, IDENTIDAD NO CREADA, QA EN NAVEGADOR PENDIENTE
App principal: 695d708948469128f473d080 | GitHub #12: https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/12

## Nuevo hallazgo verificado contra los contratos de Base44
- `POST /api/apps/{app_id}/users/provisions`: requiere `email` de usuario controlado, `role` de acceso a Base44 (no equivale necesariamente a rol SaaS TRP), `full_name` opcional. Concede acceso a la app antes del primer login. No puede usarse con dirección fabricada o de tercero.
- `POST /api/apps/{app_id}/embed-url`: requiere `email` provisionado y permite `target=live_preview` o `latest_preview`; genera enlace con token de acceso de un solo uso. **Nunca guardar tokens, registrarlos en logs, ni poner URL con token en GitHub/documentos.**
- `POST /api/apps/{app_id}/testing-agent/executions`: únicamente `flow_id` y URL opcional; el agente se autentica con usuario temporal. No hay garantía documentada de que acepte, conserve o no sobrescriba identidad de embed-url. No asumir que combinar las APIs crea QA autenticado en Testing Agent.
- `GET /api/apps/{app_id}/remix/requirements`: TRP es `user_app`, la copia requiere funciones backend pero no tiene secretos declarados; el remix crea otra app. NO se ejecutó dado el requerimiento previo de evitar entornos extra sin necesidad.
- `POST /api/apps/{app_id}/branches` crea rama de **código**, no certifica aislamiento de registros UserAccount/Organization. No usar rama de app como sustituto de dataset de prueba sin demostración de aislamiento.

## Implementación segura pendiente de información esencial
1. Obtener una dirección de correo **controlada y autorizada para QA**. No usar el correo principal del dueño ni otra cuenta real como test sin autorización concreta. Definir límites de acceso, caducidad y responsable.
2. Considerar copiar TRP solo si la protección de datos lo exige y el usuario autoriza expresamente la app adicional; antes confirmar persistencia/compartición de datos, costes, dependencias y que no se copien datos personales.
3. Provisionar la identidad QA mediante la API oficial usando rol base sin privilegios elevados; verificar el resultado y el ID verdadero que `base44.auth.me()` devuelve para la sesión real. Un `role='SALES'` en provisionamiento Base44 NO crea automáticamente UserAccount de TRP.
4. Solo una vez obtenido ID real, en datos ficticios autorizados configurar Organization activa, Branch activa y UserAccount con `user_id === auth.me().id`, email, organization_id, branch_id, `status=active`, `role=SALES`. Garantizar RLS y auditoría de creación. No vincular por email únicamente.
5. Abrir preview a través de token embed de **un solo uso** en sesión supervisada; comprobar `identityGateway` y acceso CRM, negación de consola SaaS y acceso a otra sucursal. No compartir ni registrar token.
6. Si no hay browser controlado compatible con embed, ejecutar QA interactivo por Work Cloud Browser o el operador humano, sin presentar Testing Agent como prueba equivalente.
7. Repetir con identidades separadas CUSTOMER_SERVICE, INVENTORY, BRANCH_ADMIN; Super Admin requiere autoridad nativa comprobada y no se debe fabricar.
8. Una vez terminadas las pruebas, revocar aprovisionamientos QA y retirar los fixtures ficticios de manera controlada y auditada.

## Validación de código existente
- `scripts/verify-sec012-isolated-membership-fixtures.mjs` 6/6 simulaciones PASS con controles de 26 copias roleCapabilities.
- `scripts/verify-useraccount-schema-contract.mjs` garantiza `user_id` y RLS cerrada.
- `docs/TRP-SEC-001-E2E-001-QA-MATRIX-2026-11-03.md` define la matriz QA y E2E.

## Decisión vigente
**No se provisionó usuario, no se creó app remix, no se creó tenant/sucursal ni se solicitó token, no se hizo Publish ni deploy.** Se requiere un correo controlado y un medio de abrir la sesión de QA para continuar. SEC-QA y E2E siguen pendientes. P0-AUD-01 permanece NO-GO, issue #13.