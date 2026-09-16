# TRP — MB2 DEFINICIÓN FINAL DEL PRODUCTO

Fecha: 2026-09-15
App: TRP Legacy / Base44 695d708948469128f473d080
Entrada: TRP-PRODUCT-AUDIT-MB1-2026-09-15.md
Estado: PRODUCT DEFINITION SOT

## 1. Definición del producto

TRP es un sistema operativo para negocios de servicio técnico que controla el ciclo completo de un equipo desde la recepción hasta la entrega y el cobro.

No se define como un CRM, POS, inventario, agenda ni software de órdenes aislado. Esos componentes existen para sostener un solo flujo operacional: recibir → diagnosticar → cotizar/aprobar → reparar → probar → cobrar → entregar → conservar trazabilidad.

Outcome comprado por el cliente:
- saber qué está pasando con cada trabajo;
- reducir pérdidas de seguimiento, tiempos muertos y trabajo informal;
- coordinar recepción, técnicos, ventas/caja e inventario sin reconstruir el estado por WhatsApp, papel o memoria;
- dar al cliente final seguimiento y aprobaciones claras;
- permitir al dueño ver operación y negocio sin perseguir información.

## 2. ICP primario

### Cliente primario
Negocio de servicio/reparación que recibe equipos físicos, los diagnostica, cotiza, interviene, prueba y entrega. Puede operar una o varias sucursales y necesita coordinación entre recepción, técnicos, ventas/caja e inventario.

Ejemplos de encaje natural: reparación de computadoras, impresoras, electrónica y otros servicios técnicos con custodia temporal de equipos.

### Comprador económico
Dueño, gerente general o responsable de operaciones.

### Señales de alto encaje
- varias OTs activas simultáneamente;
- más de una persona toca el proceso;
- necesidad de saber quién tiene el equipo y qué falta;
- diagnóstico/cotización antes de reparar;
- repuestos o inventario ligados al trabajo;
- cobro y entrega como parte del proceso;
- cliente pregunta por estado;
- necesidad de evidencia/trazabilidad;
- más de una sucursal o intención de crecer.

### No-ICP / no optimizar el MVP para esto
- CRM generalista;
- retail puro sin servicio técnico;
- gestor genérico de proyectos/tareas;
- empresa que solo factura servicios sin recibir ni custodiar equipos;
- ERP contable completo.

## 3. Roles y Jobs-to-be-Done

### Dueño / ORG_ADMIN
“Cuando empieza o avanza el día, quiero saber qué necesita atención, qué está detenido, qué se cobró y cómo está funcionando el taller, para intervenir solo donde hace falta.”

Home: HOY.
Lectura gerencial: NEGOCIO.
Supervisión: OPERACIÓN.
Administración: CONFIGURACIÓN.

### Gerente de sucursal / BRANCH_ADMIN
“Quiero controlar la carga y excepciones de mi sucursal, asignar trabajo y resolver bloqueos sin ver ni afectar otras sucursales.”

Home: HOY de sucursal.
Superficie principal: OPERACIÓN + ÓRDENES.

### Recepción / CUSTOMER_SERVICE
“Quiero recibir un equipo rápido, identificar cliente/equipo, dejar condiciones y motivo claros, y ponerlo correctamente en el flujo sin aprender todo el sistema.”

Home: HOY.
Acción primaria: NUEVA RECEPCIÓN / OT.

### Técnico / TECHNICIAN
“Quiero ver exactamente qué debo trabajar ahora, tener toda la información del equipo en un lugar y registrar diagnóstico, actividad, repuestos, pruebas y bloqueos sin navegar por módulos administrativos.”

Home: MI DÍA.
Centro de trabajo: EXPEDIENTE OT.

### Ventas / SALES
“Quiero dar seguimiento a cotizaciones, cobrar trabajos y cerrar pendientes comerciales vinculados al servicio sin perder contexto de la OT.”

Home: HOY comercial.
Superficie: COTIZACIONES + CAJA, siempre con enlace a OT.
CRM: apoyo secundario.

### Inventario / INVENTORY
“Quiero saber existencias, reservas y movimientos ligados a trabajos, y ejecutar entradas/ajustes/ventas autorizadas sin romper la trazabilidad.”

Home: INVENTARIO / pendientes contextuales.

### SUPER_ADMIN
Administra tenants, planes, soporte y operación SaaS. No forma parte de la navegación del cliente normal.

## 4. Core workflow oficial

### F0 — Activación
Crear organización → datos mínimos del negocio/sucursal → reglas mínimas de operación → primera recepción.

### F1 — Recepción
Cliente → equipo → motivo/condición/evidencia → prioridad → OT creada.

### F2 — Triage / asignación
OT entra a cola → se asigna técnico → se habilita revisión según política/cobro.

### F3 — Diagnóstico
Técnico inicia actividad → registra pruebas/hallazgos → diagnóstico listo.

### F4 — Cotización y decisión
Se genera propuesta → cliente recibe enlace → aprueba/rechaza → decisión queda trazada.

### F5 — Reparación
Trabajo aprobado → técnico ejecuta → repuestos/reservas/consumos quedan ligados → bloqueos/esperas se registran.

### F6 — Pruebas / cierre técnico
Se valida resultado → OT queda finalizada/lista para entrega.

### F7 — Cobro y entrega
Se completa obligación comercial → evidencia/entrega → garantía cuando corresponda → OT entregada.

### F8 — Post-servicio
Portal/comprobante/garantía + trazabilidad histórica. Calidad/reciclaje aparecen solo cuando aplica.

Regla SOT: la Orden de Trabajo es el objeto central. OrdenesTrabajo es inbox/gestión/creación. ExpedienteOT es el centro de verdad y trabajo profundo de una OT.

## 5. Arquitectura de experiencia objetivo

### HOY
Una sola home accionable por rol. Muestra exclusivamente lo que requiere atención o ejecución ahora. No pretende ser dashboard histórico.

### TALLER
- Órdenes
- Agenda
- Inventario

Cola de revisión se integra como vista/filtro operativo de Órdenes u Operación en lugar de competir como destino principal cuando sea viable.

### CLIENTES Y VENTAS
- Clientes
- Cotizaciones
- Caja y Cobros
- Garantías

Historial de ventas se integra como vista de Caja/Ventas cuando sea viable.
CRM/Leads permanece capability secundaria, no protagonista.

### NEGOCIO
Una superficie ejecutiva principal con drill-down/tabs:
- Resumen
- Finanzas
- Operación
- Equipo/Rendimiento

Ventas y Ganancias, Análisis de Operaciones, Supervisión en Vivo y Productividad dejan de competir como seis destinos equivalentes. Pueden reutilizar sus componentes/datos dentro de esta jerarquía.

### ADMINISTRACIÓN
- Mi negocio
- Equipo y acceso
- Sucursales
- Configuración avanzada

### CAPACIDADES AVANZADAS/CONTEXTUALES
- Calidad / No conformidades
- Reciclaje
- CRM/Leads avanzado
- administración SaaS

No se eliminan del código por esta definición. Se reduce su peso inicial y se presentan según rol/contexto/packaging.

## 6. Vocabulario canónico

Usar en producto/UX:
- Hoy: bandeja accionable del rol.
- Negocio: lectura ejecutiva y analítica.
- Operación: supervisión del flujo de trabajo.
- Órdenes: listado/kanban/recepción de OTs.
- Expediente: centro de verdad de una OT.
- Recepción: creación inicial de OT.
- Caja y Cobros: cobro y transacciones del servicio.
- Cotizaciones: propuestas y decisiones del cliente.
- Clientes: personas/empresas atendidas.
- Inventario: existencias y movimientos.
- Equipo: dispositivo/activo físico del cliente. Para personas internas usar “Equipo de trabajo” solo cuando el contexto sea inequívoco.

Retirar progresivamente del UX final:
- “Dashboard” como nombre visible principal;
- tooltips “Antes: ...”;
- “Punto de Venta” cuando la acción real es Caja y Cobros;
- estados CRM internos en inglés visibles al usuario;
- múltiples nombres para la misma lectura ejecutiva.

## 7. Core vs capacidades avanzadas

### CORE COMERCIAL
- organizaciones/sucursales y roles;
- recepción y OT;
- asignación/cola;
- expediente y bitácora;
- diagnóstico/pruebas;
- cotización y aprobación pública;
- reparación/actividad técnica;
- clientes/equipos;
- caja/cobro;
- entrega/evidencia;
- garantía;
- inventario operacional ligado a servicio;
- agenda;
- portal/seguimiento del cliente;
- Hoy por rol;
- lectura básica del negocio;
- seguridad/trazabilidad operacional.

### BUSINESS / ADVANCED CANDIDATES — packaging se decide en MB4
- multi-sucursal avanzada;
- analítica profunda y productividad;
- supervisión operacional avanzada;
- Calidad / No conformidades;
- Reciclaje;
- CRM/Leads;
- automatizaciones avanzadas;
- capacidades SaaS/soporte que no corresponden al usuario final.

Regla: no degradar el core hasta volverlo inútil para forzar upgrade. Los planes deben diferenciar profundidad/escala/control, no romper el workflow esencial.

## 8. Onboarding objetivo

### Principio
Time-to-value antes que configuración exhaustiva.

### Flujo nuevo
1. Crear negocio: nombre, país, moneda.
2. Confirmar sucursal principal/datos mínimos.
3. Configurar solo reglas que bloquean el primer servicio: términos y política de diagnóstico/cobro cuando aplique.
4. “Recibe tu primer equipo” → abrir directamente Nueva OT.
5. Cliente y equipo se crean inline durante recepción.
6. Después de la primera OT, mostrar setup progresivo: invitar equipo, personalizar negocio, inventario, etc.

No redirigir a Settings genérico inmediatamente después de crear la organización.

## 9. Métricas de activación y adopción

### Account created
Organización creada correctamente.

### Activated
Primera OT real creada.

### Operationally activated
Primera OT asignada y primera actividad/diagnóstico iniciado.

### First customer value
Cliente recibe al menos un enlace útil de seguimiento/cotización y el servicio avanza una etapa trazada.

### First completed value
Primera OT llega a entrega/cierre con trazabilidad.

### Team adoption
Dos o más usuarios activos realizan acciones operacionales durante una ventana de 7 días, cuando la cuenta tiene equipo multiusuario.

### Owner value
ORG_ADMIN consulta Hoy/Negocio y puede identificar pendientes/cobros/estado sin reconstrucción manual.

MB6 definirá instrumentación/targets exactos para piloto; estas son definiciones de producto, no metas numéricas todavía.

## 10. Backlog de simplificación previo a pricing/web/piloto

### MB2-A — P0 UX / navegación
1. Consolidar navegación gerencial en HOY / NEGOCIO / OPERACIÓN, reutilizando páginas/componentes existentes.
2. Mantener Órdenes como inbox/kanban/recepción y dirigir detalle profundo al Expediente.
3. Eliminar nomenclatura legacy visible y tooltips “Antes:”.
4. Definir una home inequívoca por rol y redirecciones consistentes.

### MB2-B — P0 ACTIVACIÓN
5. Cambiar post-bootstrap de Onboarding: no enviar a Settings genérico.
6. Crear ruta de activación hacia primera recepción/OT con setup progresivo.
7. Ajustar QuickStart para medir el nuevo orden: negocio → primera OT → equipo/usuarios/config avanzada.

### MB2-C — P1 CONTEXTO
8. Reducir peso de Calidad/Reciclaje/CRM en navegación inicial sin eliminar capabilities.
9. Integrar Calidad/Reciclaje visiblemente en Expediente cuando estén vinculados a la OT.
10. Revisar Cola de Revisión e Historial de Ventas como vistas/subvistas en lugar de destinos equivalentes.

### MB2-D — P1 CONSISTENCIA
11. Canonizar vocabulario visible.
12. Unificar títulos/estilos de superficies principales; quitar señales de generaciones UX mezcladas.
13. Distinguir explícitamente bandejas recientes de métricas exhaustivas.

### MB2-E — P1 ESCALA / producto
14. KPI gerencial nunca debe depender silenciosamente de un límite 50/100/500 del frontend.
15. Certificar en MB7 métricas agregadas/paginación y runtime real.

## 11. Cambios que NO deben hacerse todavía

- No renombrar TRP/TechRepair Pro aún: MB3.
- No rediseñar logo/branding todavía: MB3.
- No publicar Basic/Pro/Premium legacy como planes finales: MB4.
- No construir web comercial definitiva: MB5.
- No eliminar módulos ni schemas por intuición: primero simplificar exposición y validar piloto.
- No crear un segundo producto “Enterprise” por defecto; packaging se decide después.

## 12. Gate MB2

La definición de producto queda cerrada cuando:
- existe un ICP primario único;
- OT/Expediente es declarado centro del dominio;
- existe core workflow oficial F0–F8;
- existe arquitectura objetivo de navegación;
- roles tienen home/job principal inequívoco;
- core vs advanced está separado sin pricing prematuro;
- onboarding tiene ruta de first value;
- vocabulario canónico está definido;
- existe backlog de simplificación priorizado.

Este documento satisface la definición. La implementación de los puntos 1–15 se ejecuta como macrogolpe de simplificación antes de cerrar visualmente MB2 y entrar a MB3 Naming/Positioning.
