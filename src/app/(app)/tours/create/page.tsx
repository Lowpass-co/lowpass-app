/* ============================================
   LOWPASS — Create Tour Page

   Tour creation wizard.
   ============================================ */

import { TourWizard } from '@/components/tours/TourWizard';

export default function CreateTourPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-lp-text">New Tour</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Set up artist, dates, and basic tour details. You can add routing next.
        </p>
      </div>
      <TourWizard />
    </div>
  );
}
