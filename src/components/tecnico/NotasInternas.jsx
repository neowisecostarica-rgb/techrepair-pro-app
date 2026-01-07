import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Send, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { withOrgId } from '@/components/hooks/useOrgData';

export default function NotasInternas({ ordenTrabajoId, user, userAccount }) {
  const [contenido, setContenido] = useState('');
  const [tipoNota, setTipoNota] = useState('general');
  const queryClient = useQueryClient();

  const { data: notas = [] } = useQuery({
    queryKey: ['notas-internas', ordenTrabajoId],
    queryFn: () => base44.entities.NotaInterna.filter({ orden_trabajo_id: ordenTrabajoId }),
    enabled: !!ordenTrabajoId,
  });

  const createNotaMutation = useMutation({
    mutationFn: (data) => base44.entities.NotaInterna.create(withOrgId(data, userAccount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notas-internas'] });
      setContenido('');
      setTipoNota('general');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!contenido.trim()) return;

    const menciones = [];
    if (contenido.includes('@inventario')) menciones.push('inventario');
    if (contenido.includes('@ventas')) menciones.push('ventas');
    if (contenido.includes('@jefe')) menciones.push('jefe');
    if (contenido.includes('@admin')) menciones.push('admin');

    createNotaMutation.mutate({
      orden_trabajo_id: ordenTrabajoId,
      autor_id: user.id,
      autor_nombre: user.full_name || user.email,
      contenido: contenido,
      menciones: menciones,
      tipo: tipoNota,
    });
  };

  const tipoConfig = {
    general: { color: 'bg-slate-100 text-slate-700', label: 'General' },
    urgente: { color: 'bg-red-100 text-red-700', label: 'Urgente' },
    informativa: { color: 'bg-blue-100 text-blue-700', label: 'Informativa' },
  };

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          Notas Internas
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTipoNota('general')}
              className={`px-3 py-1 text-xs rounded ${
                tipoNota === 'general' ? 'bg-slate-200' : 'bg-slate-100'
              }`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => setTipoNota('urgente')}
              className={`px-3 py-1 text-xs rounded ${
                tipoNota === 'urgente' ? 'bg-red-200' : 'bg-red-100'
              }`}
            >
              Urgente
            </button>
            <button
              type="button"
              onClick={() => setTipoNota('informativa')}
              className={`px-3 py-1 text-xs rounded ${
                tipoNota === 'informativa' ? 'bg-blue-200' : 'bg-blue-100'
              }`}
            >
              Informativa
            </button>
          </div>
          <Textarea
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            placeholder="Escribe una nota... (usa @inventario, @ventas, @jefe para mencionar)"
            rows={3}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              💡 Menciona con @ para notificar a otros equipos
            </p>
            <Button type="submit" size="sm" disabled={!contenido.trim() || createNotaMutation.isPending}>
              <Send className="w-4 h-4 mr-2" />
              Enviar
            </Button>
          </div>
        </form>

        {/* Listado de notas */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {notas.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-3" />
              <p>No hay notas registradas</p>
            </div>
          ) : (
            notas.map((nota) => {
              const config = tipoConfig[nota.tipo];
              const esAutor = nota.autor_id === user.id;

              return (
                <div
                  key={nota.id}
                  className={`p-4 rounded-lg ${
                    esAutor ? 'bg-emerald-50 border-l-4 border-emerald-500' : 'bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm text-slate-900">{nota.autor_nombre}</p>
                      <Badge className={`${config.color} border-0 text-xs`}>
                        {config.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400">
                      {formatDistanceToNow(new Date(nota.created_date), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                  <p className="text-sm text-slate-700">{nota.contenido}</p>
                  {nota.menciones && nota.menciones.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {nota.menciones.map((mencion, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          @{mencion}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}