import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import OnboardingStepper from './OnboardingStepper';
import StepWelcome from './StepWelcome';
import StepBusinessDetails from './StepBusinessDetails';
import StepInviteTeam from './StepInviteTeam';
import StepFirstRecepcion from './StepFirstRecepcion';

const STEP_ORDER = ['welcome', 'business', 'team', 'first_ot'];

export default function GuidedOnboardingWizard({ organization, effectiveOrgId }) {
  const [step, setStep] = useState('welcome');

  const currentIndex = STEP_ORDER.indexOf(step);
  const goNext = () => {
    const next = STEP_ORDER[currentIndex + 1];
    if (next) setStep(next);
  };
  const goSkip = () => goNext();

  return (
    <div className="min-h-screen bg-[#f6f8fb] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl space-y-6">
        <OnboardingStepper currentStep={step} />
        <Card className="border-0 shadow-2xl">
          <CardContent className="p-6 sm:p-8">
            {step === 'welcome' && (
              <StepWelcome
                organizationName={organization?.name}
                onContinue={goNext}
              />
            )}
            {step === 'business' && (
              <StepBusinessDetails
                effectiveOrgId={effectiveOrgId}
                onSkip={goSkip}
                onContinue={goNext}
              />
            )}
            {step === 'team' && (
              <StepInviteTeam
                effectiveOrgId={effectiveOrgId}
                onSkip={goSkip}
                onContinue={goNext}
              />
            )}
            {step === 'first_ot' && <StepFirstRecepcion />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}