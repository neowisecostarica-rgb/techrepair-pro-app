# TRP Pre-Publish Runbooks

> **Aviso:** Estos runbooks son **planes de ejecución**. Ninguno se ejecuta como parte de este documento. Cada runbook requiere aprobación explícita antes de iniciarse.

---

## Runbook A — Provisión de staging aislado

**Precondiciones:** Aprobación explícita de provisión de staging. Acceso admin al workspace Base44.

### Paso 1 — Crear app Base44 de staging
1. En Base44 dashboard → New App → nombre: `tech-repair-pro-staging`
2. No conectar a producción. No importar datos.
3. Configurar dominio/URL de staging (no el de producción).

### Paso 2 — Sincronizar desde GitHub
1. Conectar la app de staging al mismo repo GitHub (rama `main` o rama `release/staging`).
2. Confirmar sync: `git log` en Base44 debe mostrar el mismo HEAD que producción (`main` Aug 26).
3. **No** ejecutar Publish aún.

### Paso 3 — Verificar schemas
1. Confirmar que todas las entidades (`base44/entities/*.jsonc`) están presentes.
2. Comparar count de entidades: repo vs. staging. Deben coincidir.
3. Verificar RLS en cada entidad (debe ser idéntico a `main`).

### Paso 4 — Crear datos sintéticos mínimos
Vía `exec_tool` o backend function de seeding (crear si no existe):

```
1 Organization: { name: "TRP Staging Org", country: "CR", currency: "CRC", plan: "pro", status: "active" }
1 Branch: { organization_id, name: "Staging Branch" }
1 UserAccount por rol:
  - SUPER_ADMIN (built-in User + UserAccount)
  - ORG_ADMIN
  - BRANCH_ADMIN
  - TECHNICIAN
  - SALES
  - INVENTORY
  - CUSTOMER_SERVICE
  - SUPPORT
```

**Reglas:**
- Emails sintéticos: `staging+<role>@trp-test.local`
- Contraseñas: credenciales separadas, rotadas, no reutilizadas de producción
- No crear clientes, equipos, OTs, inventario ni ventas reales

### Paso 5 — Publish inicial de staging
1. Ejecutar Publish en la app de staging.
2. **No asumir atomicidad:** verificar registro runtime función por función.
3. Para cada función del repo, confirmar que aparece en `existing_backend_functions` de staging.

### Paso 6 — Verificación de despliegue (función por función)
Para cada una de las 51 funciones + `_shared`:
1. GET `https://<staging>.base44.app/functions/<functionName>` (sin auth) → esperar 401 (existe) vs 404 (no desplegada)
2. Si 404 → marcar NO-GO, investigar build/deploy log
3. Documentar resultado en `TRP-PRE-PUBLISH-GO-NOGO.md` § Inventario

### Paso 7 — Confirmar aislamiento
1. Confirmar que staging no comparte DB con producción
2. Confirmar que no hay secrets de producción en staging
3. Confirmar que no hay webhooks apuntando a staging (los webhooks de providers deben seguir apuntando a producción)

**Criterio de salida:** Staging aislado, 51 funciones desplegadas, datos sintéticos creados, aislamiento confirmado.

---

## Runbook B — Pausa global de mutaciones

**Precondiciones:** Staging operativo. Mecanismo de pausa diseñado (no reutilizar `controlled_pilot_mode`).

### Diseño del mecanismo
- **Flag:** Campo en `Organization` (ej. `mutation_pause_active: boolean`, `mutation_pause_reason: string`, `mutation_pause_at: date-time`, `mutation_pause_by: string`)
- **RLS:** `write: false` en frontend; solo ORG_ADMIN/SUPER_ADMIN puede activar vía backend function
- **Gateway check:** Todos los comandos soberanos P0 (`createWorkOrder`, `transitionWorkOrderStatus`, `createSale`, `deliverWorkOrder`, `initTechnicalActivity`, `technicalActivityCommand`, etc.) deben verificar el flag al inicio y rechazar con `MUTATION_PAUSED` si está activo
- **UX:** Frontend muestra banner de mantenimiento cuando el flag está activo
- **Drain window:** Tras activar la pausa, esperar 60s para confirmar que no hay requests en vuelo

### Paso 1 — Implementar en rama feature
1. Crear rama `fix/trp-mutation-pause`
2. Añadir campo a `Organization.jsonc`
3. Añadir check en cada comando soberano (middleware o guard inicial)
4. Añadir backend function `toggleMutationPause` (ORG_ADMIN/SUPER_ADMIN only)
5. Añadir banner UX en `Layout.jsx`
6. PR → merge → sync staging

### Paso 2 — Probar en staging
1. Activar pausa → confirmar que todos los comandos soberanos rechazan con `MUTATION_PAUSED`
2. Confirmar que lecturas siguen funcionando (solo mutaciones se pausan)
3. Confirmar banner visible
4. Desactivar pausa → confirmar que mutaciones reanudan
5. Registrar en AuditEvent

### Paso 3 — Documentar
- Responsable de activación: ORG_ADMIN o SUPER_ADMIN
- Operaciones bloqueadas: lista completa de comandos soberanos
- Mensaje visible: "Mantenimiento programado — las operaciones están temporalmente pausadas"
- Drain window: 60s
- Auditoría: AuditEvent `MUTATION_PAUSE_TOGGLED`

**Criterio de salida:** Mecanismo ensayado en staging, documentado, listo para uso en rollback productivo.

---

## Runbook C — Rollback productivo

**Precondiciones:** Pausa de mutaciones ensayada (Runbook B). Aprobación explícita de rollback.

### Trigger
Cualquiera de:
- Fallo E2E post-Publish en producción
- Fuga cross-tenant detectada
- Bypass de autorización detectado
- Inconsistencia de auditoría detectada

### Paso 1 — Activar pausa de mutaciones
1. ORG_ADMIN o SUPER_ADMIN activa `toggleMutationPause` con razón
2. Confirmar banner visible en producción
3. Esperar drain window (60s)

### Paso 2 — Revertir en Git
1. Identificar el commit que rompió (`git log --oneline -20`)
2. `git revert <commit>` → resolver conflictos si los hay
3. Push a `main` (o PR si se prefiere review)
4. Confirmar sync Base44 (draft = `main` post-revert)

### Paso 3 — Re-publicar
1. Ejecutar Publish en producción
2. Verificar registro runtime función por función (no asumir atomicidad)
3. Confirmar que las funciones afectadas están en el estado pre-fallo

### Paso 4 — Smoke tests post-rollback
1. Ejecutar los 7 flujos E2E en producción (Testing Agent)
2. Ejecutar scripts de contrato críticos (identidad, autorización, auditoría)
3. Confirmar PASS en todos

### Paso 5 — Reanudar mutaciones
1. Solo tras PASS en smoke tests
2. Desactivar `toggleMutationPause`
3. Confirmar que mutaciones reanudan
4. Registrar AuditEvent de reanudación

### Paso 6 — Postmortem
1. Documentar causa raíz del fallo
2. Documentar tiempo de detección + tiempo de rollback
3. Acción correctiva para prevenir recurrencia
4. Actualizar este runbook con lecciones

**Criterio de salida:** Producción restaurada a estado operacional, mutaciones reanudadas, postmortem registrado.

---

## Runbook D — Publish a producción (referencia, no ejecutar)

**Precondiciones:** Todos los criterios GO de `TRP-PRE-PUBLISH-GO-NOGO.md` cumplidos. Aprobación explícita de Publish.

### Paso 1 — Pre-Publish
1. Confirmar draft reconciliado con `main` (último commit)
2. Confirmar staging PASS (matriz de smoke tests)
3. Activar pausa de mutaciones en producción (Runbook B)
4. Esperar drain window

### Paso 2 — Publish
1. Ejecutar Publish en producción
2. **No asumir atomicidad:** verificar registro runtime función por función
3. Para cada una de las 51 funciones:
   - Confirmar despliegue (GET sin auth → 401)
   - Confirmar operatividad (smoke test autenticado)

### Paso 3 — Post-Publish
1. Ejecutar los 7 flujos E2E en producción
2. Ejecutar scripts de contrato críticos
3. Monitorear logs de runtime por 30 min
4. Si todo PASS → reanudar mutaciones
5. Si cualquier fallo → ejecutar Runbook C (Rollback)

**Criterio de salida:** Producción con 51 funciones operativas, smoke tests PASS, mutaciones reanudadas.