"use client";

import { ReactNode } from 'react';
import { AppSidebar } from '@/components/AppSidebar';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#f6f3ee]">
      <AppSidebar />
      <main id="main-content" className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
