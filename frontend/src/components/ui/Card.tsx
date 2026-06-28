import { cn } from '../../lib/utils';
import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={cn('bg-white rounded-xl border border-gray-200 shadow-sm', className)}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className, ...props }: CardProps) {
  return (
    <div {...props} className={cn('border-b border-gray-100 px-4 py-4 sm:px-6', className)}>
      {children}
    </div>
  );
}

export function CardBody({ children, className, ...props }: CardProps) {
  return (
    <div {...props} className={cn('px-4 py-4 sm:px-6 sm:py-5', className)}>
      {children}
    </div>
  );
}
