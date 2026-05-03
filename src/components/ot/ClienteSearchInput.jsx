import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, X, User } from 'lucide-react';

/**
 * Input con autocomplete para buscar clientes.
 * Al no encontrar coincidencia, muestra botón "Crear cliente rápido".
 */
export default function ClienteSearchInput({
  clientes = [],
  selectedClienteId,
  onSelectCliente,
  onRequestCreate,
  disabled = false,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Sincronizar texto cuando ya hay un cliente seleccionado
  useEffect(() => {
    if (selectedClienteId) {
      const found = clientes.find(c => c.id === selectedClienteId);
      if (found) setQuery(`${found.nombre_completo} — ${found.telefono}`);
    } else {
      setQuery('');
    }
  }, [selectedClienteId, clientes]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.trim().length >= 1
    ? clientes.filter(c => {
        const q = query.toLowerCase();
        return (
          c.nombre_completo?.toLowerCase().includes(q) ||
          c.identificacion?.toLowerCase().includes(q) ||
          c.telefono?.toLowerCase().includes(q)
        );
      }).slice(0, 8)
    : [];

  const handleSelect = (cliente) => {
    onSelectCliente(cliente.id);
    setOpen(false);
  };

  const handleClear = () => {
    onSelectCliente('');
    setQuery('');
    setOpen(false);
  };

  const handleChange = (e) => {
    setQuery(e.target.value);
    onSelectCliente(''); // Limpiar selección al escribir
    setOpen(true);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={query}
            onChange={handleChange}
            onFocus={() => { if (query.trim()) setOpen(true); }}
            placeholder="Buscar por nombre, identificación o teléfono..."
            disabled={disabled}
            autoComplete="off"
          />
          {selectedClienteId && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onRequestCreate}
          disabled={disabled}
          className="shrink-0"
          title="Crear cliente rápido"
        >
          <Plus className="w-4 h-4 mr-1" />
          Nuevo
        </Button>
      </div>

      {open && query.trim().length >= 1 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map(c => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-4 py-3 hover:bg-emerald-50 flex items-center gap-3 border-b border-slate-100 last:border-0"
                onClick={() => handleSelect(c)}
              >
                <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900 text-sm">{c.nombre_completo}</p>
                  <p className="text-xs text-slate-500">{c.telefono} · {c.identificacion}</p>
                </div>
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-slate-500 flex items-center justify-between">
              <span>No se encontró "{query}"</span>
              <button
                type="button"
                onClick={() => { setOpen(false); onRequestCreate(); }}
                className="text-emerald-600 hover:text-emerald-700 font-medium text-xs flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Crear cliente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}