import { ArrowLeft, LogOut } from 'lucide-react';
import StepIndicator from '../../../../components/StepIndicator';
import { DRIVER_ONBOARDING_STEPS } from '../../../../utils/driverOnboarding';

/**
 * Shared layout for driver registration steps (header + step bar + content).
 */
const DriverOnboardingShell = ({
  currentStep,
  stepLabel,
  title,
  subtitle,
  onBack,
  onLogout,
  children,
  footer,
}) => (
  <div className="flex-1 flex flex-col bg-slate-50 min-h-dvh">
    <div className="bg-white border-b border-slate-200 px-4 pt-4 pb-3">
      {(onBack || onLogout) && (
        <div className="flex items-center justify-between mb-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="p-2 -ml-2 rounded-xl hover:bg-slate-100"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-slate-800" />
            </button>
          ) : (
            <span />
          )}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded-lg hover:bg-slate-100"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 mb-3">
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        {stepLabel && (
          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full shrink-0">
            {stepLabel}
          </span>
        )}
      </div>
      <StepIndicator steps={DRIVER_ONBOARDING_STEPS} currentStep={currentStep} />
      {subtitle && (
        <p className="text-sm text-slate-600 mt-3 leading-relaxed">{subtitle}</p>
      )}
    </div>

    <div className="flex-1 flex flex-col px-4 py-5 overflow-y-auto">{children}</div>

    {footer && (
      <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 py-4 safe-area-pb">
        {footer}
      </div>
    )}
  </div>
);

export default DriverOnboardingShell;
