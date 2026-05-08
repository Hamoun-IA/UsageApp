// Thin wrapper around window.api so components don't crash in browser preview.
const stub = new Proxy(
  {},
  {
    get() {
      return async () => {
        throw new Error('Electron preload non chargé. Lancez via `npm run dev`.');
      };
    },
  },
);
export const api = typeof window !== 'undefined' && window.api ? window.api : stub;

export const PROVIDER_LABELS = {
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI',
  ollama: 'Ollama (local)',
  zai: 'Z.ai',
};

export const PROVIDER_COLORS = {
  anthropic: '#d97706',
  openai: '#10b981',
  ollama: '#8b5cf6',
  zai: '#3b82f6',
};

export function fmtCurrency(n) {
  if (n === null || n === undefined) return '—';
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

export function fmtNumber(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('fr-FR');
}

export function fmtTokens(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}
