"use client";

import { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

export default function SourcesLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
