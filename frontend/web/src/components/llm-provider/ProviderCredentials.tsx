"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { modelsApi, type LLMProvider } from "@/lib/api";

const PROVIDER_HINTS: Record<string, string> = {
  openrouter: "Get a key at openrouter.ai/keys",
  openai: "Get a key at platform.openai.com/api-keys",
  anthropic: "Get a key at console.anthropic.com",
  gemini: "Get a key at aistudio.google.com/apikey",
  local: "Ollama base URL — no API key required",
  xai: "Get a key at console.x.ai",
  qwen: "Get a key from Alibaba DashScope",
};

const PROVIDER_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  local: "Local LLM",
  xai: "xAI",
  qwen: "Qwen",
};

function providerHasKey(configs: Record<string, unknown>, providerId: string): boolean {
  const nested = configs[providerId];
  if (nested && typeof nested === "object" && nested !== null) {
    if ((nested as Record<string, unknown>).has_api_key) return true;
  }
  if (providerId === "openrouter" && configs.has_api_key) return true;
  return false;
}

type ProviderCredentialsProps = {
  activeProvider: string;
  configs: Record<string, unknown>;
  onSaved?: () => void;
};

function ProviderCredentialsForm({
  activeProvider,
  configs,
  onSaved,
}: ProviderCredentialsProps) {
  const [providerMeta, setProviderMeta] = useState<LLMProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    modelsApi.listProviders().then(response => {
      if (!cancelled) setProviderMeta(response.data.find(provider => provider.id === activeProvider) ?? null);
    }).catch(() => { if (!cancelled) setProviderMeta(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeProvider]);

  const saveCredential = async () => {
    const value = draft.trim();
    const isLocal = activeProvider === "local";
    if (!isLocal && !value) return;

    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = isLocal
        ? { base_url: value || "http://localhost:11434/v1" }
        : { api_key: value };

      await modelsApi.updateProviderConfig({
        provider: activeProvider,
        configs: { [activeProvider]: payload },
      });
      setDraft("");
      onSaved?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!activeProvider) {
    return null;
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading provider settings…</p>;
  }

  const configured = providerHasKey(configs, activeProvider);
  const isLocal = activeProvider === "local";
  const providerName =
    providerMeta?.name || PROVIDER_LABELS[activeProvider] || activeProvider;

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-gray-900">
            {isLocal ? `${providerName} connection` : `${providerName} API key`}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            {PROVIDER_HINTS[activeProvider] || providerMeta?.description}
          </p>
        </div>
        {configured && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Configured
          </span>
        )}
      </div>

      <div className="relative">
        <input
          type={isLocal || showKey ? "text" : "password"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            isLocal
              ? "http://localhost:11434/v1"
              : configured
                ? "Enter new key to replace saved key"
                : "Paste API key"
          }
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-stone-800"
        />
        {!isLocal && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={saveCredential}
        disabled={saving || (!isLocal && !draft.trim())}
        className="inline-flex items-center gap-2 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
        {saving
          ? "Saving…"
          : configured
            ? isLocal
              ? "Update URL"
              : "Update key"
            : isLocal
              ? "Save URL"
              : "Save key"}
      </button>
    </div>
  );
}

export function ProviderCredentials(props: ProviderCredentialsProps) {
  return <ProviderCredentialsForm key={props.activeProvider} {...props} />;
}
