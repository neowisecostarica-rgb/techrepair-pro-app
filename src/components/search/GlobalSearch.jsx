/**
 * GlobalSearch — Command palette (MB8: Búsqueda global y navegación)
 * Trigger: Cmd/Ctrl+K or search button in sidebar.
 * Searches across pages, work orders, clients, equipment, and inventory.
 * MB7-compliant: org-scoped, limited results, sorted by -created_date.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { useI18n } from '@/i18n';
import { createPageUrl } from '@/utils';
import { MENU_ITEMS } from '@/config/menuConfig';
import { isMenuItemEligible } from '@/components/layout/SidebarMenu';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Search, Hash, Wrench, Users, Laptop, Package, CornerDownLeft } from 'lucide-react';

const SEARCH_LIMIT = 8;
const DEBOUNCE_MS = 300;

function normalize(str) {
  return (str || '').toLowerCase().trim();
}

function matches(haystack, needle) {
  return normalize(haystack).includes(needle);
}

export default function GlobalSearch({ open, onOpenChange }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { effectiveOrgId, effectiveRole, capabilities } = useAuthContext();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const flatResultsRef = useRef([]);

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setDebouncedQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const needle = normalize(debouncedQuery);

  // ── Page navigation results (from MENU_ITEMS) ──
  const pageResults = useMemo(() => {
    if (!effectiveRole) return [];
    const eligible = MENU_ITEMS.filter(item =>
      isMenuItemEligible(item, { effectiveRole, capabilities })
    );
    if (!needle) return [];
    return eligible
      .filter(item => matches(t(item.i18nKey, item.label), needle) || matches(item.path, needle))
      .slice(0, 5)
      .map(item => ({
        type: 'page',
        id: `page-${item.path}-${item.label}`,
        label: t(item.i18nKey, item.label),
        subtitle: 'Página',
        icon: item.icon,
        action: () => {
          navigate(`${createPageUrl(item.path)}${item.hash ? `#${item.hash}` : ''}`);
          onOpenChange(false);
        },
      }));
  }, [effectiveRole, capabilities, needle, t, navigate, onOpenChange]);

  // ── Work orders ──
  const { data: otResults = [] } = useQuery({
    queryKey: ['global-search-ot', effectiveOrgId, needle],
    queryFn: async () => {
      if (!effectiveOrgId || !needle) return [];
      const all = await base44.entities.OrdenTrabajo.filter(
        { organization_id: effectiveOrgId },
        '-created_date',
        100
      );
      return all
        .filter(ot =>
          matches(ot.codigo_ot, needle) ||
          matches(ot.motivo_ingreso, needle) ||
          matches(ot.serie_ingreso, needle)
        )
        .slice(0, SEARCH_LIMIT)
        .map(ot => ({
          type: 'ot',
          id: ot.id,
          label: ot.codigo_ot,
          subtitle: ot.motivo_ingreso || 'Orden de Trabajo',
          icon: Wrench,
          action: () => {
            navigate(`/expediente/${ot.id}`);
            onOpenChange(false);
          },
        }));
    },
    enabled: !!effectiveOrgId && !!needle && open,
    staleTime: 15000,
  });

  // ── Clients ──
  const { data: clienteResults = [] } = useQuery({
    queryKey: ['global-search-cliente', effectiveOrgId, needle],
    queryFn: async () => {
      if (!effectiveOrgId || !needle) return [];
      const all = await base44.entities.Cliente.filter(
        { organization_id: effectiveOrgId },
        '-created_date',
        100
      );
      return all
        .filter(c =>
          matches(c.nombre_completo, needle) ||
          matches(c.identificacion, needle) ||
          matches(c.telefono, needle) ||
          matches(c.email, needle)
        )
        .slice(0, SEARCH_LIMIT)
        .map(c => ({
          type: 'client',
          id: c.id,
          label: c.nombre_completo,
          subtitle: `${c.identificacion || ''} · ${c.telefono || ''}`.trim(' ·'),
          icon: Users,
          action: () => {
            navigate(`${createPageUrl('Clientes')}?cliente_id=${c.id}`);
            onOpenChange(false);
          },
        }));
    },
    enabled: !!effectiveOrgId && !!needle && open,
    staleTime: 15000,
  });

  // ── Equipment ──
  const { data: equipoResults = [] } = useQuery({
    queryKey: ['global-search-equipo', effectiveOrgId, needle],
    queryFn: async () => {
      if (!effectiveOrgId || !needle) return [];
      const all = await base44.entities.Equipo.filter(
        { organization_id: effectiveOrgId },
        '-created_date',
        100
      );
      return all
        .filter(e =>
          matches(e.marca, needle) ||
          matches(e.modelo, needle) ||
          matches(e.serie, needle) ||
          matches(e.tipo, needle)
        )
        .slice(0, SEARCH_LIMIT)
        .map(e => ({
          type: 'equipment',
          id: e.id,
          label: `${e.marca || ''} ${e.modelo || ''}`.trim() || 'Equipo',
          subtitle: e.serie ? `Serie: ${e.serie}` : 'Equipo',
          icon: Laptop,
          action: () => {
            navigate(`/activo/${e.id}`);
            onOpenChange(false);
          },
        }));
    },
    enabled: !!effectiveOrgId && !!needle && open,
    staleTime: 15000,
  });

  // ── Inventory ──
  const { data: inventarioResults = [] } = useQuery({
    queryKey: ['global-search-inventario', effectiveOrgId, needle],
    queryFn: async () => {
      if (!effectiveOrgId || !needle) return [];
      const all = await base44.entities.Inventario.filter(
        { organization_id: effectiveOrgId },
        '-created_date',
        100
      );
      return all
        .filter(i =>
          matches(i.nombre, needle) ||
          matches(i.codigo_interno, needle) ||
          matches(i.codigo_barras, needle) ||
          matches(i.sku, needle) ||
          matches(i.marca, needle) ||
          matches(i.modelo, needle)
        )
        .slice(0, SEARCH_LIMIT)
        .map(i => ({
          type: 'inventory',
          id: i.id,
          label: i.nombre,
          subtitle: i.codigo_interno ? `Código: ${i.codigo_interno}` : 'Inventario',
          icon: Package,
          action: () => {
            navigate(`${createPageUrl('Inventario')}?item_id=${i.id}`);
            onOpenChange(false);
          },
        }));
    },
    enabled: !!effectiveOrgId && !!needle && open,
    staleTime: 15000,
  });

  // ── Grouped results ──
  const grouped = useMemo(() => {
    const groups = [];
    if (pageResults.length) groups.push({ title: 'Páginas', items: pageResults });
    if (otResults.length) groups.push({ title: 'Órdenes de Trabajo', items: otResults });
    if (clienteResults.length) groups.push({ title: 'Clientes', items: clienteResults });
    if (equipoResults.length) groups.push({ title: 'Equipos', items: equipoResults });
    if (inventarioResults.length) groups.push({ title: 'Inventario', items: inventarioResults });
    return groups;
  }, [pageResults, otResults, clienteResults, equipoResults, inventarioResults]);

  // Flat list for keyboard nav
  const flatResults = useMemo(() => grouped.flatMap(g => g.items), [grouped]);
  flatResultsRef.current = flatResults;

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => Math.min(prev + 1, flatResultsRef.current.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatResultsRef.current[activeIndex];
      if (item) item.action();
    }
  };

  const isEmpty = needle && flatResults.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-2xl overflow-hidden rounded-2xl">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-200">
          <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar órdenes, clientes, equipos, inventario o páginas..."
            className="flex-1 bg-transparent text-slate-900 placeholder-slate-400 outline-none text-base"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!needle && (
            <div className="px-4 py-10 text-center text-slate-400">
              <Search className="w-10 h-10 mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-medium">Escribe para buscar en toda la plataforma</p>
              <p className="text-xs mt-1 text-slate-400">Órdenes · Clientes · Equipos · Inventario · Páginas</p>
            </div>
          )}

          {isEmpty && (
            <div className="px-4 py-10 text-center text-slate-400">
              <p className="text-sm">Sin resultados para "{debouncedQuery}"</p>
            </div>
          )}

          {grouped.map((group, gi) => {
            let runningIndex = 0;
            for (let i = 0; i < gi; i++) runningIndex += grouped[i].items.length;
            return (
              <div key={group.title} className="py-2">
                <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {group.title}
                </p>
                {group.items.map((item, ii) => {
                  const flatIdx = runningIndex + ii;
                  const isActive = flatIdx === activeIndex;
                  const Icon = item.icon;
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      onMouseEnter={() => setActiveIndex(flatIdx)}
                      onClick={item.action}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isActive ? 'bg-teal-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isActive ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{item.label}</p>
                        {item.subtitle && (
                          <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>
                        )}
                      </div>
                      {isActive && (
                        <CornerDownLeft className="w-4 h-4 text-teal-600 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        {needle && flatResults.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-slate-300 px-1 py-0.5 text-[10px]">↑</kbd>
                <kbd className="rounded border border-slate-300 px-1 py-0.5 text-[10px]">↓</kbd>
                navegar
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-slate-300 px-1 py-0.5 text-[10px]">↵</kbd>
                seleccionar
              </span>
            </div>
            <span>{flatResults.length} resultado{flatResults.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}