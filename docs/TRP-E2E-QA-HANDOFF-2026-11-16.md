# TRP · Entrega técnica pre-QA · recorrido E2E y matriz de módulos
**Fecha:** 16 de noviembre de 2026 (Costa Rica)  
**Aplicación principal:** TRP — Technology Reliability Platform, Base44 695d708948469128f473d080  
**Rama:** main. **Alcance:** preparación y verificación sin publicación, sin transacciones reales y sin modificar datos de Compu Store.  
**Dictamen:** ENTREGA DOCUMENTAL A QA — LISTA; E2E AUTENTICADO — PENDIENTE; MVP TRANSACCIONAL — NO-GO.

## 1. Evidencia ejecutada en esta intervención
- Test Data de Base44: **habilitado** por autorización de Dirección General; API de Base44 verificó dev_environment_enabled=true. La BD Test es independiente y vacía; los usuarios nativos Base44 y sus roles no están aislados entre Test y Production.
- Inventario de código: **47 páginas JSX** en src/pages, con enrutamiento en src/pages.config.js y src/App.jsx; se revisaron navegación declarativa, PageGuard, flujos principales, contratos y documentación histórica.
- Lint: **PASS** (npm run lint). Build Vite: **PASS** (npm run build). No se publicó ni se desplegó versión pública.
- Batería completa definida por package.json: **39 de 56 comandos test:* PASS; 17 FAIL** en segunda ejecución tras recuperar un verificador de pruebas de solicitudes técnicas (6/6 PASS). Los tests son simulaciones, contratos de código o mocks; **no son E2E de navegador ni certifican backend remoto**.
- Se ajustó solo la compatibilidad de firmas Deno.serve en tres verificadores: verify-multiuser-technical-requests-contract.mjs, verify-security-blocker-remediation-contract.mjs y verify-security-round2-contract.mjs. No se cambiaron endpoints operativos, esquemas, RLS, permisos, clientes ni datos.
- El navegador independiente llegó al **login de Base44**; no se contó con una sesión QA autenticada. Por tanto, no se navegó como SALES, TECHNICIAN, INVENTORY, ORG_ADMIN y SUPER_ADMIN ni se atribuyen capturas de esos roles.
- El typecheck histórico (sesión anterior) registró 3.149 diagnósticos TS/JSX; **no se repitió en esta pasada**. Build PASS no equivale a typecheck PASS.

## 2. Gate de seguridad previo a la ejecución humana con escrituras
**NO ejecutar de momento el tramo transaccional ni automaciones reales.**
1. **Identidades (#12, P0):** provisionar/autorizar cuentas específicas para QA sin cambiar roles de usuarios reales. Test Data no aísla la entidad nativa User; un cambio de rol en Test podría afectar Production. Preparar al menos dos empresas ficticias (A/B), sucursales A1/A2, y roles ORG_ADMIN, BRANCH_ADMIN, SALES, TECHNICIAN, INVENTORY, CUSTOMER_SERVICE y SUPER_ADMIN.
2. **Salidas externas (P0):** comprobar bloqueo de Core.SendEmail y toda integración de mensajes/pagos para Test. processOTEvent y handleOTLifecycleEvent pueden enviar emails reales aun en Test. Deshabilitar envíos de QA **sin silenciar comunicaciones productivas**; no invocar funciones con efectos externos hasta tener mecanismo verificado.
3. **Auditoría (#13, P0):** el bloqueo CAS/lease de Organization mitiga carreras pero NO da UNIQUE duradero ni transacción ACID de AuditEvent; test:audit-concurrency-boundary falla con AUDIT_LOCK_UNAVAILABLE. Se exige validación de writer concurrente con persistencia aprobada antes de GO.
4. **Inventario SALES (#15):** PageGuard incorpora INVENTORY_READ, pero no hay prueba autenticada del contraste SALES/OWNER en lectura de precios, existencias, costos, edición e importación.
5. **Publicación:** versión de producción sin cambios; Dirección General debe aprobar cualquier GO/PUBLISH después de QA.

## 3. Recorrido E2E maestro de taller — escenario E2E-T01
**Condición inicial:** solo en Test Data con A/A1 ficticios, emails interceptados y pagos simulados; IDs y datos claramente marcados QA; no reproducir con Compu Store.

| Paso | Actor / módulo | Acción humana y evidencia esperada |
| --- | --- | --- |
| 00 | ORG_ADMIN / Settings | Verificar empresa A, A1, roles, sucursal activa, contexto Test visible y separación de B. |
| 01 | CUSTOMER_SERVICE / Clientes | Crear cliente ficticio; impedir duplicado y validar búsqueda/perfil. |
| 02 | Recepción / OrdenesTrabajo | Registrar equipo/activo, motivo, accesorios, condición, credenciales protegidas, fotos y firma/consentimiento cuando aplique; genera una OT con identificador estable. |
| 03 | Recepción / WizardPreDiagnostico y Smart Intake | Responder preguntas de categoría/avería; revisar sugerencias, decisiones manuales, persistencia y resumen; no confundir sugerencia con diagnóstico definitivo. |
| 04 | Supervisor / ColaRevision | Asignar técnico autorizado de A1; intentar técnico de B o sucursal inválida y exigir rechazo seguro. |
| 05 | TECHNICIAN / MiDiaTech | Aceptar custodia, iniciar actividad, pausar, retomar; comprobar límite de un segmento activo y propiedad del técnico. |
| 06 | TECHNICIAN / WizardDiagnosticoTecnico | Completar hallazgos, evidencia, resultados, tiempos, costos estimados; revisión de ResumenDiagnostico y PDF/tiquete. |
| 07 | TECHNICIAN/INVENTORY / SolicitudesTecnicas e Inventario | Solicitar repuesto; aprobar y reservar stock disponible una sola vez; negar falta de stock y sucursal ajena. **Bloqueado para writes hasta gates P0.** |
| 08 | SALES / VentasCotizaciones | Emitir cotización vinculada a OT, descuento/impuestos correctos; verificar PDF, estados y edición/borradores. |
| 09 | Cliente / PortalCotizacion | Abrir token de prueba, aceptar/rechazar; probar caducidad, reutilización, revocación, token de B y doble clic sin duplicados. |
| 10 | TECHNICIAN / ExpedienteOT | Reparar, registrar actividad y materiales, adjuntar evidencias; reintentos no duplican movimientos. |
| 11 | TECHNICIAN/Supervisor / Calidad | Ejecutar pruebas técnicas, detectar defecto, retrabajo y reingreso al ciclo QA; no permitir cierre con prueba obligatoria pendiente. |
| 12 | SALES / PuntoVenta | Generar venta ficticia desde cotización/OT, simular pago, doble clic/reintentos; revisar caja, comprobante y ledger de stock. **No ejecutar sin aislamiento de pagos/auditoría.** |
| 13 | Recepción / EntregarOT | Validar QA + autorización + pago/condición exigida; entregar una sola vez; impedir entrega inválida. |
| 14 | Cliente / PortalCliente, PortalComprobante | Abrir con token ficticio, corroborar estado/recibo sin datos de otro cliente ni secretos. |
| 15 | SALES / VentasGarantias, PortalGarantia | Registrar garantía, consulta pública permitida, expiración y nuevo caso/reingreso con trazabilidad. |
| 16 | Supervisor / Operacion y AuditEvent | Correlacionar desde OT hasta venta/entrega por actor, organización, sucursal y operation_key; exigir exactamente un evento auditable por operación. |

**Resultado de este recorrido:** documentación y contratos parciales disponibles; **ningún paso de escritura E2E se ejecutó contra la base real de TRP en esta sesión**. Estado completo: PENDIENTE QA AUTENTICADO / BLOQUEADO EN PASOS CON EFECTOS EXTERNOS.

## 4. Matriz completa por módulos para QA humano

**Convención:** todos los módulos siguientes están PENDIENTES de QA autenticado; build/lint y los contratos PASS indicados son evidencias técnicas, no aceptación visual. En cada módulo probar vacío, carga, error de red, cambio de sucursal, rol sin permiso, móvil 390 px y escritorio 1440 px.

| ID | Módulo y rutas | Prueba humana obligatoria |
| --- | --- | --- |
| Q01 | Acceso, Onboarding, AuthContext | Login válido/inválido, sesión expirada, invitación, permisos de UserAccount, fallos del gateway; no fuga de tenant. |
| Q02 | Hoy / MiDia, MiDiaTech, MiDiaSales, MiDiaAdmin | Panel por rol, acciones diarias, fechas Costa Rica, asignaciones, estado de carga/error. |
| Q03 | Dashboard, AdminDashboard, Operacion | KPIs coherentes, filtros de sucursal y período, límites de resultados, sin mezcla A/B. |
| Q04 | OrdenesTrabajo | Recepción nueva, edición autorizada, búsqueda, estados, filtros, paginación y reintentos. |
| Q05 | ExpedienteOT, AnalisisTrabajo, ResumenDiagnostico | Vista única, herramientas, resumen, documentos, permisos por técnico y descarga/impresión. |
| Q06 | WizardPreDiagnostico, Smart Intake, WizardDiagnosticoTecnico | Preguntas condicionales, volver/continuar, autosave, validación y persistencia. |
| Q07 | ColaRevision, actividad técnica, PruebasTecnicas, Calidad, ProductividadTecnicos | Asignar, pausa/reanudación, evidencia, revisión, rechazo, retrabajo y cierre; autoría. |
| Q08 | Agenda | Nueva cita, OT vinculada, reprogramar, conflictos, zona horaria y permisos. |
| Q09 | Activos, ActivoDetalle | Historial longitudinal por equipo, custodias, cambios, expediente y aislamiento. |
| Q10 | Clientes | Alta, edición, búsqueda, asociación OT/equipo, duplicados, teléfono y privacidad. |
| Q11 | CRM, Customer 360 | Lead→cliente, actividades, búsqueda, conversión idempotente, acceso comercial restringido. |
| Q12 | VentasCotizaciones, PortalCotizacion | Cotización, PDF/proforma, descuentos, aprobación pública, token vencido/revocado y aprobación doble. |
| Q13 | PuntoVenta | Carrito, SKU/código barras, stock, venta, pago simulado, cancelación borrador y replay. |
| Q14 | VentasHistorial, MisVentas, VentasMetricas | Totales y filtros por rol/sucursal/periodo; detalle y ventas del usuario; acceso directo a URL. |
| Q15 | Inventario, InventarioInvertido, ImportarCatalogo | Inventario con fotos, categorías, stocks, costos sensibles, movimientos, reservas, importación Excel previsualizada sin commit. |
| Q16 | Proveedores, CuentasPorPagar | Catálogo proveedor, facturas, vencimientos, pagos ficticios y límites de rol. |
| Q17 | Gastos, Finanzas | Registros, filtros, saldos, balances, exportación, conciliación y segregación de permisos. |
| Q18 | VentasGarantias, PortalGarantia | Garantía, cobertura, vencimiento, token externo y trazabilidad de reingreso. |
| Q19 | PortalCliente, PortalComprobante | Solo lectura autorizada, token perdido/vencido, documentos de A/B, proyección PII. |
| Q20 | EnterpriseOnboarding | Alta colaborador, asignación de activo y acceso, firma/evidencia, reintento e idempotencia. |
| Q21 | EnterpriseOffboarding | Revocación representada fielmente, retorno de activo, evidencia, cierre/reintento, sin promesa de desactivar servicios externos. |
| Q22 | EnterpriseCommand | Salud, pendientes, evidencias, cronología y acciones por sucursal autorizada. |
| Q23 | Reciclaje | Registro de reciclaje, evidencia de destino, asociación de OT y visibilidad por rol. |
| Q24 | Settings, Configuracion, términos, notificaciones | Parámetros, roles, branch scope, preferencias y notificaciones sin envío externo. |
| Q25 | Saas Super Admin, impersonación | Empresas/planes, health, auditoría, piloto, impersonación iniciar/terminar, limpieza de caché y fail closed. |
| Q26 | GlobalSearch, SidebarMenu, navegación | Menú por capacidad, ruta directa no listada, botón atrás, scroll al inicio, responsive. |
| Q27 | i18n / todos los paneles | ES/EN y otros idiomas habilitados, importes CRC, fecha CR, textos incompletos y accesibilidad. |
| Q28 | TRPWebsite, WebsiteVisualEditor | Landing pública, responsive, CTA, editor de visuales solo SA y cambios sin publicar. |
| Q29 | OAuthConsent | Consentimiento válido/inválido, sesión, expiración, cancelación, no filtración de handle/token. |
| Q30 | AdminReset, AdminSeedCompuStore, CrearUsuariosPrueba, MigrationAdmin | Rutas de mantenimiento deben seguir deshabilitadas y no crear/borrar/importar datos. |
| Q31 | Home, InventarioInvertido, pantallas auxiliares no listadas en sidebar | Navegación directa, autorización, errores claros, sin bypass del backend. |

**Nota de seguridad sobre rutas:** se detectaron páginas auxiliares como MisVentas y ResumenDiagnostico sin envoltura PageGuard propia, aunque consultan contexto de autorización y RLS. Probarlas por URL directa con roles sin permiso y organización B; **la ausencia de wrapper no demuestra por sí sola exposición**.

## 5. Contratos que fallan en la base actual (17/56)
- **Comercial/cliente (1):** crm-customer360.
- **Multiusuario, técnico y tokens (5):** multiuser-technical; multiuser-public-tokens; multiuser-automation; multiuser-provisioning; multiuser-policy-pipeline.
- **Seguridad y suplantación (3):** security-blockers; security-round2; impersonation-session-hardening.
- **Super Admin (1):** superadmin-lifecycle.
- **Enterprise (6):** enterprise-asset-control; enterprise-offboarding; enterprise-onboarding; enterprise-mutation-audit; enterprise-branch-isolation; enterprise-subject-matching.
- **Auditoría concurrente (1):** audit-concurrency-boundary.

No se debe interpretar automáticamente cada FAIL como bug productivo: hay contratos de comparación textual sensibles al formato de código empaquetado, fixtures de autorización desactualizados y posibles discrepancias funcionales reales. **Ninguna causa se considera cerrada sin aislamiento, corrección específica y nueva ejecución.**

## 6. Matriz de seguridad P0 y criterios mínimos
- S01: sin sesión: 401/redirect seguro; sin membresía o rol: 403 y ningún dato sensible.
- S02: empresa A contra ID/URL de B: rechazar lectura, escritura, PDF y tokens públicos.
- S03: A1 contra A2 según rol: negar acceso de sucursal; ORG_ADMIN solo lo que su rol autoriza.
- S04: TECHNICIAN no asignado no inicia/pausa/cierra ni firma diagnóstico ajeno.
- S05: SALES puede consultar Inventario conforme INVENTORY_READ, no editar costo/stock sin capacidad.
- S06: SUPER_ADMIN sin impersonación no muta tenant; al terminar, sesiones, cachés y permisos se restauran.
- S07: 2+ solicitudes simultáneas sobre misma operación producen una única escritura/venta/reserva/auditoría.
- S08: correo/WhatsApp/pagos a sandbox o interceptados: cero efectos reales desde QA.
- S09: secretos (credenciales de dispositivo, keys, tokens de portal) no aparecen en lista/proyección/errores.
- S10: reintentos y caídas intermedias no dejan OT, caja, stock o ledger en estado incoherente.

## 7. Registro de ejecución para el departamento de QA
Para cada caso registrar: ID Q/S/E2E, fecha/hora CRC, commit/checkpoint, usuario ficticio, rol, organización/sucursal ficticias, indicador Test visible, pasos exactos, entrada, resultado esperado/observado, captura 390 px y 1440 px, consola/red (sin tokens), IDs ficticios de OT/operación/auditoría, severidad, reproducibilidad y enlace al issue. Nunca adjuntar contraseñas ni credenciales en capturas.

**Severidades:** P0 acceso indebido, pérdida/duplicación monetaria o stock, envío real, ausencia de auditoría o fuga tenant; P1 flujo principal bloqueado; P2 inconsistencia funcional/UX; P3 cosmético.

**GO para comenzar pruebas humanas de solo lectura:** sí, con cuentas de QA autorizadas.  
**GO para pruebas humanas con escrituras:** no, hasta aislamiento de identidades y canales externos.  
**GO comercial/piloto/MVP transaccional:** no, hasta cerrar #12, #13, #15, 17 contratos fallidos verificados, E2E autenticado y dictamen firmado de QA y DG.
