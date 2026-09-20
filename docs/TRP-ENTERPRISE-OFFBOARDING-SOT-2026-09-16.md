> **Status update — 2026-09-19:** the originally future concept below has now been implemented in source as Enterprise Asset Control + Onboarding + Offboarding + Command & Evidence. It remains pending staging/runtime/human release validation. The historical design text below is retained for traceability; current status authority is `TRP-MB4-ENTERPRISE-RECONCILIATION-2026-09-19.md`.

# TRP — ENTERPRISE OFFBOARDING SOT

Fecha: 2026-09-16
Estado: CAPTURED / PENDIENTE DE DISEÑO E IMPLEMENTACIÓN
Roadmap padre: `docs/TRP-MASTER-ROADMAP-SOT-2026-09-15.md`
Producto: TRP — Technology Reliability Platform
Territorio: Technology Asset Operations

## 1. Propósito

Capturar como oportunidad Enterprise que TRP debe contemplar el offboarding tecnológico de empleados como un workflow de control de activos, accesos y evidencia, sin convertir TRP en un sistema de RRHH ni asumir funciones legales/laborales que pertenecen a HR/Legal.

El documento fuente aportado por Gustavo define offboarding como el proceso formal de desvinculación cuando un empleado deja una empresa y señala que incluye acciones administrativas, legales, tecnológicas y humanas. Para TRP, el foco es la porción Technology Asset Operations: activos asignados, devolución, accesos, responsables, trazabilidad, evidencias y cierre.

## 2. Problema Enterprise que TRP puede resolver

Cuando una persona sale de una organización, múltiples acciones críticas deben ocurrir de forma coordinada:
- recuperar laptops, teléfonos, periféricos, tarjetas, llaves u otros activos;
- identificar todos los activos asignados a la persona;
- coordinar revocación/desactivación de accesos con IT;
- registrar responsables, tiempos y evidencia;
- verificar condición de los activos recuperados;
- decidir reasignación, mantenimiento, reparación, borrado/preparación o retiro;
- conservar historial auditable de lo ocurrido;
- cerrar el proceso únicamente cuando las obligaciones tecnológicas estén resueltas.

El documento fuente destaca explícitamente devolución de equipos y desactivación de accesos como pasos principales del offboarding, y propone coordinación con IT mediante una matriz de accesos y un momento exacto de revocación ('Minuto Cero').

## 3. Hipótesis de producto — TRP Enterprise Offboarding

Diseñar en una fase futura un workflow `Enterprise Offboarding` conectado al expediente del activo y al historial operacional de TRP.

Trigger posible:
- HR/cliente informa salida programada de una persona.

TRP podría generar un caso/checklist de offboarding tecnológico con:
1. Persona / identificador interno.
2. Organización, sede, departamento y responsable.
3. Fecha/hora efectiva de salida.
4. Inventario automático de activos actualmente asignados.
5. Checklist de recuperación por activo.
6. Estado de devolución: pendiente / recibido / faltante / excepción.
7. Condición física/técnica al recibir.
8. Evidencia: firma, fotografías, documentos y observaciones cuando corresponda.
9. Matriz/checklist de accesos a revocar o confirmar con IT.
10. Responsable de cada acción y timestamp.
11. Confirmación de revocación; TRP no debe afirmar que revocó sistemas externos salvo integración real que lo ejecute y confirme.
12. Acción posterior del activo: reasignar / diagnóstico / mantenimiento / reparación / sanitización/borrado certificado cuando exista capacidad / inventario / retiro.
13. Excepciones y escalamiento.
14. Cierre y reporte ejecutivo/auditable.

## 4. Concepto 'Minuto Cero'

El material fuente propone coordinar con IT una hora exacta para revocar accesos inmediatamente después de la notificación de salida. TRP debe estudiar este concepto como un mecanismo de orquestación y evidencia:
- effective_offboarding_at;
- access_revocation_due_at;
- asset_return_due_at;
- owner/responsible;
- completion timestamps;
- overdue/escalation;
- evidence/confirmation.

IMPORTANTE: la secuencia exacta y los tiempos deben ser configurables por cliente, jurisdicción, política y tipo de salida. No codificar como regla universal una revocación a '+1 minuto'.

## 5. Encaje con el producto existente

Esta capacidad debe reutilizar, no duplicar:
- Asset identity / asset lifecycle.
- Asignación activo ↔ persona/ubicación.
- Expediente de OT / historial operacional cuando corresponda.
- Documentos/evidencias.
- Roles/permisos.
- Organización/sucursal.
- Auditoría/timestamps.
- Notificaciones/escalamientos cuando existan.
- Enterprise Command Center futuro.

Offboarding debe demostrar la evolución de TRP desde reparación hacia Technology Reliability Platform: la confiabilidad operacional incluye saber quién tiene cada activo, recuperarlo al cambiar la relación laboral, controlar su siguiente estado y mantener evidencia de la transición.

## 6. Límites de alcance

TRP NO debe convertirse por defecto en:
- nómina;
- cálculo de liquidaciones/finiquitos;
- asesoría jurídica laboral;
- herramienta para decidir despidos;
- plataforma de entrevistas de salida de RRHH;
- HRIS completo.

Esas funciones pueden pertenecer a sistemas externos o partners. TRP puede registrar referencias/estados o integrarse cuando exista una razón de producto, pero el núcleo es el offboarding tecnológico y de activos.

## 7. Enterprise / Integraciones futuras a evaluar

Sin prometerlas hasta implementarlas:
- HRIS como trigger de alta/baja.
- Identity providers / directory / SSO para evidencia o automatización de revocación.
- Email/collaboration suites.
- MDM/RMM/endpoint management.
- Access control físico.
- ITSM/service desk.
- Firma/evidencia digital.

Regla: distinguir siempre `requested`, `acknowledged`, `confirmed` y `executed`. Nunca marcar una acción externa como ejecutada únicamente porque TRP generó una tarea.

## 8. Métricas Enterprise potenciales

Evaluar después de diseñar el workflow:
- % offboardings tecnológicos completados a tiempo.
- activos recuperados / pendientes / faltantes.
- tiempo medio de recuperación de activos.
- accesos pendientes de confirmación después de la hora efectiva.
- activos listos para reasignación.
- activos enviados a diagnóstico/reparación.
- valor de activos pendientes de recuperación.
- excepciones por sede/departamento.

No definir un score comercial hasta validar metodología y datos.

## 9. Seguridad / Compliance

El documento fuente advierte que offboarding maneja información sensible. Para TRP Enterprise se debe revisar antes de producción:
- principio de mínimo privilegio;
- segregación HR / IT / Security / operador externo;
- tenant isolation;
- auditoría inmutable o suficientemente robusta según arquitectura;
- retención de evidencia;
- protección de PII;
- exportación/reporte;
- permisos para visualizar motivo de salida: preferiblemente TRP no necesita conocer detalles laborales salvo requerimiento explícito y justificado;
- tratamiento de datos y requisitos legales por jurisdicción.

## 10. Relación con MB4 / Pricing

Al diseñar planes, considerar `Enterprise Offboarding` como capability Enterprise potencial. No fijar todavía precio ni incluirla como funcionalidad existente en la web hasta que producto defina alcance y estado real.

Puede tener valor comercial como:
- módulo Enterprise;
- workflow incluido en Enterprise;
- add-on por volumen/casos;
- servicio de implementación/integración.

La decisión comercial queda para MB4.

## 11. Relación con MB6 / Pilot

Puede ser un caso de uso piloto especialmente valioso para organizaciones con muchos usuarios y activos. Antes de pilotear:
- validar workflow con IT + HR + Security;
- definir ownership de cada paso;
- definir qué hace TRP y qué hace cada sistema externo;
- preparar datos/demo reproducibles;
- establecer criterios de éxito y evidencia de cierre.

## 12. Definition of Done futura

Este SOT NO autoriza implementación inmediata. Se considera desarrollado cuando:
- Product Definition incorpora formalmente el workflow;
- UX/roles/permisos están definidos;
- modelo de datos reutiliza activos/personas/ubicaciones sin duplicación innecesaria;
- seguridad/compliance revisados;
- integraciones distinguen solicitud de ejecución real;
- pricing/entitlements determinan disponibilidad;
- QA E2E incluye al menos un offboarding Enterprise completo;
- web solo lo comunica cuando exista y esté validado.

## 13. Fuente de oportunidad

Documento aportado por Gustavo el 2026-09-16: `El offboarding es el proceso formal de desvinculación laboral cuando un empleado deja una empresa.pdf`.

Elementos especialmente relevantes para TRP:
- devolución de equipos/materiales;
- desactivación coordinada de accesos;
- plantillas/inventarios para entrega de activos;
- matriz de accesos;
- coordinación con punto de contacto IT;
- concepto de 'Minuto Cero';
- acta/evidencia de entrega de equipos;
- reporte final.

Los precios, servicios jurídicos y modelos comerciales contenidos en el documento NO se adoptan como pricing de TRP. Se conservaron únicamente como contexto de la oportunidad y deben revalidarse independientemente si alguna vez se evalúan como servicio NeoWise.
