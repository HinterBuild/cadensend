"use client";

import { ReactNode, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { AppSidebar, navigation } from '@/components/AppSidebar';
import { BrandWordmark } from '@/components/BrandLogo';

const SIDEBAR_COLLAPSED_KEY = 'cadensend.sidebar.collapsed';

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const pathname = usePathname();

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const close = () => setMobileNavOpen(false);

  return (
    <div
      className="flex min-h-screen bg-[#f6f3ee]"
      style={{ '--sidebar-width': sidebarCollapsed ? '4.5rem' : '16rem' } as CSSProperties}
    >
      {/* Mobile top bar with nav drawer */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-[#e7e0d6] bg-[#faf8f5] px-4 py-3 sm:hidden">
        <BrandWordmark />
        <button
          type="button"
          onClick={() => setMobileNavOpen((open) => !open)}
          aria-expanded={mobileNavOpen}
          aria-controls="mobile-nav"
          aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
          className="rounded-lg p-2 text-stone-700 hover:bg-stone-200/70"
        >
          {mobileNavOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
      {mobileNavOpen && (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="fixed inset-x-0 top-[52px] z-40 max-h-[calc(100dvh-52px)] overflow-y-auto border-b border-[#e7e0d6] bg-[#faf8f5] px-4 pb-4 pt-2 shadow-lg sm:hidden"
        >
          <ul className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const inSeriesFlow =
                item.href === '/dashboard' &&
                (pathname.startsWith('/series') || pathname.startsWith('/issues'));
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`) || inSeriesFlow;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={close}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center rounded-xl px-3 py-2.5 text-sm font-medium no-underline ${
                      isActive ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-200/70'
                    }`}
                  >
                    <Icon className="mr-3 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    <span>{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <AppSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <main id="main-content" className="relative min-w-0 flex-1 overflow-y-auto pt-[52px] sm:pt-0">
        {children}
      </main>
    </div>
  );
}
