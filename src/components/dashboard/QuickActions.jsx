import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, FileText, Calendar, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';

export default function QuickActions() {
  const navigate = useNavigate();

  const actions = [
    { 
      label: 'Nueva OT', 
      icon: FileText, 
      color: 'from-emerald-500 to-teal-500',
      page: 'OrdenesTrabajo'
    },
    { 
      label: 'Nueva Venta', 
      icon: Plus, 
      color: 'from-blue-500 to-indigo-500',
      page: 'PuntoVenta'
    },
    { 
      label: 'Agendar Cita', 
      icon: Calendar, 
      color: 'from-purple-500 to-pink-500',
      page: 'Agenda'
    },
    { 
      label: 'Entrada Inventario', 
      icon: Package, 
      color: 'from-orange-500 to-red-500',
      page: 'Inventario'
    },
  ];

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="text-lg font-semibold">Acciones Rápidas</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-2 gap-4">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.label}
                onClick={() => navigate(createPageUrl(action.page))}
                className={`h-24 flex flex-col items-center justify-center gap-2 bg-gradient-to-br ${action.color} hover:shadow-lg transition-all duration-300 border-0`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-sm font-medium">{action.label}</span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}