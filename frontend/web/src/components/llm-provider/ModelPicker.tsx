'use client';

import { useState, useEffect } from 'react';
import { modelsApi, type OpenRouterModel } from '@/lib/api';

export function ModelPicker({ provider, value, onChange, className = '', disabled = false, label = 'Default model' }: {
  provider: string; value: string; onChange: (modelId: string) => void; className?: string; disabled?: boolean; label?: string;
}) {
  const [catalog, setCatalog] = useState<{ provider: string; models: OpenRouterModel[]; error: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    modelsApi.listModels(provider).then(response => {
      if (!cancelled) setCatalog({ provider, models: response.data.map(model => ({ id: model.id, name: model.name || model.id, is_default: false })), error: '' });
    }).catch((err: unknown) => {
      if (!cancelled) setCatalog({ provider, models: [], error: err instanceof Error ? err.message : 'Could not load models.' });
    });
    return () => { cancelled = true; };
  }, [provider]);
  const loading = catalog?.provider !== provider;
  const models = loading ? [] : catalog?.models ?? [];
  return <div className={className}>
    <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} disabled={disabled || loading} className="field-input">
      <option value="" disabled>{loading ? 'Loading models…' : 'Select a model'}</option>
      {value && !models.some(model => model.id === value) && <option value={value}>{value}</option>}
      {models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
    </select>
    {!loading && catalog?.error && <p role="alert" className="mt-2 text-xs text-red-700">{catalog.error}</p>}
    {!loading && !catalog?.error && models.length === 0 && <p className="mt-2 text-xs text-stone-600">No models available for this provider.</p>}
  </div>;
}
