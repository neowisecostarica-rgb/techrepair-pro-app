# TRP-IMPORT-005 — Cierre técnico de diagnóstico y empaquetado candidato
Fecha: 2026-11-05. App: 695d708948469128f473d080.

## Hallazgo confirmado
El código `base44/functions/createInventoryItem/entry.ts` importa cuatro módulos desde `../_shared/*`. La herramienta de edición Base44 rechazó el bundle al validar rutas fuera del directorio de la función. No se intentó forzar el despliegue ni sustituir los módulos compartidos por una segunda implementación.

## Prueba segura y reproducible
En el sandbox de Base44 se ejecutó `esbuild.build` sobre el entry real, con `bundle:true`, `platform:neutral`, `format:esm`, `target:es2022` y paquetes `npm:*`/`jsr:*` externos. El resultado temporal se escribió exclusivamente en `/tmp/trp-createInventoryItem-candidate.ts` (no es parte de la app y no se despliega). Resultado: 83760 bytes, un único import externo SDK, cero importaciones relativas. SHA256 fuente: `c0823f3ca163bc49def42b11090e15a9ec463ecc1c7195bc7ddbf6dc7d38f321`.

## Validación
8/8 chequeos del candidato PASS: fuente intacta, ausencia de imports relativos, serial, SKU, barcode, guard de autorización, guard de sucursal y mutación canónica de stock. Contratos previos de importación: 15/15 PASS de casos sintéticos. No se ejecutaron escrituras de datos ni pruebas de concurrencia reales.

## Estado y límites
- Empaquetado de candidato: PASS en aislamiento. Compatibilidad del empaquetado del runtime Base44: NO VERIFICADA.
- Persistencia de `numero_serie` en servidor real: NO VERIFICADA. El código de `entry.ts` tiene el campo, pero el build del frontend no prueba el backend.
- No se cambió `function.jsonc`, no se activó otro entrypoint, no se realizó Publish/deploy ni importación real.
- Gate P0-AUD-01 permanece BLOQUEADO, igual que identidades aisladas #12 y QA navegador #15.

## Próximo paso autorizado sin datos reales
Validar el candidato en un entorno Base44 realmente aislado antes de apuntar `function.jsonc` al bundle. El cambio del entrypoint en main no se hará sin verificar que guardado de código no afecte funciones atendiendo producción. Tras resolver ese gate, ejecutar prueba aislada de persistencia SKU, barcode y serial, y luego QA de previsualización de las diez hojas reales sin importación.
