import { useState } from 'react';
import { CheckCircle, Utensils } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSetupStatus } from '../../hooks/useSetupStatus';
import SetupRestaurantInfo from './SetupRestaurantInfo';
import SetupHours from './SetupHours';
import SetupTables from './SetupTables';

const STEPS = [
  { id: 1, label: 'Restaurant Info', description: 'Name and basic settings' },
  { id: 2, label: 'Operating Hours', description: 'When you are open' },
  { id: 3, label: 'Table Layout', description: 'Set up your tables' },
];

interface SetupWizardProps {
  onComplete: () => void;
}

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const { hasConfig, hasHours, firstIncompleteStep } = useSetupStatus();

  // Pre-mark already-completed steps
  const initialCompleted = new Set<number>();
  if (hasConfig) initialCompleted.add(1);
  if (hasHours) initialCompleted.add(2);

  const [step, setStep] = useState(firstIncompleteStep ?? 1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(initialCompleted);

  const completeStep = (s: number) => {
    setCompletedSteps((prev) => new Set([...prev, s]));
    if (s < STEPS.length) {
      setStep(s + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 text-white rounded-2xl mb-4">
            <Utensils size={28} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome to Rezzy</h1>
          <p className="text-gray-500 mt-1">Let's set up your restaurant in a few quick steps</p>
        </div>

        {/* Steps */}
        <div className="flex items-center justify-center mb-8 gap-0">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <button
                onClick={() => completedSteps.has(s.id) && setStep(s.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                  step === s.id && 'bg-blue-600 text-white shadow-md',
                  step !== s.id && completedSteps.has(s.id) && 'text-blue-600 cursor-pointer hover:bg-blue-50',
                  step !== s.id && !completedSteps.has(s.id) && 'text-gray-400 cursor-default'
                )}
              >
                {completedSteps.has(s.id) && step !== s.id ? (
                  <CheckCircle size={16} className="text-blue-600" />
                ) : (
                  <span
                    className={cn(
                      'w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold',
                      step === s.id ? 'bg-white text-blue-600' : 'bg-gray-200 text-gray-500'
                    )}
                  >
                    {s.id}
                  </span>
                )}
                {s.label}
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'w-8 h-0.5 mx-1',
                    completedSteps.has(s.id) ? 'bg-blue-400' : 'bg-gray-200'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          {step === 1 && <SetupRestaurantInfo onNext={() => completeStep(1)} />}
          {step === 2 && <SetupHours onNext={() => completeStep(2)} onBack={() => setStep(1)} />}
          {step === 3 && <SetupTables onNext={() => completeStep(3)} onBack={() => setStep(2)} />}
        </div>
      </div>
    </div>
  );
}
