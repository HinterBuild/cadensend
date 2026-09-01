"use client";

import { useState, useEffect } from "react";
import { Check, ChevronDown } from "lucide-react";
import { modelsApi } from "@/lib/api";
import type { OpenRouterModel } from "@/lib/api";

type ModelPickerProps = {
  provider: string;
  value: string;
  onChange: (modelId: string) => void;
  className?: string;
};

export function ModelPicker({
  provider,
  value,
  onChange,
  className = "",
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (provider) {
      loadModels(provider);
    }
  }, [provider]);

  const loadModels = async (providerId: string) => {
    setLoading(true);
    try {
      const res = await modelsApi.listModels(providerId);
      const formatted = res.data.map(m => ({
        id: m.id,
        name: m.name || m.id,
        is_default: false,
      }));
      setModels(formatted);
    } catch (e) {
      console.error("Failed to load models:", e);
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  const selected = models.find(m => m.id === value) || { id: "", name: "Select a model" };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 focus-visible:ring-2 focus-visible:ring-stone-800 disabled:opacity-50"
      >
        <span className="truncate">
          {loading ? "Loading models..." : selected.name}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute top-full z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="max-h-60 overflow-y-auto py-1">
            {models.length === 0 && !loading && (
              <p className="px-3 py-2 text-sm text-gray-500">No models available</p>
            )}
            {models.map(model => (
              <button
                key={model.id}
                type="button"
                role="option"
                aria-selected={model.id === value}
                onClick={() => {
                  onChange(model.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50 ${
                  model.id === value ? "bg-stone-100 text-stone-900" : "text-gray-800"
                }`}
              >
                <span className="truncate">{model.name}</span>
                {model.id === value && (
                  <Check className="h-4 w-4 shrink-0 text-stone-800" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}