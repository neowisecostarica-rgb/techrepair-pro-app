import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Rocket, CheckCircle2, Circle, Settings, UserPlus, Users, FileText } from 'lucide-react';

export default function QuickStartCard({ 
  hasBasicInfo, 
  hasCollaborators, 
  hasClients, 
  hasOrders 
}) {
  const navigate = useNavigate();

  const steps = [
    {
      label: 'Configura tu negocio',
      description: 'Completa información básica como nombre legal, teléfono y país',
      completed: hasBasicInfo,
      icon: Settings,
      action: () => navigate(createPageUrl('Settings')),
      buttonText: 'Ir a Configuración',
    },
    {
      label: 'Agrega tu primer técnico o colaborador',
      description: 'Invita a tu equipo para empezar a colaborar',
      completed: hasCollaborators,
      icon: UserPlus,
      action: () => navigate(createPageUrl('Settings')),
      buttonText: 'Invitar Usuario',
    },
    {
      label: 'Registra tu primer cliente',
      description: 'Crea el perfil de tu primer cliente',
      completed: hasClients,
      icon: Users,
      action: () => navigate(createPageUrl('Clientes')),
      buttonText: 'Nuevo Cliente',
    },
    {
      label: 'Crea tu primera Orden de Trabajo',
      description: 'Comienza a gestionar servicios y reparaciones',
      completed: hasOrders,
      icon: FileText,
      action: () => navigate(createPageUrl('OrdenesTrabajo')),
      buttonText: 'Nueva OT',
    },
  ];

  const completedCount = steps.filter(s => s.completed).length;
  const totalSteps = steps.length;
  const progressPercent = (completedCount / totalSteps) * 100;

  return (
    <Card className="border-0 shadow-xl bg-gradient-to-br from-emerald-50 via-blue-50 to-purple-50 border-l-4 border-l-emerald-500">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center">
              <Rocket className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-slate-900">
                👋 Bienvenido a TechRepair Pro
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                Para empezar y aprovechar la plataforma, completa estos pasos básicos
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-emerald-600">{completedCount}/{totalSteps}</div>
            <p className="text-xs text-slate-500">completado</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Steps Checklist */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={index}
                className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                  step.completed
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-md'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                    step.completed ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}>
                    {step.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    ) : (
                      <Circle className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-4 h-4 ${step.completed ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <h4 className={`font-semibold text-sm ${
                        step.completed ? 'text-emerald-700 line-through' : 'text-slate-900'
                      }`}>
                        {step.label}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-600 mb-3">{step.description}</p>
                    {!step.completed && (
                      <Button
                        size="sm"
                        onClick={step.action}
                        className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 text-white text-xs"
                      >
                        {step.buttonText}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}