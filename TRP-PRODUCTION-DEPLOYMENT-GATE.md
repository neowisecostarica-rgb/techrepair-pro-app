# TRP — Gate de despliegue de producción

## Hallazgo 2026-08-26

La aplicación publicada quedó en un estado parcial: el frontend depende de los
comandos de seguridad e identidad nuevos, pero producción no tiene desplegadas
funciones backend añadidas desde 2026-08-10, incluyendo `identityGateway` y
`operationalGateway`. El síntoma visible fue un error de autenticación antes de
cargar el portal Super Admin.

## Regla obligatoria

No interpretar un error de login, roles, tenant o Super Admin como un motivo para
relajar RLS, autorización o fail-closed hasta comprobar el inventario de funciones
desplegadas contra el código aprobado en GitHub.

Antes de cualquier Publish:

1. Reconciliar el workspace de Base44 con la rama Git aprobada.
2. Comparar todas las funciones del repositorio con el registro runtime publicado.
3. Ejecutar staging y smoke tests autenticados para identidad, Super Admin,
   organizaciones, usuarios, recepción, venta, entrega y auditoría.
4. Definir rollback y criterios GO/NO-GO.
5. Publicar únicamente tras PASS documentado.

Un Publish puede actualizar funciones existentes además de incorporar funciones
nuevas; nunca debe hacerse como arreglo rápido de un error de autenticación.
