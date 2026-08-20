"use client";

import { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

export default function InsightsLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
