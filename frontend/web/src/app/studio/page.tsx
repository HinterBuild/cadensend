"use client";

import { Suspense } from 'react';
import { StudioWorkbench } from '@/components/studio/StudioWorkbench';

export default function StudioPage() {
  return (
    <Suspense fallback={<div className="p-8 text-stone-500">Loading studio…</div>}>
      <StudioWorkbench />
    </Suspense>
  );
}
