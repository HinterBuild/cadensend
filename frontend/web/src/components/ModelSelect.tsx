"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { OpenRouterModel } from "@/lib/api";

type ModelSelectProps = {
  id?: string;
  value: string;
  onChange: (modelId: string) => void;
  models: OpenRouterModel[];
  defaultModel: string;
  className?: string;
};

export function ModelSelect({
  id,
  value,
  onChange,
  models,
  defaultModel,
  className = "",
}: ModelSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [maxHeight, setMaxHeight] = useState(320);

  const options = useMemo(() => {
    const rest = models.filter((model) => model.id !== defaultModel);
    return [{ id: "", name: `Default (${defaultModel})` }, ...rest];
  }, [models, defaultModel]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (model) =>
        model.name.toLowerCase().includes(q) || model.id.toLowerCase().includes(q)
    );
  }, [options, query]);

  const selected = options.find((model) => model.id === value) || options[0];

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const room = Math.max(spaceBelow, spaceAbove, 160);
      setMaxHeight(Math.min(360, room));
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    searchRef.current?.focus();
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setQuery("");
          setOpen((prev) => !prev);
        }}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 focus-visible:ring-2 focus-visible:ring-stone-800"
      >
        <span className="truncate">{selected.name}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-50 mt-1 flex w-[min(100vw-2rem,22rem)] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          style={{ maxHeight }}
        >
          <div className="shrink-0 border-b border-gray-100 p-2">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models"
              aria-label="Search models"
              className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-900 focus-visible:ring-2 focus-visible:ring-stone-800"
            />
          </div>
          <div ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-500">No models match</p>
            )}
            {filtered.map((model) => {
              const active = model.id === value;
              return (
                <button
                  key={model.id || "default"}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(model.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50 ${
                    active ? "bg-stone-50 text-stone-900" : "text-gray-800"
                  }`}
                >
                  <span className="truncate">{model.name}</span>
                  {active && <Check className="h-4 w-4 shrink-0 text-stone-800" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
