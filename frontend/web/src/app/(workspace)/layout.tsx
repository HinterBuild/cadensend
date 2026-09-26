"use client";

import { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

// Every signed-in section lives in this route group so it shares one
// AppShell (sidebar + top bar). The "(workspace)" folder is not part of the
// URL. A single layout also keeps the shell mounted when moving between
// sections instead of remounting it per section.
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
