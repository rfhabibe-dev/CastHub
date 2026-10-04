'use client';

import { cn } from '@/lib/utils';
import { PlatformIcon } from './platform-icon';
import { getPlatformConfig } from '@/lib/platforms/config';
import type { Platform } from '@/lib/types/database';

interface PlatformBadgeProps {
  platform: Platform;
  showName?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: { icon: 'h-3.5 w-3.5', container: 'px-2 py-0.5 text-xs', gap: 'gap-1' },
  md: { icon: 'h-4 w-4', container: 'px-2.5 py-1 text-xs', gap: 'gap-1.5' },
  lg: { icon: 'h-5 w-5', container: 'px-3 py-1.5 text-sm', gap: 'gap-2' },
};

export function PlatformBadge({ platform, showName = true, size = 'md', className }: PlatformBadgeProps) {
  const config = getPlatformConfig(platform);
  const s = sizeMap[size];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium border',
        config.bgColor,
        config.borderColor,
        config.textColor,
        s.container,
        s.gap,
        className
      )}
    >
      <PlatformIcon platform={platform} className={s.icon} />
      {showName && config.name}
    </span>
  );
}
