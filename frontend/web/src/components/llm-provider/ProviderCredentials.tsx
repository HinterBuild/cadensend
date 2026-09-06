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

export function ProviderCredentials({
  activeProvider,
  configs,
  onSaved,
}: ProviderCredentialsProps) {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    modelsApi
      .listProviders()
      .then((res) => setProviders(res.data ?? []))
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, []);

  const saveCredential = async (providerId: string) => {
    const value = (drafts[providerId] || "").trim();
    if (providerId !== "local" && !value) return;

    setSaving(providerId);
    setErrors((prev) => ({ ...prev, [providerId]: "" }));
    try {
      const payload: Record<string, unknown> =
        providerId === "local"
          ? { base_url: value || "http://localhost:11434/v1" }
          : { api_key: value };

      await modelsApi.updateProviderConfig({
        provider: activeProvider,
        configs: { [providerId]: payload },
      });
      setDrafts((prev) => ({ ...prev, [providerId]: "" }));
      onSaved?.();
    } catch (e: unknown) {
      setErrors((prev) => ({
        ...prev,
        [providerId]: e instanceof Error ? e.message : "Failed to save",
      }));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading providers…</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-900">Provider API keys</h3>
        <p className="mt-1 text-xs text-gray-500">
          Add credentials for each provider you want to use. Keys are stored per workspace and never shown again after saving.
        </p>
      </div>

      <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-gray-50/50">
        {providers.map((p) => {
          const configured = providerHasKey(configs, p.id);
          const isLocal = p.id === "local";
          const draft = drafts[p.id] || "";
          const show = visible[p.id] ?? false;

          return (
            <div key={p.id} className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-500">{PROVIDER_HINTS[p.id] || p.description}</p>
                </div>
                {configured && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    Configured
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type={isLocal || show ? "text" : "password"}
                  value={draft}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                  }
                  placeholder={
                    isLocal
                      ? configured
                        ? "http://localhost:11434/v1"
                        : "http://localhost:11434/v1"
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
                    onClick={() => setVisible((prev) => ({ ...prev, [p.id]: !show }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={show ? "Hide key" : "Show key"}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
              </div>

              {errors[p.id] && (
                <p className="text-xs text-red-600">{errors[p.id]}</p>
              )}

              <button
                type="button"
                onClick={() => saveCredential(p.id)}
                disabled={saving === p.id || (!isLocal && !draft.trim())}
                className="inline-flex items-center gap-2 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-50"
              >
                {saving === p.id && <Loader2 className="h-3 w-3 animate-spin" />}
                {saving === p.id
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
        })}
      </div>
    </div>
  );
}
