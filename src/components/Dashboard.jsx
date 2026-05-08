import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import { api, PROVIDER_LABELS, PROVIDER_COLORS, fmtCurrency, fmtTokens } from '../lib/api.js';

export default function Dashboard({ refreshTick, status }) {
  const [mtd, setMtd] = useState([]);
  const [series, setSeries] = useState([]);
  const [quotas, setQuotas] = useState([]);

  useEffect(() => {
    Promise.all([api.getMonthToDate(), api.getDailySeries({ days: 30 }), api.getQuotas()])
      .then(([m, s, q]) => {
        setMtd(m || []);
        setSeries(s || []);
        setQuotas(q || []);
      })
      .catch((e) => console.error(e));
  }, [refreshTick]);

  const totals = aggregate(mtd);
  const quotaByProvider = Object.fromEntries((quotas || []).map((q) => [q.provider, q]));
  const chartData = pivotSeries(series);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Coût total ce mois"
          value={fmtCurrency(totals.cost_usd)}
          subtitle={
            quotas.find((q) => q.monthly_budget_usd)
              ? `Budgets: ${quotas
                  .filter((q) => q.monthly_budget_usd)
                  .map((q) => `${PROVIDER_LABELS[q.provider] || q.provider} ${fmtCurrency(q.monthly_budget_usd)}`)
                  .join(' · ')}`
              : 'Aucun budget configuré.'
          }
        />
        <KpiCard
          title="Tokens (in + out)"
          value={fmtTokens(totals.input_tokens + totals.output_tokens)}
          subtitle={`In ${fmtTokens(totals.input_tokens)} · Out ${fmtTokens(totals.output_tokens)}`}
        />
        <KpiCard
          title="Requêtes"
          value={fmtTokens(totals.requests)}
          subtitle="Sur le mois en cours"
        />
        <KpiCard
          title="Providers actifs"
          value={String(mtd.filter((r) => r.cost_usd > 0 || r.input_tokens > 0).length || mtd.length)}
          subtitle={Object.keys(status?.notes || {}).length ? 'Voir notes ci-dessous' : 'Tout va bien'}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(mtd.length === 0
          ? Object.keys(PROVIDER_LABELS)
          : mtd.map((r) => r.provider)
        ).map((provider) => {
          const row = mtd.find((r) => r.provider === provider) || {};
          const q = quotaByProvider[provider];
          return (
            <ProviderCard
              key={provider}
              provider={provider}
              row={row}
              quota={q}
              note={status?.notes?.[provider]}
            />
          );
        })}
      </section>

      <section className="bg-slate-900/40 border border-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Coût par jour (30 derniers jours)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData.cost}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }}
                formatter={(v) => fmtCurrency(v)}
              />
              <Legend />
              {Object.keys(PROVIDER_LABELS).map((p) => (
                <Line
                  key={p}
                  type="monotone"
                  dataKey={p}
                  stroke={PROVIDER_COLORS[p]}
                  strokeWidth={2}
                  dot={false}
                  name={PROVIDER_LABELS[p]}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="bg-slate-900/40 border border-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Tokens par jour</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData.tokens}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={fmtTokens} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }}
                formatter={(v) => fmtTokens(v)}
              />
              <Legend />
              {Object.keys(PROVIDER_LABELS).map((p) => (
                <Bar
                  key={p}
                  dataKey={p}
                  stackId="tokens"
                  fill={PROVIDER_COLORS[p]}
                  name={PROVIDER_LABELS[p]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function KpiCard({ title, value, subtitle }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{subtitle}</div>
    </div>
  );
}

function ProviderCard({ provider, row, quota, note }) {
  const tokens = (row.input_tokens || 0) + (row.output_tokens || 0);
  const budget = quota?.monthly_budget_usd;
  const tokenLimit = quota?.monthly_token_limit;
  const budgetPct = budget ? Math.min(100, ((row.cost_usd || 0) / budget) * 100) : null;
  const tokenPct = tokenLimit ? Math.min(100, (tokens / tokenLimit) * 100) : null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: PROVIDER_COLORS[provider] || '#64748b' }}
          />
          <h4 className="font-medium">{PROVIDER_LABELS[provider] || provider}</h4>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{fmtCurrency(row.cost_usd)}</div>
          <div className="text-xs text-slate-400">
            {fmtTokens(tokens)} tokens · {fmtTokens(row.requests)} req
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {budgetPct !== null && (
          <ProgressBar
            label="Budget mensuel"
            value={budgetPct}
            right={`${fmtCurrency(row.cost_usd)} / ${fmtCurrency(budget)}`}
          />
        )}
        {tokenPct !== null && (
          <ProgressBar
            label="Tokens mensuels"
            value={tokenPct}
            right={`${fmtTokens(tokens)} / ${fmtTokens(tokenLimit)}`}
          />
        )}
        {budgetPct === null && tokenPct === null && (
          <div className="text-xs text-slate-500">Aucun quota défini — réglez-le dans Paramètres.</div>
        )}
      </div>

      {note && (
        <div className="mt-3 text-xs text-amber-300/80 bg-amber-950/30 border border-amber-900/40 p-2 rounded">
          {note}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ label, value, right }) {
  const tone = value >= 90 ? 'bg-rose-500' : value >= 70 ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>{label}</span>
        <span>{right}</span>
      </div>
      <div className="h-2 rounded bg-slate-800 overflow-hidden">
        <div className={'h-full ' + tone} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function aggregate(rows) {
  return rows.reduce(
    (acc, r) => {
      acc.cost_usd += Number(r.cost_usd) || 0;
      acc.input_tokens += Number(r.input_tokens) || 0;
      acc.output_tokens += Number(r.output_tokens) || 0;
      acc.requests += Number(r.requests) || 0;
      return acc;
    },
    { cost_usd: 0, input_tokens: 0, output_tokens: 0, requests: 0 },
  );
}

function pivotSeries(rows) {
  const cost = new Map();
  const tokens = new Map();
  for (const r of rows) {
    if (!cost.has(r.day)) cost.set(r.day, { day: r.day });
    if (!tokens.has(r.day)) tokens.set(r.day, { day: r.day });
    cost.get(r.day)[r.provider] = (cost.get(r.day)[r.provider] || 0) + (r.cost_usd || 0);
    tokens.get(r.day)[r.provider] =
      (tokens.get(r.day)[r.provider] || 0) + (r.input_tokens || 0) + (r.output_tokens || 0);
  }
  return {
    cost: [...cost.values()].sort((a, b) => a.day.localeCompare(b.day)),
    tokens: [...tokens.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}
