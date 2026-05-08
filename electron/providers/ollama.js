/**
 * Ollama connector.
 *
 * Ollama is a local server, free of charge. It does not expose a usage history
 * endpoint. We surface what we can:
 *   - server reachable / version
 *   - installed models (size, family, quantization)
 *   - currently running models with their VRAM use and last activity
 *
 * To track real per-request usage you'd need to wrap the /api/chat or
 * /api/generate calls. We stub a hook for that here so the UI can be wired
 * later.
 *
 * Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 */

async function ping({ baseUrl }) {
  const base = baseUrl || 'http://localhost:11434';
  try {
    const res = await fetch(`${base}/api/version`);
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
    const j = await res.json();
    return { ok: true, version: j.version };
  } catch (e) {
    return { ok: false, error: `Ollama unreachable at ${base}: ${e.message}` };
  }
}

async function fetchUsage({ baseUrl }) {
  const base = baseUrl || 'http://localhost:11434';
  const note =
    "Ollama tourne en local (pas de coût). Affichage des modèles installés et chargés.";

  let tags = null;
  let running = null;
  try {
    const r = await fetch(`${base}/api/tags`);
    if (r.ok) tags = await r.json();
  } catch (e) {
    return { rows: [], note: `Ollama unreachable: ${e.message}` };
  }
  try {
    const r = await fetch(`${base}/api/ps`);
    if (r.ok) running = await r.json();
  } catch (_) {
    /* optional */
  }

  // We synthesize a single "snapshot" row that represents the current state.
  // Costs are zero (local). Tokens are zero (we don't get history).
  const collected_at = new Date().toISOString();
  const today = collected_at.slice(0, 10);

  const installedCount = tags?.models?.length || 0;
  const runningCount = running?.models?.length || 0;

  const rows = [
    {
      provider: 'ollama',
      collected_at,
      period_start: today,
      period_end: today,
      input_tokens: 0,
      output_tokens: 0,
      requests: 0,
      cost_usd: 0,
      model: running?.models?.[0]?.name || tags?.models?.[0]?.name || null,
      raw_json: { installed: tags?.models || [], running: running?.models || [] },
    },
  ];

  return {
    rows,
    note,
    extra: {
      installed: tags?.models || [],
      running: running?.models || [],
      installedCount,
      runningCount,
    },
  };
}

module.exports = {
  label: 'Ollama (local)',
  requiresApiKey: false,
  keyKindHint: null,
  docs: 'https://github.com/ollama/ollama/blob/main/docs/api.md',
  ping,
  fetchUsage,
};
