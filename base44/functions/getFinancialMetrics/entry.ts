import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allowedRoles = ["ORG_ADMIN", "BRANCH_ADMIN"];
  if (!allowedRoles.includes(user.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  // Determinar período: por defecto mes actual
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const periodStart = body.period_start || defaultStart;
  const periodEnd = body.period_end || defaultEnd;

  const orgId = user.organization_id || user.impersonating_org_id;
  if (!orgId) {
    return Response.json({ error: 'No organization found for user' }, { status: 400 });
  }

  // 1. Obtener Organization para marketing_spend
  const orgs = await base44.asServiceRole.entities.Organization.filter({ id: orgId });
  const organization = orgs[0] || {};
  const marketingSpend = organization.marketing_spend || 0;

  // 2. Obtener ventas pagadas del período
  const ventas = await base44.asServiceRole.entities.Venta.filter({
    organization_id: orgId,
    estado: 'pagada'
  });

  const ventasEnPeriodo = ventas.filter(v => {
    const fecha = v.created_date || v.fecha_venta;
    return fecha >= periodStart && fecha <= periodEnd;
  });

  const totalSales = ventasEnPeriodo.length;
  const totalRevenue = ventasEnPeriodo.reduce((sum, v) => sum + (v.total || 0), 0);

  // 3. Calcular margen estimado usando VentaItem + Inventario
  let totalMargin = 0;

  if (totalSales > 0) {
    const ventaIds = ventasEnPeriodo.map(v => v.id);

    // Obtener todos los VentaItems de las ventas del período
    const todosLosItems = await base44.asServiceRole.entities.VentaItem.filter({
      organization_id: orgId
    });

    const itemsDelPeriodo = todosLosItems.filter(item => ventaIds.includes(item.venta_id));

    // Obtener IDs únicos de inventario referenciados
    const inventarioIds = [...new Set(
      itemsDelPeriodo
        .filter(item => item.referencia_id && item.tipo === 'producto')
        .map(item => item.referencia_id)
    )];

    // Obtener costos de inventario en una sola consulta
    let costosMap = {};
    if (inventarioIds.length > 0) {
      const inventarios = await base44.asServiceRole.entities.Inventario.filter({
        organization_id: orgId
      });
      inventarios.forEach(inv => {
        costosMap[inv.id] = inv.costo_unitario || 0;
      });
    }

    // Calcular margen por item
    for (const item of itemsDelPeriodo) {
      const precioUnitario = item.precio_unitario || 0;
      const cantidad = item.cantidad || 1;

      let costoUnitario = 0;
      if (item.tipo === 'producto') {
        // Fuente principal: snapshot histórico del costo al momento de la venta
        if (item.costo_unitario_snapshot != null && item.costo_unitario_snapshot !== '') {
          costoUnitario = item.costo_unitario_snapshot;
        } else if (item.referencia_id) {
          // Fallback: costo actual en inventario (solo si no hay snapshot)
          costoUnitario = costosMap[item.referencia_id] || 0;
        }
      }
      // Servicios: costo asumido en 0 (no tienen costo en inventario)

      const margenItem = (precioUnitario - costoUnitario) * cantidad;
      totalMargin += margenItem;
    }
  }

  const avgMargin = totalSales > 0 ? totalMargin / totalSales : 0;

  // 4. CPA = marketing_spend / total_sales
  const cpa = totalSales > 0 ? marketingSpend / totalSales : 0;

  // 5. CAC = marketing_spend / clientes nuevos en el período
  const clientes = await base44.asServiceRole.entities.Cliente.filter({
    organization_id: orgId
  });

  const clientesNuevos = clientes.filter(c => {
    const fecha = c.created_date;
    return fecha >= periodStart && fecha <= periodEnd;
  });

  const totalClientesNuevos = clientesNuevos.length;
  const cac = totalClientesNuevos > 0 ? marketingSpend / totalClientesNuevos : 0;

  return Response.json({
    total_sales: totalSales,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    avg_margin: Math.round(avgMargin * 100) / 100,
    cpa: Math.round(cpa * 100) / 100,
    cac: Math.round(cac * 100) / 100,
    period_start: periodStart,
    period_end: periodEnd,
    marketing_spend: marketingSpend,
    total_new_clients: totalClientesNuevos
  });
});