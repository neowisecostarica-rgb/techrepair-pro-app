import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { key: 'welcome', label: 'Bienvenida' },
  { key: 'business', label: 'Datos del negocio' },
  { key: 'team', label: 'Equipo' },
  { key: 'first_ot', label: 'Primera recepción' },
];

export default function OnboardingStepper({ currentStep }) {
  const currentIndex = STEPS.findIndex(s => s.key === currentStep);

  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2">
      {STEPS.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <React.Fragment key={step.key}>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  isComplete && 'bg-teal-700 text-white',
                  isCurrent && 'bg-teal-700 text-white ring-4 ring-teal-100',
                  !isComplete && !isCurrent && 'bg-slate-100 text-slate-400',
                )}
              >
                {isComplete ? <Check className="h-4 w-4" /> : index + 1}
              </div>
              <span
                className={cn(
                  'hidden text-xs font-medium sm:inline',
                  isCurrent ? 'text-slate-900' : 'text-slate-400',
                )}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  'h-px w-6 sm:w-10',
                  index < currentIndex ? 'bg-teal-700' : 'bg-slate-200',
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}