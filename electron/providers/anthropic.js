/**
 * Anthropic / Claude connector.
 *
 * Uses the Admin API:
 *   GET /v1/organizations/usage_report/messages
 *   GET /v1/organizations/cost_report
 *
 * The Admin API requires an admin key (sk-ant-admin01-...). Workspace/user
 * API keys cannot read usage. If only a regular key is configured we still
 * try a lightweight ping against /v1/models so the user gets a meaningful
 * "key works, but switch to an admin key for usage data" message.
 *
 * Docs: https://docs.anthropic.com/en/api/admin-api
 */

const ANTHROPIC_VERSION = '2023-06-01';

async function ping({ apiKey, baseUrl }) {
  if (!apiKey) return { ok: false, error: 'Missing API key' };
  const url = `${baseUrl || 'https://api.anthropic.com'}/v1/models`;
  try {
    const res = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, status: res.status, error: body.slice(0, 400) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Fetch usage by day for the current month.
 * Returns normalized rows. If the key isn't an admin key, we surface that.
 */
async function fetchUsage({ apiKey, baseUrl, days = 30 }) {
  if (!apiKey) {
    return { rows: [], note: 'Aucune clé API Anthropic configurée.' };
  }
  const base = baseUrl || 'https://api.anthropic.com';

  const endingAt = new Date();
  const startingAt = new Date(endingAt.getTime() - days * 24 * 3600 * 1000);

  const params = new URLSearchParams({
    starting_at: startingAt.toISOString(),
    ending_at: endingAt.toISOString(),
    bucket_width: '1d',
  });

  const usageUrl = `${base}/v1/organizations/usage_report/messages?${params.toString()}`;
  const costUrl = `${base}/v1/organizations/cost_report?${params.toString()}`;

  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
  };

  let usageJson = null;
  let costJson = null;
  let note = null;

  try {
    const r = await fetch(usageUrl, { headers });
    if (r.status === 401 || r.status === 403) {
      return {
        rows: [],
        note:
          "La clé fournie n'est pas une clé Admin Anthropic. Pour récupérer l'usage, créez une clé Admin (Settings → API keys → Admin) sur console.anthropic.com.",
      };
    }
    if (!r.ok) {
      const body = await r.text();
      return { rows: [], note: `Anthropic usage error ${r.status}: ${body.slice(0, 200)}` };
    }
    usageJson = await r.json();
  } catch (e) {
    return { rows: [], note: `Anthropic usage fetch failed: ${e.message}` };
  }

  try {
    const r = await fetch(costUrl, { headers });
    if (r.ok) costJson = await r.json();
  } catch (_) {
    /* cost is optional */
  }

  // Index cost per day
  const costByDay = new Map();
  if (costJson?.data) {
    for (const bucket of costJson.data) {
      const day = (bucket.starting_at || '').slice(0, 10);
      const cost =
        bucket.results?.reduce(
          (acc, r) => acc + (Number(r.amount?.amount) || Number(r.amount) || 0),
          0,
        ) || 0;
      costByDay.set(day, (costByDay.get(day) || 0) + cost);
    }
  }

  const rows = [];
  for (const bucket of usageJson?.data || []) {
    const day = (bucket.starting_at || '').slice(0, 10);
    let inTok = 0;
    let outTok = 0;
    let reqs = 0;
    for (const result of bucket.results || []) {
      inTok +=
        Number(result.uncached_input_tokens || 0) +
        Number(result.cache_read_input_tokens || 0) +
        Number(result.cache_creation_input_tokens || 0);
      outTok += Number(result.output_tokens || 0);
      reqs += Number(result.server_tool_use?.web_search_requests || 0);
    }
    rows.push({
      provider: 'anthropic',
      collected_at: new Date().toISOString(),
      period_start: bucket.starting_at,
      period_end: bucket.ending_at,
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

module.exports = {
  label: 'Anthropic Claude',
  requiresApiKey: true,
  keyKindHint: 'admin',
  docs: 'https://docs.anthropic.com/en/api/admin-api',
  ping,
  fetchUsage,
};
