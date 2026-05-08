import { useEffect, useState } from 'react';
import { Eye, EyeOff, Check, AlertCircle, ExternalLink } from 'lucide-react';
import { api, PROVIDER_LABELS } from '../lib/api.js';

export default function Settings({ onChanged }) {
  const [providers, setProviders] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [quotas, setQuotas] = useState([]);
  const [interval, setInterval] = useState(30);
  const [forms, setForms] = useState({});
  const [showKey, setShowKey] = useState({});
  const [testResults, setTestResults] = useState({});
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    reload();
  }, []);

  async function reload() {
    const [p, c, q, intv] = await Promise.all([
      api.listProviders(),
      api.getProviderConfigs(),
      api.getQuotas(),
      api.getSetting('refresh_interval_minutes', 30),
    ]);
    setProviders(p || []);
    setConfigs(c || []);
    setQuotas(q || []);
    setInterval(intv || 30);

    const draft = {};
    for (const cfg of c || []) {
      const quota = (q || []).find((x) => x.provider === cfg.provider);
      draft[cfg.provider] = {
        provider: cfg.provider,
        enabled: cfg.enabled,
        base_url: cfg.base_url || '',
        apiKey: '',
        org_id: cfg.org_id || '',
        monthly_budget_usd: quota?.monthly_budget_usd || '',
        monthly_token_limit: quota?.monthly_token_limit || '',
        hasKey: cfg.hasKey,
      };
    }
    setForms(draft);
  }

  function update(provider, patch) {
    setForms((f) => ({ ...f, [provider]: { ...f[provider], ...patch } }));
  }

  async function save(provider) {
    setSavingId(provider);
    try {
      const f = forms[provider];
      await api.saveProviderConfig({
        provider,
        enabled: f.enabled,
        base_url: f.base_url,
        apiKey: f.apiKey || undefined,
        org_id: f.org_id,
      });
      await api.saveQuota({
        provider,
        monthly_budget_usd: f.monthly_budget_usd ? Number(f.monthly_budget_usd) : null,
        monthly_token_limit: f.monthly_token_limit ? Number(f.monthly_token_limit) : null,
      });
      await reload();
      onChanged?.();
    } finally {
      setSavingId(null);
    }
  }

  async function clearKey(provider) {
    if (!confirm(`Supprimer la clé API ${provider} ?`)) return;
    await api.clearProviderKey(provider);
    await reload();
  }

  async function test(provider) {
    setTestResults((t) => ({ ...t, [provider]: { loading: true } }));
    try {
      const r = await api.testProvider(provider);
      setTestResults((t) => ({ ...t, [provider]: r }));
    } catch (e) {
      setTestResults((t) => ({ ...t, [provider]: { ok: false, error: e.message } }));
    }
  }

  async function saveInterval(v) {
    setInterval(v);
    await api.setSetting('refresh_interval_minutes', Number(v));
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="font-semibold mb-2">Cadence de collecte</h3>
        <p className="text-xs text-slate-400 mb-3">
          Intervalle entre deux collectes automatiques. Les endpoints d'usage sont updatés à
          quelques minutes près côté providers.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="5"
            max="1440"
            value={interval}
            onChange={(e) => saveInterval(e.target.value)}
            className="w-24 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-sm"
          />
          <span className="text-sm text-slate-400">minutes</span>
          <span className="text-xs text-slate-500">(prend effet au prochain démarrage)</span>
        </div>
      </section>

      {providers.map((p) => {
        const f = forms[p.id] || {};
        const cfg = configs.find((c) => c.provider === p.id);
        const tr = testResults[p.id];
        return (
          <section
            key={p.id}
            className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{PROVIDER_LABELS[p.id] || p.label}</h3>
                <div className="text-xs text-slate-500">
                  {p.requiresApiKey
                    ? p.keyKindHint === 'admin'
                      ? "Nécessite une clé Admin pour lire l'usage organisationnel."
                      : 'Nécessite une clé API.'
                    : 'Pas de clé requise (service local).'}
                  {p.docs && (
                    <>
                      {' '}
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          api.openExternal(p.docs);
                        }}
                        className="text-brand-400 hover:underline inline-flex items-center gap-1"
                      >
                        Docs <ExternalLink className="w-3 h-3" />
                      </a>
                    </>
                  )}
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!f.enabled}
                  onChange={(e) => update(p.id, { enabled: e.target.checked })}
                />
                Activé
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Base URL">
                <input
                  type="text"
                  value={f.base_url || ''}
                  onChange={(e) => update(p.id, { base_url: e.target.value })}
                  className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-sm"
                />
              </Field>

              {p.requiresApiKey && (
                <Field
                  label={
                    cfg?.hasKey
                      ? 'Clé API (laisser vide pour conserver)'
                      : 'Clé API'
                  }
                >
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKey[p.id] ? 'text' : 'password'}
                        value={f.apiKey || ''}
                        onChange={(e) => update(p.id, { apiKey: e.target.value })}
                        placeholder={cfg?.hasKey ? '•••••••• (déjà enregistrée)' : ''}
                        className="w-full px-2 py-1 pr-8 rounded bg-slate-950 border border-slate-700 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((s) => ({ ...s, [p.id]: !s[p.id] }))}
                        className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-200"
                      >
                        {showKey[p.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {cfg?.hasKey && (
                      <button
                        onClick={() => clearKey(p.id)}
                        className="px-2 py-1 text-xs rounded border border-slate-700 hover:bg-slate-800"
                      >
                        Effacer
                      </button>
                    )}
                  </div>
                </Field>
              )}

              <Field label="Budget mensuel ($)">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={f.monthly_budget_usd || ''}
                  onChange={(e) => update(p.id, { monthly_budget_usd: e.target.value })}
                  className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-sm"
                />
              </Field>

              <Field label="Limite tokens / mois">
                <input
                  type="number"
                  min="0"
                  step="100000"
                  value={f.monthly_token_limit || ''}
                  onChange={(e) => update(p.id, { monthly_token_limit: e.target.value })}
                  className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-sm"
                />
              </Field>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => save(p.id)}
                disabled={savingId === p.id}
                className="px-3 py-1.5 rounded bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-sm font-medium"
              >
                Enregistrer
              </button>
              <button
                onClick={() => test(p.id)}
                disabled={tr?.loading}
                className="px-3 py-1.5 rounded border border-slate-700 hover:bg-slate-800 text-sm"
              >
                Tester la connexion
              </button>
              {tr && !tr.loading && (
                <span
                  className={
                    'inline-flex items-center gap-1 text-xs ' +
                    (tr.ok ? 'text-emerald-400' : 'text-rose-400')
                  }
                >
                  {tr.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {tr.ok ? `OK${tr.version ? ' · v' + tr.version : ''}` : tr.error || `HTTP ${tr.status}`}
                </span>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      {children}
    </label>
  );
}
