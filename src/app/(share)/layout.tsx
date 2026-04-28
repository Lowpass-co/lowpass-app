export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-lp-bg text-lp-text">
      <header className="border-b border-lp-border bg-lp-surface/80 px-6 py-3 print:hidden">
        <span className="text-lg font-semibold tracking-tight">Lowpass</span>
        <span className="ml-3 text-xs text-lp-text-secondary">Shared advance (read-only)</span>
      </header>
      {children}
    </div>
  );
}
