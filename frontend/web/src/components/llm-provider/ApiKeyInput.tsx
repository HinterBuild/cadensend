"use client";

import { errorMessage } from '@/lib/errors';
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { modelsApi } from "@/lib/api";

type ApiKeyInputProps = {
  provider: string;
  hasExistingKey?: boolean;
  onSaved?: () => void;
};

export function ApiKeyInput({ provider, hasExistingKey, onSaved }: ApiKeyInputProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveKey = async () => {
    setSaving(true);
    setError(null);
    try {
      await modelsApi.updateProviderConfig({
        provider,
        configs: { api_key: apiKey },
      });
      onSaved?.();
    } catch (e: unknown) {
      setError(errorMessage(e) || "Failed to save API key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">
          {provider === "openrouter" ? "OpenRouter" : provider} API Key
        </label>
      </div>

      <div className="relative">
        <input
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={hasExistingKey ? "Enter a new key to replace the saved one" : "sk-..."}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-stone-800"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowKey(!showKey)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={saveKey}
        disabled={!apiKey || saving}
        className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : hasExistingKey ? "Update API key" : "Save API key"}
      </button>
    </div>
  );
}