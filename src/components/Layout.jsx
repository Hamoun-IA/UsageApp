import {
  LayoutDashboard,
  History,
  BellRing,
  Settings as SettingsIcon,
  RefreshCw,
  Activity,
} from 'lucide-react';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'history', label: 'Historique', icon: History },
  { id: 'alerts', label: 'Alertes', icon: BellRing },
  { id: 'settings', label: 'Paramètres', icon: SettingsIcon },
];

export default function Layout({ route, onRoute, onRefresh, refreshing, status, children }) {
  return (
    <div className="flex h-full bg-slate-950 text-slate-100">
      <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-900/40 flex flex-col">
        <div className="p-5 flex items-center gap-2">
          <Activity className="w-5 h-5 text-brand-500" />
          <div>
            <div className="font-semibold leading-tight">AI Usage</div>
            <div className="text-xs text-slate-400 leading-tight">Monitor</div>
          </div>
        </div>
        <nav className="flex-1 px-2 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = route === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onRoute(item.id)}
                className={
                  'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition ' +
                  (active
                    ? 'bg-brand-600/20 text-brand-100 ring-1 ring-brand-500/40'
                    : 'text-slate-300 hover:bg-slate-800/60')
                }
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-3 text-xs text-slate-500 border-t border-slate-800">
          v{status?.version || '0.1.0'}
          {status && status.encryptionAvailable === false && (
            <div className="mt-1 text-amber-400">
              ⚠ Chiffrement OS indisponible — clés stockées en clair.
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-800 flex items-center px-6 justify-between">
          <div className="text-sm text-slate-400">
            {status?.lastRunAt ? (
              <>
                Dernière collecte :{' '}
                <span className="text-slate-200">
                  {new Date(status.lastRunAt).toLocaleString('fr-FR')}
                </span>
              </>
            ) : (
              <>Aucune collecte effectuée pour l'instant.</>
            )}
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-sm font-medium"
          >
            <RefreshCw className={'w-4 h-4 ' + (refreshing ? 'animate-spin' : '')} />
            Rafraîchir
          </button>
        </header>
        <div className="flex-1 overflow-auto p-6">{children}</div>
      </main>
    </div>
  );
}
