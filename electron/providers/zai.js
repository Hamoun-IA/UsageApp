/**
 * Z.ai connector (GLM / Zhipu).
 *
 * Z.ai exposes an OpenAI-compatible API at https://api.z.ai/api/paas/v4 .
 * As of this writing it does NOT expose a public per-day usage endpoint,
 * so we fall back to:
 *   - a /chat/completions ping with a 1-token request to confirm the key
 *   - a "no usage history" note guiding the user to the dashboard
 *
 * If/when an admin usage endpoint is published, swap the fetchUsage body.
 *
 * Docs: https://docs.z.ai/api-reference
 */

async function ping({ apiKey, baseUrl }) {
  if (!apiKey) return { ok: false, error: 'Missing API key' };
  const base = baseUrl || 'https://api.z.ai/api/paas/v4';
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: (await res.text()).slice(0, 400) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function fetchUsage({ apiKey, baseUrl }) {
  if (!apiKey) return { rows: [], note: 'Aucune clé API Z.ai configurée.' };
  const base = baseUrl || 'https://api.z.ai/api/paas/v4';

  // Z.ai n'expose pas d'endpoint /usage public. On confirme au moins que la clé
  // fonctionne en listant les modèles, et on recommande la saisie manuelle ou
  // la consultation du dashboard.
  try {
    const r = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) {
      return { rows: [], note: `Z.ai key error ${r.status}: ${(await r.text()).slice(0, 200)}` };
    }
  } catch (e) {
    return { rows: [], note: `Z.ai unreachable: ${e.message}` };
  }

  return {
    rows: [],
    note:
      "Z.ai ne publie pas (encore) d'endpoint usage. Clé valide. Renseignez le coût via le dashboard z.ai ou activez le tracking local des appels.",
  };
}

module.exports = {
  label: 'Z.ai (GLM)',
  requiresApiKey: true,
  keyKindHint: 'user',
  docs: 'https://docs.z.ai/api-reference',
  ping,
  fetchUsage,
};
