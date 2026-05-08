export function formatRelativeTime(epochMs) {
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s`;
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}min`;
  if (diff < 86_400_000) return `${Math.round(diff / 3600_000)}h`;
  return `${Math.round(diff / 86_400_000)}j`;
}

export function severityFor(snap) {
  if (snap.error) return 'error';
  if ((snap.weeklyPct ?? 0) >= 95) return 'critical';
  if ((snap.sessionPct ?? 0) >= 90) return 'critical';
  if ((snap.sessionPct ?? 0) >= 80) return 'warn';
  if ((snap.weeklyPct ?? 0) >= 80) return 'warn';
  return 'ok';
}

export function formatResetIn(epochMs) {
  if (!epochMs) return '';
  const diff = epochMs - Date.now();
  if (diff <= 0) return 'now';
  const h = Math.floor(diff / 3600_000);
  const m = Math.floor((diff % 3600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const PROVIDER_COLORS = {
  claude: '#f59e0b',  // orange
  codex:  '#10b981',  // vert
  ollama: '#a855f7',  // purple
  zai:    '#06b6d4',  // cyan
};

export const PROVIDER_LABELS = {
  claude: 'Claude',
  codex:  'Codex',
  ollama: 'Ollama',
  zai:    'Z.ai',
};
