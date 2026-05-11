import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/*
=====================================
getOTEventHealth — ONF-v2 Observabilidad Ligera v1
=====================================
Responsabilidad:
  Query ligera sobre la entidad OTEvent para exponer métricas
  operacionales básicas del pipeline. Solo lectura. Sin side-effects.

Acceso: solo admin o super_admin.

Retorna:
  - pending_total: OTEvents con processed=false
  - stuck_total: OTEvents con processed=false y creados hace más de STUCK_THRESHOLD_MINUTES min
  - stuck_events: lista de los eventos atascados (máx 20) para debugging
  - recent_volume: conteo de eventos creados en las últimas RECENT_HOURS horas

NO modifica ninguna entidad. NO crea OTEvents. NO ejecuta side-effects.
=====================================
*/

const STUCK_THRESHOLD_MINUTES = 10; // Evento pendiente más de 10 min = "atascado"
const RECENT_HOURS = 24;            // Ventana de volumen reciente

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    // ── 1. Auth — solo admin ────────────────────────────────────────────────────
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {
      // No-op
    }

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: se requiere rol admin' }, { status: 403 });
    }

    // ── 2. Calcular umbrales de tiempo ─────────────────────────────────────────
    const now = new Date();
    const stuckThreshold = new Date(now.getTime() - STUCK_THRESHOLD_MINUTES * 60 * 1000).toISOString();
    const recentThreshold = new Date(now.getTime() - RECENT_HOURS * 60 * 60 * 1000).toISOString();

    // ── 3. Queries en paralelo ─────────────────────────────────────────────────
    const [allPending, stuckEvents, recentEvents] = await Promise.all([

      // 3a. Total de eventos pendientes (processed=false)
      base44.asServiceRole.entities.OTEvent.filter(
        { processed: false },
        50
      ),

      // 3b. Eventos atascados: processed=false y created_at viejo
      base44.asServiceRole.entities.OTEvent.filter(
        { processed: false, created_at: { $lt: stuckThreshold } },
        20
      ),

      // 3c. Volumen reciente: todos los eventos en la ventana definida
      base44.asServiceRole.entities.OTEvent.filter(
        { created_at: { $gte: recentThreshold } },
        200
      ),
    ]);

    // ── 4. Calcular breakdown de tipos en pendientes ──────────────────────────
    const pendingByType = {};
    for (const ev of allPending) {
      pendingByType[ev.tipo] = (pendingByType[ev.tipo] || 0) + 1;
    }

    // ── 5. Calcular breakdown de tipos en volumen reciente ────────────────────
    const recentByType = {};
    for (const ev of recentEvents) {
      recentByType[ev.tipo] = (recentByType[ev.tipo] || 0) + 1;
    }

    // ── 6. Construir respuesta ─────────────────────────────────────────────────
    const health = {
      generated_at: now.toISOString(),
      thresholds: {
        stuck_after_minutes: STUCK_THRESHOLD_MINUTES,
        recent_window_hours: RECENT_HOURS,
      },
      pending: {
        total: allPending.length,
        by_type: pendingByType,
        note: allPending.length >= 50 ? 'Resultado limitado a 50 — puede haber más pendientes' : null,
      },
      stuck: {
        total: stuckEvents.length,
        events: stuckEvents.map(ev => ({
          id: ev.id,
          tipo: ev.tipo,
          orden_trabajo_id: ev.orden_trabajo_id || null,
          organization_id: ev.organization_id || null,
          created_at: ev.created_at,
          age_minutes: Math.round((now - new Date(ev.created_at)) / 60000),
        })),
      },
      recent_volume: {
        window_hours: RECENT_HOURS,
        total: recentEvents.length,
        by_type: recentByType,
        note: recentEvents.length >= 200 ? 'Resultado limitado a 200 — puede haber más eventos recientes' : null,
      },
      status: stuckEvents.length > 0 ? 'WARNING' : 'OK',
    };

    return Response.json(health);

  } catch (error) {
    console.error(`[getOTEventHealth] Error no controlado: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});