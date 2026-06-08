import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Wrench, ShoppingCart, FileText, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const estadoOTConfig = {
  EN_COLA_REVISION: { color: 'bg-slate-100 text-slate-600', label: 'En Cola' },
  ASIGNADA:         { color: 'bg-blue-100 text-blue-700',   label: 'Asignada' },
  EN_REVISION:      { color: 'bg-purple-100 text-purple-700', label: 'En Revisión' },
  DIAGNOSTICADA:    { color: 'bg-yellow-100 text-yellow-700', label: 'Diagnosticada' },
  COTIZADA:         { color: 'bg-orange-100 text-orange-700', label: 'Cotizada' },
  APROBADA:         { color: 'bg-teal-100 text-teal-700',   label: 'Aprobada' },
  EN_REPARACION:    { color: 'bg-indigo-100 text-indigo-700', label: 'En Reparación' },
  PRUEBAS:          { color: 'bg-cyan-100 text-cyan-700',   label: 'Pruebas' },
  FINALIZADA:       { color: 'bg-emerald-100 text-emerald-700', label: 'Finalizada' },
  ENTREGADA:        { color: 'bg-green-100 text-green-700', label: 'Entregada' },
  CANCELADA:        { color: 'bg-red-100 text-red-600',     label: 'Cancelada' },
};

const estadoVentaConfig = {
  pagada:   'bg-emerald-100 text-emerald-700',
  borrador: 'bg-slate-100 text-slate-600',
  anulada:  'bg-red-100 text-red-600',
};

const estadoCotConfig = {
  enviada:  'bg-blue-100 text-blue-700',
  aprobada: 'bg-emerald-100 text-emerald-700',
  rechazada:'bg-red-100 text-red-600',
  borrador: 'bg-slate-100 text-slate-600',
};

// ── Sección compacta reutilizable ─────────────────────────────────────────────
function SeccionCompacta({ icon: Icon, iconColor, titulo, count, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
      {/* Header compacto */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{titulo}</span>
        <span className="ml-auto text-xs text-slate-400 tabular-nums">{count}</span>
      </div>

      {/* Filas */}
      <div className="divide-y divide-slate-50">
        {children}
      </div>
    </div>
  );
}

// ── Fila compacta genérica ────────────────────────────────────────────────────
function FilaCompacta({ left, badge, badgeClass, fecha, sub }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50/70 transition-colors group">
      {/* Concepto principal */}
      <span className="flex-1 text-xs text-slate-800 font-medium truncate leading-tight" title={left}>
        {left}
      </span>

      {/* Sub (p.ej. método pago) */}
      {sub && (
        <span className="text-xs text-slate-400 hidden sm:block shrink-0">{sub}</span>
      )}

      {/* Badge estado */}
      {badge && (
        <Badge className={`${badgeClass} border-0 text-[10px] px-1.5 py-0 leading-tight shrink-0`}>
          {badge}
        </Badge>
      )}

      {/* Fecha */}
      <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">{fecha}</span>
    </div>
  );
}

function FilaVacia({ texto }) {
  return (
    <div className="px-4 py-3 text-xs text-slate-400 italic">{texto}</div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function SeguimientoCliente({ clienteId }) {
  const { data: ordenes = [] } = useQuery({
    queryKey: ['ordenes-cliente', clienteId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({ cliente_id: clienteId }),
    enabled: !!clienteId,
  });

  const { data: ventas = [] } = useQuery({
    queryKey: ['ventas-cliente', clienteId],
    queryFn: () => base44.entities.Venta.filter({ cliente_id: clienteId }),
    enabled: !!clienteId,
  });

  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['cotizaciones-cliente', clienteId],
    queryFn: () => base44.entities.Cotizacion.filter({ cliente_id: clienteId }),
    enabled: !!clienteId,
  });

  const { data: mensajes = [] } = useQuery({
    queryKey: ['mensajes-cliente-hist', clienteId],
    queryFn: () => base44.entities.MensajeCliente.filter({ cliente_id: clienteId }),
    enabled: !!clienteId,
  });

  const fmt = (d) => {
    try { return format(new Date(d), 'dd/MM/yy', { locale: es }); }
    catch { return '—'; }
  };

  return (
    <div className="grid grid-cols-2 gap-3">

      {/* ── Órdenes de Trabajo ───────────────────────────────────────── */}
      <SeccionCompacta icon={Wrench} iconColor="text-emerald-600" titulo="Órdenes de Trabajo" count={ordenes.length}>
        {ordenes.length === 0
          ? <FilaVacia texto="Sin órdenes registradas" />
          : ordenes.slice(0, 6).map((o) => {
              const cfg = estadoOTConfig[o.estado] || estadoOTConfig.EN_COLA_REVISION;
              return (
                <FilaCompacta
                  key={o.id}
                  left={o.codigo_ot || o.motivo_ingreso || '—'}
                  badge={cfg.label}
                  badgeClass={cfg.color}
                  fecha={fmt(o.created_date)}
                  sub={o.codigo_ot ? o.motivo_ingreso?.slice(0, 20) : undefined}
                />
              );
            })
        }
      </SeccionCompacta>

      {/* ── Ventas ───────────────────────────────────────────────────── */}
      <SeccionCompacta icon={ShoppingCart} iconColor="text-blue-600" titulo="Ventas" count={ventas.length}>
        {ventas.length === 0
          ? <FilaVacia texto="Sin ventas registradas" />
          : ventas.slice(0, 6).map((v) => (
              <FilaCompacta
                key={v.id}
                left={`₡${v.total?.toLocaleString() ?? '0'}`}
                badge={v.estado}
                badgeClass={estadoVentaConfig[v.estado] || 'bg-slate-100 text-slate-600'}
                sub={v.metodo_pago}
                fecha={fmt(v.created_date)}
              />
            ))
        }
      </SeccionCompacta>

      {/* ── Cotizaciones ─────────────────────────────────────────────── */}
      <SeccionCompacta icon={FileText} iconColor="text-purple-600" titulo="Cotizaciones" count={cotizaciones.length}>
        {cotizaciones.length === 0
          ? <FilaVacia texto="Sin cotizaciones registradas" />
          : cotizaciones.slice(0, 6).map((c) => (
              <FilaCompacta
                key={c.id}
                left={`₡${c.total?.toLocaleString() ?? '0'}`}
                badge={c.estado}
                badgeClass={estadoCotConfig[c.estado] || 'bg-slate-100 text-slate-600'}
                sub={c.numero_cotizacion}
                fecha={fmt(c.created_date)}
              />
            ))
        }
      </SeccionCompacta>

      {/* ── Mensajes ─────────────────────────────────────────────────── */}
      <SeccionCompacta icon={MessageSquare} iconColor="text-orange-500" titulo="Mensajes" count={mensajes.length}>
        {mensajes.length === 0
          ? <FilaVacia texto="Sin mensajes registrados" />
          : mensajes.slice(0, 6).map((m) => (
              <FilaCompacta
                key={m.id}
                left={m.asunto || m.contenido?.slice(0, 50) || '—'}
                badge={m.tipo}
                badgeClass="bg-orange-50 text-orange-600"
                fecha={fmt(m.created_date)}
              />
            ))
        }
      </SeccionCompacta>

    </div>
  );
}