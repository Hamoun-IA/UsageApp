import { useEffect, useState } from 'react';
import { Trash2, BellPlus } from 'lucide-react';
import { api, PROVIDER_LABELS } from '../lib/api.js';

const KINDS = [
  { id: 'budget_pct', label: '% du budget mensuel', unit: '%' },
  { id: 'tokens_pct', label: '% des tokens mensuels', unit: '%' },
  { id: 'absolute_cost', label: 'Coût mensuel absolu', unit: '$' },
];

export default function Alerts({ refreshTick }) {
  const [alerts, setAlerts] = useState([]);
  const [draft, setDraft] = useState({
    provider: 'anthropic',
    kind: 'budget_pct',
    threshold: 80,
    enabled: true,
  });

  useEffect(() => {
    api.getAlerts().then(setAlerts).catch(console.error);
  }, [refreshTick]);

  async function add() {
    if (!draft.threshold) return;
    await api.addAlert({
      ...draft,
      threshold: Number(draft.threshold),
    });
    const a = await api.getAlerts();
    setAlerts(a || []);
  }

  async function del(id) {
    await api.deleteAlert(id);
    const a = await api.getAlerts();
    setAlerts(a || []);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="font-semibold mb-1">Nouvelle alerte</h3>
        <p className="text-xs text-slate-400 mb-3">
          Une notification Windows est envoyée dès qu'un seuil est franchi (cooldown 6 h).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={draft.provider}
            onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
            className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-sm"
          >
            {Object.entries(PROVIDER_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
            className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-sm"
          >
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={draft.threshold}
              onChange={(e) => setDraft({ ...draft, threshold: e.target.value })}
              className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-sm"
            />
            <span className="text-sm text-slate-400">
              {KINDS.find((k) => k.id === draft.kind)?.unit}
            </span>
          </div>
          <button
            onClick={add}
            className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded bg-brand-600 hover:bg-brand-700 text-sm font-medium"
          >
            <BellPlus className="w-4 h-4" /> Ajouter
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-950/60 text-slate-400">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Provider</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-left px-3 py-2 font-medium">Seuil</th>
              <th className="text-left px-3 py-2 font-medium">Dernière notif</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {alerts.length === 0 && (
              <tr>
                <td colSpan="5" className="px-3 py-6 text-center text-slate-500">
                  Aucune alerte configurée.
                </td>
              </tr>
            )}
            {alerts.map((a) => {
              const kind = KINDS.find((k) => k.id === a.kind);
              return (
                <tr key={a.id}>
                  <td className="px-3 py-2">{PROVIDER_LABELS[a.provider] || a.provider}</td>
                  <td className="px-3 py-2 text-slate-300">{kind?.label || a.kind}</td>
                  <td className="px-3 py-2">
                    {a.threshold} {kind?.unit}
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs">
                    {a.last_fired_at
                      ? new Date(a.last_fired_at).toLocaleString('fr-FR')
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => del(a.id)}
                      className="text-slate-400 hover:text-rose-400"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
