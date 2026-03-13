import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'accent' | 'surface';
  noPadding?: boolean;
}

export function Card({
  className,
  variant = 'default',
  noPadding = false,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden',
        variant === 'default' && 'bg-white border-lp-border',
        variant === 'accent' && 'bg-gradient-to-br from-orange-50 to-orange-25 border-lp-orange border-opacity-25 outline outline-lp-orange outline-opacity-25',
        variant === 'surface' && 'bg-lp-surface border-lp-border',
        !noPadding && 'p-6',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-lp-border pb-4', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('pt-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-t border-lp-border mt-4 pt-4', className)} {...props} />;
}
