'use client';

import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, Loader2, XCircle, AlertCircle, Calendar, Ban, RefreshCw } from 'lucide-react';
import type { PublicationStatus } from '@/lib/types/database';

interface StatusBadgeProps {
  status: PublicationStatus;
  size?: 'sm' | 'md';
}

const config: Record<PublicationStatus, { label: string; className: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  queued: { label: 'Queued', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Loader2 },
  publishing: { label: 'Publishing', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Loader2 },
  success: { label: 'Success', className: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle2 },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600 border-slate-200', icon: Ban },
  scheduled: { label: 'Scheduled', className: 'bg-violet-50 text-violet-700 border-violet-200', icon: Calendar },
  retrying: { label: 'Retrying', className: 'bg-orange-50 text-orange-700 border-orange-200', icon: RefreshCw },
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const c = config[status];
  const Icon = c.icon;
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border font-medium', c.className, padding)}>
      <Icon className={cn(iconSize, (status === 'queued' || status === 'publishing' || status === 'retrying') && 'animate-spin')} />
      {c.label}
    </span>
  );
}
