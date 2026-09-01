"use client";

import { useEffect, useState } from "react";
import { modelsApi } from "@/lib/api";
import type { LLMProviderConfig } from "@/lib/api";
import { ProviderSelector } from "./ProviderSelector";
import { ModelPicker } from "./ModelPicker";
import { ApiKeyInput } from "./ApiKeyInput";

type ProviderConfigFormProps = {
  onUpdate?: () => void;
};

export function ProviderConfigForm({ onUpdate }: ProviderConfigFormProps) {
  const [config, setConfig] = useState<LLMProviderConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await modelsApi.getProviderConfig();
      setConfig(res.data);
    } catch (e) {
      console.error("Failed to load provider config:", e);
    } finally {
      setLoading(false);
    }
  };

  const updateProvider = async (provider: string) => {
    setSaving(true);
    setError(null);
    try {
      await modelsApi.updateProviderConfig({
        provider,
        default_model: config?.default_model || "",
        embedding_model: config?.embedding_model || "",
      });
      setConfig({ ...config, provider });
      onUpdate?.();
    } catch (e: any) {
      setError(e.message || "Failed to update provider");
    } finally {
      setSaving(false);
    }
  };

  const updateModel = async (model: string) => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      await modelsApi.updateProviderConfig({
        provider: config.provider,
        default_model: model,
        embedding_model: config.embedding_model,
      });
      setConfig({ ...config, default_model: model });
      onUpdate?.();
    } catch (e: any) {
      setError(e.message || "Failed to update model");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse">Loading configuration...</div>;
  }

  if (!config) {
    return <p className="text-sm text-gray-500">No configuration found.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Default LLM Provider
        </label>
        <ProviderSelector
          selected={config.provider}
          onChange={updateProvider}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Default Model
        </label>
        <ModelPicker
          provider={config.provider}
          value={config.default_model}
          onChange={updateModel}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Embedding Model
        </label>
        <ModelPicker
          provider={config.provider}
          value={config.embedding_model || ""}
          onChange={async (model) => {
            setSaving(true);
            try {
              await modelsApi.updateProviderConfig({
                provider: config.provider,
                default_model: config.default_model,
                embedding_model: model,
              });
              setConfig({ ...config, embedding_model: model });
              onUpdate?.();
            } finally {
              setSaving(false);
            }
          }}
        />
      </div>

      <div>
        <ApiKeyInput provider={config.provider} onSaved={onUpdate} />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {saving && <p className="text-sm text-gray-500">Saving...</p>}

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-stone-600 hover:text-stone-800"
        >
          {showAdvanced ? "Hide" : "Show"} advanced settings
        </button>
        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom Base URL (optional)
              </label>
              <input
                type="url"
                placeholder="https://api.example.com/v1"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-stone-800"
                defaultValue={config.configs?.base_url || ""}
                onBlur={async (e) => {
                  const base_url = e.target.value;
                  if (!base_url) return;
                  await modelsApi.updateProviderConfig({
                    provider: config.provider,
                    configs: { ...config.configs, base_url },
                  });
                  onUpdate?.();
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}