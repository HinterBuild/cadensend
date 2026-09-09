"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  Settings,
  BarChart3,
  Sparkles,
  Users,
  Wand2,
  Plug,
  GitBranch,
  FlaskConical,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { BrandLogo, BrandWordmark } from '@/components/BrandLogo';

export const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Insights', href: '/insights', icon: Sparkles },
  { name: 'Skills', href: '/skills', icon: Wand2 },
  { name: 'Connectors', href: '/connectors', icon: Plug },
  { name: 'Workflows', href: '/workflows', icon: GitBranch },
  { name: 'Studio', href: '/studio', icon: FlaskConical },
  { name: 'Recipients', href: '/recipients', icon: Users },
  { name: 'Sources', href: '/sources', icon: BookOpen },
  { name: 'Run Center', href: '/runs', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

type AppSidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
};

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={`hidden sm:sticky sm:top-0 sm:flex sm:h-dvh sm:max-h-dvh sm:shrink-0 sm:flex-col sm:overflow-hidden border-r border-[#e7e0d6] bg-[#faf8f5] transition-[width] duration-200 ease-in-out ${
        collapsed ? 'sm:w-[4.5rem]' : 'sm:w-64'
      }`}
    >
      <div className={`shrink-0 pt-8 pb-4 ${collapsed ? 'px-3' : 'px-7'}`}>
        {collapsed ? (
          <div className="flex justify-center">
            <BrandLogo />
          </div>
        ) : (
          <>
            <BrandWordmark />
            <p className="mt-2 pl-[42px] font-sans text-xs uppercase tracking-[0.18em] text-stone-500">
              Learning series
            </p>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {navigation.map((item) => {
          const Icon = item.icon;
          const inSeriesFlow = pathname.startsWith('/series') || pathname.startsWith('/issues');
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard' || pathname.startsWith('/dashboard/') || inSeriesFlow
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              title={collapsed ? item.name : undefined}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center rounded-xl font-sans text-sm font-medium no-underline transition-colors hover:no-underline ${
                collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
              } ${
                isActive
                  ? 'bg-stone-900 !text-white'
                  : '!text-stone-600 hover:bg-stone-200/70 hover:!text-stone-900'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${collapsed ? '' : 'mr-3'}`} strokeWidth={1.75} />
              {!collapsed && <span className="truncate">{item.name}</span>}
            </Link>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-[#e7e0d6] bg-[#faf8f5] p-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-200/70 hover:text-stone-900 ${
            collapsed ? 'justify-center px-2' : ''
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="mr-3 h-4 w-4" aria-hidden="true" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
