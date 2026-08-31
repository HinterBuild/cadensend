"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BookOpen, Settings, BarChart3, Sparkles, Users, Wand2, Plug, GitBranch, FlaskConical } from 'lucide-react';
import { BrandWordmark } from '@/components/BrandLogo';

const navigation = [
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

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex w-64 flex-col border-r border-[#e7e0d6] bg-[#faf8f5]">
      <div className="px-7 pt-8 pb-6">
        <BrandWordmark />
        <p className="mt-2 pl-[42px] font-sans text-xs uppercase tracking-[0.18em] text-stone-500">
          Learning series
        </p>
      </div>
      <div className="space-y-1 px-3">
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
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center rounded-xl px-3 py-2.5 font-sans text-sm font-medium no-underline transition-colors hover:no-underline ${
                isActive
                  ? 'bg-stone-900 !text-white'
                  : '!text-stone-600 hover:bg-stone-200/70 hover:!text-stone-900'
              }`}
            >
              <Icon className="mr-3 h-4 w-4" strokeWidth={1.75} />
              {item.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
