import { cn } from '../../lib/utils';
import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

type AlertVariant = 'error' | 'success' | 'info' | 'warning';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

const config: Record<AlertVariant, { bg: string; icon: ReactNode }> = {
  error: {
    bg: 'bg-red-50 border-red-200 text-red-800',
    icon: <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />,
  },
  success: {
    bg: 'bg-green-50 border-green-200 text-green-800',
    icon: <CheckCircle size={16} className="text-green-500 shrink-0 mt-0.5" />,
  },
  info: {
    bg: 'bg-blue-50 border-blue-200 text-blue-800',
    icon: <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />,
  },
  warning: {
    bg: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    icon: <AlertCircle size={16} className="text-yellow-600 shrink-0 mt-0.5" />,
  },
};

export default function Alert({ variant = 'info', title, children, className }: AlertProps) {
  const { bg, icon } = config[variant];
  return (
    <div className={cn('flex gap-3 rounded-lg border p-3 text-sm', bg, className)}>
      {icon}
      <div>
        {title && <p className="font-medium mb-0.5">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
