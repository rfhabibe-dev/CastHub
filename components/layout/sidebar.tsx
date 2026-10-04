'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Upload, Link2, History, Settings, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/upload', label: 'New Post', icon: Upload },
  { href: '/connections', label: 'Connections', icon: Link2 },
  { href: '/history', label: 'History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-64 flex-col border-r border-slate-200 bg-white h-screen sticky top-0">
      <div className="flex items-center gap-2 px-6 py-5 border-b border-slate-200">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Zap className="h-5 w-5" />
        </div>
        <span className="text-xl font-bold tracking-tight text-slate-900">CastHub</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-slate-200">
        <div className="rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 p-4">
          <p className="text-xs font-medium text-slate-600 mb-1">Pro tip</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Connect all your social accounts first, then publish once to reach every platform.
          </p>
        </div>
        <Link
          href="/privacy-policy"
          className="block mt-3 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          Privacy Policy
        </Link>
      </div>
    </aside>
  );
}
