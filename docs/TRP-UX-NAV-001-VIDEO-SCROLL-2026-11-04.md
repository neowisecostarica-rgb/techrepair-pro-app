# TRP-UX-NAV-001 — Revisión de grabación y scroll entre módulos
**Fecha:** 2026-11-04
**Alcance:** TRP Base44 Preview, recorrido visual de ~152 segundos aportado por Dirección General.
**Candidato de partida:** b8a78365e90f23b53d37dc77d3a71f2eeee69950
**Estado de incidencia principal:** CERRADO — confirmado por Dirección General en Base44 Preview el 2026-11-04 («listo cerralo»), tras la corrección de navegación. El cierre aplica exclusivamente al scroll entre módulos de TRP; no implica aprobación integral de la beta.

## Incidencia principal y corrección
- La navegación SPA en src/App.jsx no restablecía la posición del documento al cambiar pathname. La nueva pantalla podía conservar el desplazamiento anterior y comenzar lejos del encabezado.
- Se agregó ScrollToTopOnModuleChange dentro del BrowserRouter, con useLayoutEffect por pathname; restablece scroll principal a 0 y repite una vez tras el pintado.
- Hash anchors no se fuerzan a 0 para respetar la navegación intencional a una sección.
- Scroll de sidebar y de modales queda independiente.
- Se corrigió también la accesibilidad del nombre completo de los enlaces laterales truncados: title de cada item.
- Contrato scripts/verify-trp-route-scroll-top.test.mjs PASS 3/3. Build PASS y contrato de Inventario SALES solo lectura PASS.
- **QA visual de navegación confirmado por Dirección General (2026-11-04).** Se registra el cierre funcional de TRP-UX-NAV-001 basado en la verificación directa del usuario. El test automatizado de navegador no se ejecutó; otros módulos y SaaS conservan sus propias validaciones.

## Otras observaciones de la grabación (no confundir con bugs demostrados)
- Se recorrieron Mi Día, Negocio, Órdenes, Activos, Agenda, Cola de Revisión, Inventario, Caja, Cotizaciones, Clientes, CRM y Configuración.
- En Cola de Revisión se ven algunas órdenes de 97 y 123 días. Validar antigüedad y priorización con el dueño; NO editar ni asignar órdenes a partir de este video.
- El menú muestra «Cola de Revisi...» por truncamiento. Tooltip de nombre completo incluido en la corrección, sin ensanchar la navegación.
- CRM Prospectos muestra estado vacío mientras Clientes muestra registros. Son entidades/funciones diferentes: validar que los leads realmente deban existir antes de clasificar como defecto.
- Las gráficas del panel Negocio se ven vacías en ese momento. Revisar filtros/datos/período si se informa como incidencia; no afirmar que las consultas fallaron.
- En Inventario aparece un artículo llamado «MANTENIMIENTO» en el catálogo físico. Revisar clasificación entre Inventario y Servicio durante la próxima validación de migración; no migrarlo ni cambiar stock automáticamente.
- Los modales de cotización y nuevo artículo tienen scroll interno propio, comportamiento normal mientras se editan formularios largos. No aplicar la regla global a esos paneles.
- Una captura con «Cargando cotizaciones...» es transitoria; no se confirmó error ni timeout.

## Seguridad y alcance
- No se hicieron Publish/deploy ni cambios en datos o membresías de COMPU STORE.
- No se modificaron los demás SaaS. Para ellos, revisar su router/layout correspondiente y reutilizar el patrón sin copiarlo a ciegas.
- P0-AUD-01 (ledger atómico de auditoría), QA de navegador multirol y E2E comercial siguen pendientes de evidencia.
