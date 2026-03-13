import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info' | 'income' | 'expenses' | 'overheads';
  size?: 'sm' | 'md';
  withDot?: boolean;
}

export function Badge({
  className,
  variant = 'default',
  size = 'md',
  withDot = false,
  children,
  ...props
}: BadgeProps) {
  const dotColor = {
    default: 'bg-lp-text',
    success: 'bg-emerald-500',
    error: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-blue-500',
    income: 'bg-emerald-500',
    expenses: 'bg-red-500',
    overheads: 'bg-violet-500',
  }[variant];

  const bgColor = {
    default: 'bg-lp-surface',
    success: 'bg-emerald-50',
    error: 'bg-red-50',
    warning: 'bg-amber-50',
    info: 'bg-blue-50',
    income: 'bg-emerald-50',
    expenses: 'bg-red-50',
    overheads: 'bg-violet-50',
  }[variant];

  const textColor = {
    default: 'text-lp-text',
    success: 'text-emerald-700',
    error: 'text-red-700',
    warning: 'text-amber-700',
    info: 'text-blue-700',
    income: 'text-emerald-700',
    expenses: 'text-red-700',
    overheads: 'text-violet-700',
  }[variant];

  const padding = {
    sm: 'px-2 py-1 text-[10px]',
    md: 'px-3 py-1.5 text-xs',
  }[size];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded font-semibold tracking-wide uppercase',
        bgColor,
        textColor,
        padding,
        className
      )}
      {...props}
    >
      {withDot && <span className={cn('w-2 h-2 rounded-full', dotColor)} />}
      {children}
    </span>
  );
}
