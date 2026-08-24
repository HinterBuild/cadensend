"use client";

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { BrandWordmark } from '@/components/BrandLogo';

const MOBILE_NAV = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Insights', href: '/insights' },
  { name: 'Recipients', href: '/recipients' },
  { name: 'Sources', href: '/sources' },
  { name: 'Run Center', href: '/runs' },
  { name: 'Settings', href: '/settings' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();

  const close = () => setMobileNavOpen(false);

  return (
    <div className="flex min-h-screen bg-[#f6f3ee]">
      {/* Mobile top bar with nav drawer */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-[#e7e0d6] bg-[#faf8f5] px-4 py-3 md:hidden">
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
          className="fixed inset-x-0 top-[52px] z-40 border-b border-[#e7e0d6] bg-[#faf8f5] px-4 pb-4 pt-2 shadow-lg md:hidden"
        >
          <ul className="space-y-1">
            {MOBILE_NAV.map((item) => {
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
                    className={`block rounded-xl px-3 py-2.5 text-sm font-medium no-underline ${
                      isActive ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-200/70'
                    }`}
                  >
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <AppSidebar />
      <main id="main-content" className="flex-1 overflow-y-auto pt-[52px] md:pt-0">
        {children}
      </main>
    </div>
  );
}
