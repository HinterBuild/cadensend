"use client";

import { useState, useEffect } from "react";
import { modelsApi, type LLMProvider } from "@/lib/api";

type ProviderSelectorProps = {
  selected: string;
  onChange: (provider: string) => void;
  className?: string;
};

export function ProviderSelector({
  selected,
  onChange,
  className = "",
}: ProviderSelectorProps) {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    modelsApi.listProviders().then(response => { if (!cancelled) setProviders(response.data); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load providers.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selectedProvider = providers.find(p => p.id === selected) || providers[0];

  return (
    <div className={`relative ${className}`}>
      <select
        aria-label="LLM provider"
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-stone-800"
      >
        {providers.map(provider => (
          <option key={provider.id} value={provider.id}>
            {provider.name}
          </option>
        ))}
      </select>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      {selectedProvider && (
        <p className="mt-1 text-xs text-gray-500">{selectedProvider.description}</p>
      )}
    </div>
  );
}