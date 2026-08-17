import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getIdentityOrganization, listIdentityAccounts } from '@/api/identity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ChevronDown, 
  ChevronUp, 
  Wrench, 
  User, 
  Laptop, 
  FileSearch, 
  FileText,
  Shield,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { generarResumenTrabajo } from './utils/generarResumenTrabajo';

export default function PanelContextoVenta({ ordenTrabajo, effectiveOrgId }) {
  const [collapsed, setCollapsed] = useState(false);

  const { data: cliente } = useQuery({
    queryKey: ['cliente-contexto', ordenTrabajo?.cliente_id],
    queryFn: async () => {
      const clientes = await base44.entities.Cliente.list();
      return clientes.find(c => c.id === ordenTrabajo.cliente_id);
    },
    enabled: !!ordenTrabajo?.cliente_id,
  });

  const { data: equipo } = useQuery({
    queryKey: ['equipo-contexto', ordenTrabajo?.equipo_id],
    queryFn: async () => {
      const equipos = await base44.entities.Equipo.list();
      return equipos.find(e => e.id === ordenTrabajo.equipo_id);
    },
    enabled: !!ordenTrabajo?.equipo_id,
  });

  const { data: diagnostico } = useQuery({
    queryKey: ['diagnostico-contexto', ordenTrabajo?.id, effectiveOrgId],
    queryFn: async () => {
      const diags = await base44.entities.DiagnosticoTecnico.filter({
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id
      });
      return diags[0];
    },
    enabled: !!ordenTrabajo?.id && !!effectiveOrgId,
  });

  const { data: cotizacion } = useQuery({
    queryKey: ['cotizacion-contexto', ordenTrabajo?.id, effectiveOrgId],
    queryFn: async () => {
      const cots = await base44.entities.Cotizacion.filter({
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id
      });
      // Buscar aprobada primero, sino la más reciente
      const aprobada = cots.find(c => c.estado === 'aprobada');
      return aprobada || cots[0];
    },
    enabled: !!ordenTrabajo?.id && !!effectiveOrgId,
  });

  const { data: tecnico } = useQuery({
    queryKey: ['tecnico-contexto', ordenTrabajo?.tecnico_asignado_id],
    queryFn: async () => {
      if (!ordenTrabajo.tecnico_asignado_id) return null;
      const { accounts } = await listIdentityAccounts(effectiveOrgId);
      return accounts.find(account => account.user_id === ordenTrabajo.tecnico_asignado_id);
    },
    enabled: !!ordenTrabajo?.tecnico_asignado_id,
  });

  const { data: branch } = useQuery({
    queryKey: ['branch-contexto', ordenTrabajo?.branch_id],
    queryFn: async () => {
      const branches = await base44.entities.Branch.list();
      return branches.find(b => b.id === ordenTrabajo.branch_id);
    },
    enabled: !!ordenTrabajo?.branch_id,
  });

  const { data: organization } = useQuery({
    queryKey: ['org-contexto-garantia', effectiveOrgId],
    queryFn: async () => {
      const result = await getIdentityOrganization(effectiveOrgId);
      return result.organization;
    },
    enabled: !!effectiveOrgId,
  });

  if (!ordenTrabajo) return null;

  const resumenTrabajo = diagnostico && cotizacion 
    ? generarResumenTrabajo(diagnostico, cotizacion)
    : null;

  const estadoCotConfig = {
    aprobada: { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
    enviada: { color: 'bg-blue-100 text-blue-700', icon: FileText },
    rechazada: { color: 'bg-red-100 text-red-700', icon: XCircle },
    borrador: { color: 'bg-slate-100 text-slate-700', icon: FileText }
  };

  const cotConfig = cotizacion ? estadoCotConfig[cotizacion.estado] : null;
  const CotIcon = cotConfig?.icon;

  return (
    <Card className="border-2 border-blue-200 bg-blue-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-900">
            📋 Contexto de la Orden de Trabajo
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="space-y-4">
          {/* OT */}
          <div className="p-4 bg-white rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="w-5 h-5 text-emerald-600" />
              <h3 className="font-semibold text-slate-900">Orden de Trabajo</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-slate-500">Código</p>
                <p className="font-medium">{ordenTrabajo.codigo_ot}</p>
              </div>
              <div>
                <p className="text-slate-500">Estado</p>
                <Badge variant="outline">{ordenTrabajo.estado}</Badge>
              </div>
              <div>
                <p className="text-slate-500">Ingreso</p>
                <p className="font-medium">
                  {format(new Date(ordenTrabajo.created_date), 'dd MMM yyyy', { locale: es })}
                </p>
              </div>
              {tecnico && (
                <div>
                  <p className="text-slate-500">Técnico</p>
                  <p className="font-medium">{tecnico.user_email}</p>
                </div>
              )}
              {branch && (
                <div>
                  <p className="text-slate-500">Sucursal</p>
                  <p className="font-medium">{branch.name}</p>
                </div>
              )}
            </div>
          </div>

          {/* Cliente */}
          {cliente && (
            <div className="p-4 bg-white rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-slate-900">Cliente</h3>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">{cliente.nombre_completo}</p>
                <p className="text-slate-600">📱 {cliente.telefono}</p>
                {cliente.email && <p className="text-slate-600">📧 {cliente.email}</p>}
              </div>
            </div>
          )}

          {/* Equipo */}
          {equipo && (
            <div className="p-4 bg-white rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <Laptop className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-slate-900">Equipo</h3>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">{equipo.marca} {equipo.modelo}</p>
                {equipo.serie && <p className="text-slate-600">Serie: {equipo.serie}</p>}
                {equipo.accesorios && equipo.accesorios.length > 0 && (
                  <p className="text-slate-600">Accesorios: {equipo.accesorios.join(', ')}</p>
                )}
              </div>
            </div>
          )}

          {/* Diagnóstico */}
          {diagnostico && (
            <div className="p-4 bg-white rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <FileSearch className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-slate-900">Diagnóstico Técnico</h3>
              </div>
              <div className="space-y-2 text-sm">
                {resumenTrabajo && (
                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <pre className="whitespace-pre-wrap text-xs font-sans text-slate-700">
                      {resumenTrabajo}
                    </pre>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2">
                  <p className="text-slate-500">
                    {format(new Date(diagnostico.created_date), "dd MMM yyyy", { locale: es })}
                  </p>
                  <Badge variant="outline" className="text-xs">
                    {diagnostico.estado === 'listo_aprobacion' ? 'Completado' : 'Borrador'}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* Cotización */}
          {cotizacion && (
            <div className="p-4 bg-white rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-5 h-5 text-orange-600" />
                <h3 className="font-semibold text-slate-900">Cotización</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Estado:</span>
                  <Badge className={cotConfig?.color}>
                    {CotIcon && <CotIcon className="w-3 h-3 mr-1" />}
                    {cotizacion.estado.toUpperCase()}
                  </Badge>
                </div>
                {cotizacion.estado === 'aprobada' && cotizacion.aprobada_at && (
                  <p className="text-slate-500">
                    Aprobada: {format(new Date(cotizacion.aprobada_at), "dd MMM yyyy", { locale: es })}
                  </p>
                )}
                <div className="flex items-center justify-between font-semibold pt-2 border-t">
                  <span>Total:</span>
                  <span className="text-emerald-600">₡{cotizacion.total?.toLocaleString() || '0'}</span>
                </div>
                {cotizacion.items && cotizacion.items.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-slate-500 mb-2">Ítems ({cotizacion.items.length}):</p>
                    <div className="space-y-1">
                      {cotizacion.items.slice(0, 3).map((item, idx) => (
                        <p key={idx} className="text-xs text-slate-600">
                          • {item.descripcion} (₡{item.subtotal?.toLocaleString() || '0'})
                        </p>
                      ))}
                      {cotizacion.items.length > 3 && (
                        <p className="text-xs text-slate-500 italic">
                          +{cotizacion.items.length - 3} ítems más
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Garantía Preview */}
          {organization?.garantia_config && (
            <div className="p-4 bg-indigo-50 rounded-lg border-2 border-indigo-200">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-indigo-900">Garantía a Emitir</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Tipo:</span>
                  <Badge variant="outline" className="border-indigo-300">Reparación</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Vigencia:</span>
                  <span className="font-medium text-slate-900">
                    {organization.garantia_config.meses_vigencia_reparaciones || 3} meses
                  </span>
                </div>
                <p className="text-xs text-slate-600 pt-2 border-t border-indigo-200">
                  Se emitirá automáticamente al completar la venta
                </p>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
