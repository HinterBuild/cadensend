"use client";

import { AlertCircle, CheckCircle2, Circle } from "lucide-react";

type CheckItem = {
  id: string;
  label: string;
  detail: string;
  ok: boolean;
  warn?: boolean;
};

export function IssueDeliveryChecklist({
  subjectLength,
  hasPreheader,
  hasBlocks,
  hasSchedule,
  subjectOk,
}: {
  subjectLength: number;
  hasPreheader: boolean;
  hasBlocks: boolean;
  hasSchedule: boolean;
  subjectOk: boolean;
}) {
  const items: CheckItem[] = [
    {
      id: "subject",
      label: "Subject line",
      detail: subjectOk
        ? `${subjectLength} characters — good length for inbox display`
        : subjectLength === 0
        ? "Add a subject before sending"
        : `${subjectLength} characters — may truncate in mobile inboxes`,
      ok: subjectOk && subjectLength > 0,
      warn: subjectLength > 0 && !subjectOk,
    },
    {
      id: "preheader",
      label: "Preheader",
      detail: hasPreheader
        ? "Shows under the subject in Gmail and Apple Mail"
        : "Recommended — improves open rates",
      ok: hasPreheader,
      warn: !hasPreheader,
    },
    {
      id: "content",
      label: "Email body",
      detail: hasBlocks ? "Content blocks are ready" : "Add at least one content block",
      ok: hasBlocks,
    },
    {
      id: "schedule",
      label: "Send time",
      detail: hasSchedule ? "Scheduled for delivery" : "Set a send time before approving",
      ok: hasSchedule,
    },
  ];

  const readyCount = items.filter((item) => item.ok).length;

  return (
    <section className="rounded-2xl border border-[#e7e0d6] bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold text-stone-900">Delivery checklist</h3>
          <p className="text-sm text-stone-600">Review before approving and scheduling</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            readyCount === items.length
              ? "bg-emerald-100 text-emerald-900"
              : "bg-stone-100 text-stone-700"
          }`}
        >
          {readyCount}/{items.length} ready
        </span>
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3">
            {item.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : item.warn ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-stone-300" aria-hidden="true" />
            )}
            <div>
              <p className="text-sm font-medium text-stone-900">{item.label}</p>
              <p className="text-xs text-stone-500">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
