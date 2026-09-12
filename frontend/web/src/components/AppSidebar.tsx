'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BookOpen, Settings, BarChart3, Sparkles, Users, Wand2, Plug, GitBranch, FlaskConical, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { BrandLogo, BrandWordmark } from '@/components/BrandLogo';

export const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'Workspace' },
  { name: 'Studio', href: '/studio', icon: FlaskConical, group: 'Workspace' },
  { name: 'Sources', href: '/sources', icon: BookOpen, group: 'Workspace' },
  { name: 'Recipients', href: '/recipients', icon: Users, group: 'Workspace' },
  { name: 'Insights', href: '/insights', icon: Sparkles, group: 'Manage' },
  { name: 'Run Center', href: '/runs', icon: BarChart3, group: 'Manage' },
  { name: 'Skills', href: '/skills', icon: Wand2, group: 'Manage' },
  { name: 'Workflows', href: '/workflows', icon: GitBranch, group: 'Manage' },
  { name: 'Connectors', href: '/connectors', icon: Plug, group: 'Manage' },
  { name: 'Settings', href: '/settings', icon: Settings, group: 'Manage' },
];

export function isNavigationActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`) ||
    (href === '/dashboard' && (pathname.startsWith('/series/') || pathname.startsWith('/issues/')));
}

export function NavigationLinks({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return <>{['Workspace', 'Manage'].map(group => <div key={group} className="mb-5">
    {!collapsed && <p className="px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{group}</p>}
    <ul className="space-y-1">{navigation.filter(item => item.group === group).map(item => {
      const Icon = item.icon;
      const active = isNavigationActive(pathname, item.href);
      return <li key={item.href}><Link href={item.href} onClick={onNavigate}
        aria-label={collapsed ? item.name : undefined} title={collapsed ? item.name : undefined}
        aria-current={active ? 'page' : undefined}
        className={`nav-link ${collapsed ? 'justify-center px-2' : 'px-3'} ${active ? 'nav-link-active' : ''}`}>
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {!collapsed && <span>{item.name}</span>}
        {active && !collapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-700" aria-hidden="true" />}
      </Link></li>;
    })}</ul>
  </div>)}</>;
}

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return <aside className={`hidden shrink-0 flex-col border-r border-stone-200/80 bg-[#fafaf8] transition-[width] duration-200 md:sticky md:top-0 md:flex md:h-dvh ${collapsed ? 'w-[4.5rem]' : 'w-60'}`}>
    <Link href="/dashboard" aria-label="Cadensend home" className={`flex h-20 shrink-0 items-center no-underline hover:no-underline ${collapsed ? 'justify-center' : 'px-6'}`}>
      {collapsed ? <BrandLogo /> : <BrandWordmark />}
    </Link>
    <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto px-3"><NavigationLinks collapsed={collapsed} /></nav>
    <div className="border-t border-stone-200/80 p-3">
      <button type="button" onClick={onToggle} aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : undefined}
        className={`nav-link w-full ${collapsed ? 'justify-center px-2' : 'px-3'}`}>
        {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" /> : <><PanelLeftClose className="h-[18px] w-[18px]" aria-hidden="true" /><span>Collapse sidebar</span></>}
      </button>
    </div>
  </aside>;
}
