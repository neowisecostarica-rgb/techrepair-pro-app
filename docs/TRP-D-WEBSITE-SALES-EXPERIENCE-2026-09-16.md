# TRP D — WEBSITE / SALES EXPERIENCE SOT

Fecha: 2026-09-16
Estado: IMPLEMENTATION COMPLETE — HUMAN VISUAL QA DEFERRED

## Implementado
- Página pública TRP en `/trp` y alias `/website`, fuera del shell autenticado.
- Narrativa canónica Technology Asset Operations y Repair → Operational Control → Asset Lifecycle → Reliability.
- Hero, problema/transformación, workflow, Expediente, roles/escala, control/trazabilidad, pricing, reliability y CTA.
- Pricing canónico de piloto: Core 69/690, Business 129/1290, Enterprise custom.
- No expone Basic/Pro/Premium ni ID técnico `advanced`.
- No vende Reliability Score ni integraciones/Enterprise roadmap como actuales.
- Mockups editoriales propios como placeholders; no dependen de imágenes externas ni afirman ser screenshots reales.
- `WebsiteVisualEditor` para Super Admin: slots Hero, Expediente, Hoy y Asset Lifecycle; upload vía Base44 y preview/manifest para reemplazo posterior por visuales reales.
- Responsive implementado.

## Visual policy
Los mockups pueden permanecer durante staging. Antes de publicación comercial definitiva se recomienda sustituir los visuales clave por screenshots/imágenes reales aprobadas. El editor permite hacerlo sin rediseñar la arquitectura de la página.

## Pendiente deliberado
- QA visual humano final.
- Confirmar email/contact endpoint definitivo antes de publish; el CTA actual es provisional y no debe considerarse integración comercial final.
- SEO/domain/canonical/analytics de producción en cutover correspondiente.
- Si se desean fotografías lifestyle con personas, pueden añadirse al editor posteriormente; no son requisito para validar la arquitectura web.

## Definition of Done D
Implementación web completa y compilable; contenido reconciliado con C5; visual replacement path preparado; build/lint/diff PASS. QA humano y publicación no se adelantan.
