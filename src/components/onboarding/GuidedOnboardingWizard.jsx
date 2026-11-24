import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import OnboardingStepper from './OnboardingStepper';
import StepWelcome from './StepWelcome';
import StepBusinessDetails from './StepBusinessDetails';
import StepInviteTeam from './StepInviteTeam';
import StepFirstRecepcion from './StepFirstRecepcion';
import { ONBOARDING_STEPS, saveProgress, clearProgress } from './onboardingProgress';

const STEP_ORDER = ONBOARDING_STEPS;

export default function GuidedOnboardingWizard({ organization, effectiveOrgId, primaryBranchId, wizardKey, initialStep = 'welcome' }) {
  const [step, setStep] = useState(STEP_ORDER.includes(initialStep) ? initialStep : 'welcome');

  const currentIndex = STEP_ORDER.indexOf(step);
  const goNext = () => {
    const next = STEP_ORDER[currentIndex + 1];
    if (next) { saveProgress(window.localStorage, wizardKey, next); setStep(next); }
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
                primaryBranchId={primaryBranchId}
                onSkip={goSkip}
                onContinue={goNext}
              />
            )}
            {step === 'first_ot' && <StepFirstRecepcion onFinish={() => clearProgress(window.localStorage, wizardKey)} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}