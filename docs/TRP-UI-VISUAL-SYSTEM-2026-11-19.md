# TRP UI — sistema visual unificado desde la portada comercial

Fecha: 2026-11-19
App Base44: 695d708948469128f473d080
Dirección aprobada por Gustavo: trasladar el lenguaje visual de `/trp` a toda la aplicación autenticada.
Estado: **FUNDACIÓN APLICADA / QA VISUAL POR MÓDULO PENDIENTE / NO-GO GENERAL**.

## Lenguaje visual canónico

- Portada TRP: fondos claros #f7f8f8, estructura editorial, azul noche #0b1422, verde petróleo/teal en estados y acciones, tarjetas blancas y bordes suaves.
- Aplicación operativa: fondo #f6f9f8, shell azul noche, superficies blancas de 22–24 px de radio, jerarquía tipográfica consistente, CTA redondeados y tablas de lectura tranquila.
- Los colores de alerta (rojo, ámbar, azul) conservan su semántica operativa; no se sustituyen por teal indiscriminadamente.
- El menú siempre se filtra por capacidades de backend; CSS, navegación y diseño no conceden permisos.

## Implementado en el borrador (frontend)

- `src/index.css`: tokens de paleta, radio y estilo tipográfico del workspace.
- `src/Layout.jsx`: encabezado común de módulo para plataforma y tenants, mismo lenguaje de marca, acceso a la portada y fondo unificado.
- `src/components/layout/SidebarMenu.jsx`: categorías, estados activos, contraste y navegación coherentes.
- `src/components/ui/card.jsx`: tarjeta compartida con borde y elevación suaves.
- `src/components/ui/button.jsx`: CTA primario teal y forma redondeada.
- `src/components/ui/input.jsx`: inputs de 40 px y foco visible.
- `src/components/ui/table.jsx`: tablas, cabeceras y selección más legibles.
- Navegación móvil con Sheet accesible reutilizando el mismo SidebarMenu y capacidades; antes la barra lateral estaba oculta en móviles.
- La portada sigue en `/` y alias `/trp`, con acceso al sistema vía `/Home`.

## Pruebas automatizadas sobre el candidato

- `npm run build`: PASS (exit 0).
- `npm run test:multiuser-navigation`: 8/8 PASS.
- `npm run test:identity-tenant-security`: 7/7 PASS.
- `git diff --check`: PASS.
- **No se ejecutaron tests E2E autenticados de pantalla o teléfono**, ni se publicaron cambios.

## Backlog de diseño y QA visual pendiente

1. P0 — Verificar autenticado en navegador SUPER_ADMIN (Saas), ORG_ADMIN (MiDia), SALES (MiDia, CRM, Inventario solo lectura) y TECHNICIAN (MiDia y órdenes). Revisar que la presentación no tape errores/gates de identidad.
2. P0 — Mobile 360/390 px: menú abrir/cerrar, foco/Escape, scroll de páginas y tablas, CTA sin solapes y contraste WCAG. No asumir PASS de móvil por build.
3. P1 — Recorrido por módulos de las 47 páginas JSX registradas en `src/pages`, corregir excepciones de componentes inline que no usen UI compartida. Prioridad comercial-first: CRM → Cotizaciones → Inventario → Ventas/Cobros → Recepción/OT → consola Admin.
4. P1 — Afinar estados vacíos, filtros, formularios largos, tablas y modales según cada rol, sin alterar lógica ni backend.
5. P1 — Capturas comparables con la referencia `/trp`; confirmar con Gustavo la consistencia visual.
6. Gate release separado: auditoría P0-AUD-01, QA E2E multi-tenant y reconciliación runtime permanecen NO-GO.

## Restricciones

No Publish, no cambios de permisos/RLS, backend, clientes, stock o cobros reales. Los cambios de estilo en el sandbox no hacen pública la app privada; publicación comercial requiere decisión aparte.
