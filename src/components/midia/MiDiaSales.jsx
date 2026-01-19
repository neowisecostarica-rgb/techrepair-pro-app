import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp,
  DollarSign,
  Calendar,
  Phone,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import MensajesMotivacion from '@/components/tecnico/MensajesMotivacion';
import { createPageUrl } from '../../utils';
import { Link } from 'react-router-dom';

export default function MiDiaSales({ user, effectiveOrgId }) {
  const { data: leads = [] } = useQuery({
    queryKey: ['leads', effectiveOrgId],
    queryFn: async () => {
      const leads = await base44.entities.Lead.filter(
        { organization_id: effectiveOrgId },
        '-created_date',
        50
      );
      return leads;
    },
    enabled: !!effectiveOrgId,
    staleTime: 30000,
  });

  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['cotizaciones', effectiveOrgId],
    queryFn: async () => {
      const cots = await base44.entities.Cotizacion.filter(
        { organization_id: effectiveOrgId },
        '-created_date',
        50
      );
      return cots;
    },
    enabled: !!effectiveOrgId,
    staleTime: 30000,
  });

  const { data: ventas = [] } = useQuery({
    queryKey: ['ventas', effectiveOrgId],
    queryFn: async () => {
      const ventas = await base44.entities.Venta.filter(
        { organization_id: effectiveOrgId },
        '-created_date',
        50
      );
      return ventas;
    },
    enabled: !!effectiveOrgId,
    staleTime: 30000,
  });

  const { data: citas = [] } = useQuery({
    queryKey: ['citas-hoy', effectiveOrgId],
    queryFn: async () => {
      const hoy = new Date().toISOString().split('T')[0];
      const citas = await base44.entities.Cita.filter(
        { 
          organization_id: effectiveOrgId,
          fecha: hoy
        },
        'hora_inicio',
        50
      );
      return citas;
    },
    enabled: !!effectiveOrgId,
    staleTime: 60000,
  });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const ventasHoy = ventas.filter(v => {
    const fechaVenta = new Date(v.created_date);
    fechaVenta.setHours(0, 0, 0, 0);
    return fechaVenta.getTime() === hoy.getTime();
  });

  const ventasPropias = ventasHoy.filter(v => v.created_by === user?.email);
  const citasPropias = citas.filter(c => c.tecnico_asignado_id === user?.id);

  const leadsSeguimiento = leads.filter(l => 
    l.assigned_to === user?.id && 
    ['new', 'contacted', 'qualified'].includes(l.status)
  );

  const cotizacionesPendientesSales = cotizaciones
    .filter(c => c.estado === 'enviada' && c.vendedor_id === user?.id)
    .sort((a, b) => new Date(a.valida_hasta) - new Date(b.valida_hasta));

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-900">Mi Día</h1>
            <p className="text-slate-600">Seguimiento y cierres</p>
          </div>
        </div>
      </div>

      <MensajesMotivacion tipo="diaria" role="SALES" />

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-blue-200">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
            <Phone className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Seguimientos CRM</h2>
        </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-slate-800">
            Leads Pendientes de Contacto
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leadsSeguimiento.length > 0 ? (
            <div className="space-y-2">
              {leadsSeguimiento.slice(0, 5).map(lead => (
                <Link key={lead.id} to={createPageUrl('CRM')}>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                    <div>
                      <p className="font-medium text-slate-900">{lead.name}</p>
                      <p className="text-sm text-slate-500">{lead.phone}</p>
                    </div>
                    <Badge>{lead.status}</Badge>
                  </div>
                </Link>
              ))}
              <Link to={createPageUrl('CRM')}>
                <Button variant="outline" className="w-full mt-2">
                  Abrir CRM
                </Button>
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No hay leads pendientes de seguimiento</p>
          )}
        </CardContent>
      </Card>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-orange-200">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Cotizaciones Pendientes</h2>
        </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-slate-800">
            Propuestas en Espera de Respuesta
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cotizacionesPendientesSales.length > 0 ? (
            <div className="space-y-2">
              {cotizacionesPendientesSales.slice(0, 5).map(cot => (
                <Link key={cot.id} to={createPageUrl('OrdenesTrabajo')}>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                    <div>
                      <p className="font-medium text-slate-900">
                        ${cot.total?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-sm text-slate-500">
                        Vence: {cot.valida_hasta ? format(new Date(cot.valida_hasta), 'dd/MM/yyyy') : 'N/A'}
                      </p>
                    </div>
                    <Button size="sm" variant="outline">Dar Seguimiento</Button>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No hay cotizaciones pendientes</p>
          )}
        </CardContent>
      </Card>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-emerald-200">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-500 rounded-lg flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Mis Ventas del Día</h2>
        </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-slate-800">
            Registro de Ventas Personales
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ventasPropias.length > 0 ? (
            <div className="space-y-2">
              {ventasPropias.map(venta => (
                <div key={venta.id} className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">
                      ${venta.total?.toFixed(2) || '0.00'}
                    </p>
                    <p className="text-sm text-slate-500">
                      {format(new Date(venta.created_date), 'HH:mm')}
                    </p>
                  </div>
                  <Badge variant={venta.estado_pago === 'pagada' ? 'default' : 'outline'}>
                    {venta.estado_pago}
                  </Badge>
                </div>
              ))}
              <Link to={createPageUrl('PuntoVenta')}>
                <Button variant="outline" className="w-full mt-2">
                  Ir a Punto de Venta
                </Button>
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No hay ventas registradas hoy</p>
          )}
        </CardContent>
      </Card>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-purple-200">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Mi Agenda Hoy</h2>
        </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-slate-800">
            Reuniones y Visitas Programadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {citasPropias.length > 0 ? (
            <div className="space-y-2">
              {citasPropias.map(cita => (
                <div key={cita.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">{cita.motivo || cita.tipo}</p>
                    <p className="text-sm text-slate-500">
                      {cita.hora_inicio} - {cita.hora_fin}
                    </p>
                  </div>
                  <Badge>{cita.estado}</Badge>
                </div>
              ))}
              <Link to={createPageUrl('Agenda')}>
                <Button variant="outline" className="w-full mt-2">
                  Ver Agenda Completa
                </Button>
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No hay citas programadas hoy</p>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}