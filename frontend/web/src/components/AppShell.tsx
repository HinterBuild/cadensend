'use client';

import { type ReactNode, useState, useSyncExternalStore, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, LogOut, Menu } from 'lucide-react';
import { AppSidebar, NavigationLinks, navigation } from '@/components/AppSidebar';
import { Modal } from '@/components/Modal';
import { useAuth } from '@/contexts/AuthContext';

const SIDEBAR_KEY = 'cadensend.sidebar.collapsed';
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('sidebar-preference', callback);
  return () => { window.removeEventListener('storage', callback); window.removeEventListener('sidebar-preference', callback); };
}
function getCollapsed() {
  try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const collapsed = useSyncExternalStore(subscribe, getCollapsed, () => false);
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const title = pathname.startsWith('/series/create') ? 'New series' : pathname.startsWith('/series/') ? 'Series details' : pathname.startsWith('/issues/') ? 'Issue editor' : navigation.find(item => item.href === pathname)?.name || 'Workspace';

  function toggleSidebar() {
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '0' : '1'); } catch { return; }
    window.dispatchEvent(new Event('sidebar-preference'));
  }

  async function signOut() {
    setSigningOut(true);
    setError('');
    try { await logout(); } catch { setError('Could not sign out. Please try again.'); } finally { setSigningOut(false); }
  }

  return <div className="app-shell flex min-h-dvh" style={{ '--sidebar-width': collapsed ? '4.5rem' : '15rem' } as CSSProperties}>
    <AppSidebar collapsed={collapsed} onToggle={toggleSidebar} />
    <div className="min-w-0 flex-1">
      <header className="workspace-topbar flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-stone-200/80 bg-white/80 px-4 py-3 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" className="icon-button md:hidden" aria-label="Open navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)}><Menu className="h-5 w-5" aria-hidden="true" /></button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
            <Link href="/dashboard" className="hidden text-stone-500 sm:inline">Workspace</Link>
            <ChevronRight className="hidden h-3.5 w-3.5 text-stone-400 sm:block" aria-hidden="true" />
            <span aria-current="page" className="truncate font-medium text-stone-800">{title}</span>
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {user && <Link href="/settings" className="flex items-center gap-2 rounded-lg text-sm no-underline hover:no-underline" aria-label="Account settings">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100" aria-hidden="true">{(user.name || user.email).slice(0, 2).toUpperCase()}</span>
            <span className="hidden max-w-36 truncate text-stone-600 lg:block">{user.name || user.email}</span>
          </Link>}
          <button type="button" onClick={signOut} disabled={signingOut} aria-label={signingOut ? 'Signing out' : 'Sign out'} title="Sign out" className="icon-button"><LogOut className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </header>
      {error && <p role="alert" className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-800">{error}</p>}
      <main id="main-content" tabIndex={-1} className="min-w-0 outline-none">{children}</main>
    </div>
    {mobileNavOpen && <Modal title="Navigation" onClose={() => setMobileNavOpen(false)}><nav aria-label="Mobile navigation"><NavigationLinks onNavigate={() => setMobileNavOpen(false)} /></nav></Modal>}
  </div>;
}
