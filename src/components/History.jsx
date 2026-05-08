import { useEffect, useMemo, useState } from 'react';
import { api, PROVIDER_LABELS, fmtCurrency, fmtTokens } from '../lib/api.js';

export default function History({ refreshTick }) {
  const [rows, setRows] = useState([]);
  const [provider, setProvider] = useState('');
  const [days, setDays] = useState(30);

  useEffect(() => {
    api.getRecent({ provider: provider || null, days: Number(days) })
      .then(setRows)
      .catch(console.error);
  }, [refreshTick, provider, days]);

  const filtered = useMemo(() => rows || [], [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-sm"
        >
          <option value="">Tous les providers</option>
          {Object.entries(PROVIDER_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-sm"
        >
          <option value="7">7 jours</option>
          <option value="30">30 jours</option>
          <option value="90">90 jours</option>
          <option value="365">1 an</option>
        </select>
        <span className="text-xs text-slate-500">{filtered.length} entrées</span>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-950/60 text-slate-400">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">Provider</th>
              <th className="text-left px-3 py-2 font-medium">Période</th>
              <th className="text-right px-3 py-2 font-medium">Tokens in</th>
              <th className="text-right px-3 py-2 font-medium">Tokens out</th>
              <th className="text-right px-3 py-2 font-medium">Requêtes</th>
              <th className="text-right px-3 py-2 font-medium">Coût</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.length === 0 && (
              <tr>
                <td colSpan="7" className="px-3 py-6 text-center text-slate-500">
                  Aucune donnée. Configurez vos clés et cliquez Rafraîchir.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-slate-400 text-xs">
                  {new Date(r.collected_at).toLocaleString('fr-FR')}
                </td>
                <td className="px-3 py-2">{PROVIDER_LABELS[r.provider] || r.provider}</td>
                <td className="px-3 py-2 text-slate-400 text-xs">
                  {r.period_start ? r.period_start.slice(0, 10) : '—'}
                </td>
                <td className="px-3 py-2 text-right">{fmtTokens(r.input_tokens)}</td>
                <td className="px-3 py-2 text-right">{fmtTokens(r.output_tokens)}</td>
                <td className="px-3 py-2 text-right">{fmtTokens(r.requests)}</td>
                <td className="px-3 py-2 text-right">{fmtCurrency(r.cost_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
