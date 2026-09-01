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

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const res = await modelsApi.listProviders();
      setProviders(res.data);
    } catch (e) {
      console.error("Failed to load providers:", e);
      setProviders([
        { id: "openrouter", name: "OpenRouter", description: "Default provider" }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const selectedProvider = providers.find(p => p.id === selected) || providers[0];

  return (
    <div className={`relative ${className}`}>
      <select
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
      {selectedProvider && (
        <p className="mt-1 text-xs text-gray-500">{selectedProvider.description}</p>
      )}
    </div>
  );
}