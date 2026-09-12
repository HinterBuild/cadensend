"use client";

import { useEffect, useState } from "react";
import { modelsApi, type LLMProviderConfig } from "@/lib/api";
import { ProviderSelector } from "./ProviderSelector";
import { ModelPicker } from "./ModelPicker";
import { ProviderCredentials } from "./ProviderCredentials";
import { ModelCapabilities } from "./ModelCapabilities";

const EMPTY_CONFIG: LLMProviderConfig = {
  provider: "openrouter",
  default_model: "",
  embedding_model: "",
  configs: {},
};

type ProviderConfigFormProps = {
  onUpdate?: () => void;
};

export function ProviderConfigForm({ onUpdate }: ProviderConfigFormProps) {
  const [config, setConfig] = useState<LLMProviderConfig>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    modelsApi.getProviderConfig().then(response => { if (!cancelled) setConfig(response.data ?? EMPTY_CONFIG); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load provider settings.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const updateProvider = async (provider: string) => {
    setSaving(true);
    setError(null);
    try {
      await modelsApi.updateProviderConfig({
        provider,
        default_model: config.default_model,
        embedding_model: config.embedding_model,
      });
      setConfig((prev) => ({ ...prev, provider }));
      onUpdate?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update provider");
    } finally {
      setSaving(false);
    }
  };

  const updateModel = async (model: string) => {
    setSaving(true);
    setError(null);
    try {
      await modelsApi.updateProviderConfig({
        provider: config.provider,
        default_model: model,
        embedding_model: config.embedding_model,
      });
      setConfig((prev) => ({ ...prev, default_model: model }));
      onUpdate?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update model");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse text-sm text-stone-500">Loading model provider settings…</div>;
  }

  const baseUrl = typeof config.configs?.base_url === "string" ? config.configs.base_url : "";

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          LLM provider
        </label>
        <ProviderSelector selected={config.provider} onChange={updateProvider} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Default model
        </label>
        <ModelPicker
          disabled={saving}
          provider={config.provider}
          value={config.default_model}
          onChange={updateModel}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Embedding model
        </label>
        <ModelPicker
          disabled={saving}
          provider={config.provider}
          label="Embedding model"
          value={config.embedding_model || ""}
          onChange={async (model) => {
            setSaving(true);
            setError(null);
            try {
              await modelsApi.updateProviderConfig({
                provider: config.provider,
                default_model: config.default_model,
                embedding_model: model,
              });
              setConfig((prev) => ({ ...prev, embedding_model: model }));
              onUpdate?.();
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : "Failed to update embedding model");
            } finally {
              setSaving(false);
            }
          }}
        />
      </div>

      <ProviderCredentials
        activeProvider={config.provider}
        configs={config.configs}
        onSaved={() => { void modelsApi.getProviderConfig().then(response => setConfig(response.data ?? EMPTY_CONFIG)).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not refresh settings.")); }}
      />

      <ModelCapabilities provider={config.provider} model={config.default_model} />

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {saving && <p className="text-sm text-gray-500">Saving…</p>}

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
                Custom base URL (optional)
              </label>
              <input
                type="url"
                placeholder="https://api.example.com/v1"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-stone-800"
                defaultValue={baseUrl}
                onBlur={async (e) => {
                  const nextBaseUrl = e.target.value.trim();
                  await modelsApi.updateProviderConfig({
                    provider: config.provider,
                    configs: { ...config.configs, base_url: nextBaseUrl },
                  });
                  await modelsApi.getProviderConfig().then(response => setConfig(response.data ?? EMPTY_CONFIG)).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not refresh settings."));
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
