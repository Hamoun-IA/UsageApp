/**
 * OpenAI connector.
 *
 * Uses the modern Admin (organizations) endpoints:
 *   GET /v1/organization/usage/completions
 *   GET /v1/organization/costs
 *
 * Requires an admin API key (sk-admin-...). A regular sk-... key will get 401
 * on these endpoints; we detect that and surface the error to the user.
 *
 * Docs: https://platform.openai.com/docs/api-reference/usage
 */

async function ping({ apiKey, baseUrl }) {
  if (!apiKey) return { ok: false, error: 'Missing API key' };
  const url = `${baseUrl || 'https://api.openai.com'}/v1/models`;
  try {
    const res = await fetch(url, {
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

async function fetchUsage({ apiKey, baseUrl, days = 30 }) {
  if (!apiKey) return { rows: [], note: 'Aucune clé API OpenAI configurée.' };
  const base = baseUrl || 'https://api.openai.com';

  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - days * 24 * 3600;

  const usageParams = new URLSearchParams({
    start_time: String(startTime),
    end_time: String(endTime),
    bucket_width: '1d',
    limit: '31',
  });
  const costParams = new URLSearchParams({
    start_time: String(startTime),
    end_time: String(endTime),
    bucket_width: '1d',
    limit: '31',
  });

  const headers = { Authorization: `Bearer ${apiKey}` };

  let usageJson = null;
  let costJson = null;
  let note = null;

  try {
    const r = await fetch(`${base}/v1/organization/usage/completions?${usageParams}`, { headers });
    if (r.status === 401 || r.status === 403) {
      return {
        rows: [],
        note:
          "La clé fournie n'a pas accès aux endpoints d'usage. Utilisez une clé Admin (Organization → Admin keys) sur platform.openai.com.",
      };
    }
    if (!r.ok) {
      const body = await r.text();
      return { rows: [], note: `OpenAI usage error ${r.status}: ${body.slice(0, 200)}` };
    }
    usageJson = await r.json();
  } catch (e) {
    return { rows: [], note: `OpenAI usage fetch failed: ${e.message}` };
  }

  try {
    const r = await fetch(`${base}/v1/organization/costs?${costParams}`, { headers });
    if (r.ok) costJson = await r.json();
  } catch (_) {
    /* cost optional */
  }

  const costByDay = new Map();
  if (costJson?.data) {
    for (const bucket of costJson.data) {
      const day = isoDay(bucket.start_time);
      const cost =
        bucket.results?.reduce(
          (acc, r) => acc + (Number(r.amount?.value) || Number(r.amount) || 0),
          0,
        ) || 0;
      costByDay.set(day, (costByDay.get(day) || 0) + cost);
    }
  }

  const rows = [];
  for (const bucket of usageJson?.data || []) {
    const day = isoDay(bucket.start_time);
    let inTok = 0;
    let outTok = 0;
    let reqs = 0;
    for (const result of bucket.results || []) {
      inTok += Number(result.input_tokens || 0);
      outTok += Number(result.output_tokens || 0);
      reqs += Number(result.num_model_requests || 0);
    }
    rows.push({
      provider: 'openai',
      collected_at: new Date().toISOString(),
      period_start: new Date(bucket.start_time * 1000).toISOString(),
      period_end: new Date(bucket.end_time * 1000).toISOString(),
      input_tokens: inTok,
      output_tokens: outTok,
      requests: reqs,
      cost_usd: costByDay.get(day) || 0,
      model: null,
      raw_json: bucket,
    });
  }

  return { rows, note };
}

function isoDay(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

module.exports = {
  label: 'OpenAI',
  requiresApiKey: true,
  keyKindHint: 'admin',
  docs: 'https://platform.openai.com/docs/api-reference/usage',
  ping,
  fetchUsage,
};
