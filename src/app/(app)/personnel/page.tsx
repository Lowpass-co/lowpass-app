import Link from 'next/link';
import { User } from 'lucide-react';

export default function PersonnelPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-2xl font-bold text-lp-text">Personnel</h1>
      <p className="text-sm text-lp-text-secondary">Crew and band database with LP-IDs. Coming in Phase 1E.</p>
      <p className="text-sm text-lp-text-secondary">
        If you’re added to a tour as personnel, you can{' '}
        <Link href="/profile" className="text-lp-orange hover:underline inline-flex items-center gap-1">
          <User size={14} />
          edit your profile
        </Link>
        {' '}to fill in your display name, contact details, and day/per diem rates.
      </p>
    </div>
  );
}
