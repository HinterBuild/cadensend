"use client";

import { CheckCircle, AlertCircle } from "lucide-react";

type ModelCapabilitiesProps = {
  provider: string;
  model: string;
};

type Capability = {
  name: string;
  supported: boolean;
  note?: string;
};

const CAPABILITIES: Record<string, Capability[]> = {
  openrouter: [
    { name: "Chat Completion", supported: true },
    { name: "Text Embeddings", supported: true },
    { name: "Function Calling", supported: true },
    { name: "Structured Output", supported: true },
    { name: "Image Input", supported: "image" in "image" },
    { name: "Token Counting", supported: true },
  ],
  openai: [
    { name: "Chat Completion", supported: true },
    { name: "Text Embeddings", supported: true },
    { name: "Function Calling", supported: true },
    { name: "Structured Output", supported: true },
    { name: "Image Input", supported: true },
    { name: "Audio Input", supported: true },
  ],
  anthropic: [
    { name: "Chat Completion", supported: true },
    { name: "Text Embeddings", supported: false },
    { name: "Function Calling", supported: true },
    { name: "Structured Output", supported: true },
    { name: "Image Input", supported: true },
    { name: "Token Counting", supported: true },
  ],
  gemini: [
    { name: "Chat Completion", supported: true },
    { name: "Text Embeddings", supported: true },
    { name: "Function Calling", supported: true },
    { name: "Structured Output", supported: true },
    { name: "Image Input", supported: true },
    { name: "Audio Input", supported: true },
  ],
  local: [
    { name: "Chat Completion", supported: true },
    { name: "Text Embeddings", supported: true, note: "Depends on model" },
    { name: "Function Calling", supported: false, note: "Limited support" },
    { name: "Image Input", supported: false },
    { name: "Token Counting", supported: false },
  ],
  xai: [
    { name: "Chat Completion", supported: true },
    { name: "Text Embeddings", supported: false },
    { name: "Function Calling", supported: true },
    { name: "Image Input", supported: false },
    { name: "Token Counting", supported: true },
  ],
  qwen: [
    { name: "Chat Completion", supported: true },
    { name: "Text Embeddings", supported: true },
    { name: "Function Calling", supported: true },
    { name: "Image Input", supported: true },
    { name: "Token Counting", supported: true },
  ],
};

export function ModelCapabilities({ provider, model }: ModelCapabilitiesProps) {
  const caps = CAPABILITIES[provider] || [];

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h4 className="text-sm font-medium text-gray-900 mb-3">
        {provider} Capabilities
      </h4>
      <div className="space-y-2">
        {caps.map(cap => (
          <div key={cap.name} className="flex items-center justify-between">
            <span className="text-sm text-gray-700">{cap.name}</span>
            <div className="flex items-center gap-2">
              {cap.note && <span className="text-xs text-gray-500">({cap.note})</span>}
              {cap.supported ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-gray-300" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}