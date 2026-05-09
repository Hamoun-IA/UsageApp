# AI Usage Monitor

Tray widget Windows pour suivre les limites de tes abonnements IA personnels :
**Claude Pro/Max**, **ChatGPT Plus** (via Codex CLI sessions), **Ollama Cloud Pro**, **Z.ai Coding Plan**.

L'app vit dans la system tray. Clic gauche sur l'icône → popup widget de ~340×N px qui affiche les barres
session 5h + weekly de chaque provider connecté. Double-clic → fenêtre détaillée 1200×800 (Dashboard,
History, Alerts, Settings).

Inspirée de [CodexBar](https://github.com/erans/codexbar).

## Captures

_(à venir)_

## Install (dev)

```bash
git clone <this repo>
cd "AI Usage Monitor"
npm install
npm run dev
```

`npm run dev` lance Vite + Electron en parallèle. L'icône tray apparaît, la fenêtre détaillée reste cachée
jusqu'à action user.

## Connexions

Chaque provider a sa propre méthode d'auth, capturée via webview Electron :

| Provider | Méthode | Notes |
|---|---|---|
| **Claude Pro/Max** | Login `claude.ai`, capture des cookies de session (sessionKey + organization id). | Refresh = appel à `claude.ai/api/organizations/.../usage`. |
| **ChatGPT Plus (Codex)** | Login `chatgpt.com`, capture du cookie de session. | Refresh = `chatgpt.com/backend-api/wham/usage`. Lit aussi `~/.codex/sessions/*.jsonl` pour la session locale. |
| **Ollama Cloud Pro** | Login `ollama.com`, capture des cookies. | Refresh = `ollama.com/settings`. |
| **Z.ai Coding Plan** | Login `z.ai`, capture du JWT. | Refresh = `api.z.ai/api/monitor/usage/quota/limit`. |

Tous les secrets (cookies, JWT) sont chiffrés avec **DPAPI** (`safeStorage`) et stockés dans le user
data directory de Windows.

## Build (production)

```bash
npm run build              # vite build → dist/
npm run dist               # NSIS installer + portable .exe → release/
npm run dist:portable      # portable only
```

Output dans `release/`. Tester l'installeur sur ta machine avant publication.

## Configuration

**Settings → Connexions** : connecter/déconnecter chaque provider.

**Settings → Démarrage automatique** : lance l'app au démarrage Windows (mode tray-only).

**Settings → Fréquence de rafraîchissement** : 1 / 5 / 15 minutes (défaut 5). Cadence du polling background.

**Settings → Raccourci global** : combinaison clavier qui ouvre/ferme le widget popup. Défaut
`Ctrl+Shift+Alt+U`. Press-to-record : clique "Modifier", appuie sur la nouvelle combinaison, Esc pour
annuler.

**Settings → Rétention DB** : période après laquelle les snapshots sont prunés au prochain boot
(7 / 30 / 90 / 180 jours).

**Alerts** : seuils par provider (session %, weekly %, erreur persistante en heures). Cooldown 6h entre
notifications du même type pour le même provider.

## Architecture

- `electron/main.js` — boot tray, wire Poller, register shortcut, BrowserWindow show:false
- `electron/poller.js` — single configurable interval, skip-if-running guard
- `electron/refresh-providers.js` — helper "refresh + insertSnapshot + evaluateAlerts"
- `electron/notify.js` — bundle native toasts par provider
- `electron/tray-state.js` — swap icône tray normal ↔ critical selon alertLog 6h
- `electron/alerts.js` — évalue snap vs seuils, met à jour alertLog, retourne newAlerts
- `electron/db.js` — SQLite v2 schema (snapshots, provider_settings, app_prefs)
- `electron/providers/{claude,codex,ollama,zai}.js` — adapters par provider
- `src/widget/` — React UI du popup tray (~340×N px)
- `src/detail/` — React UI de la fenêtre détaillée (4 pages)

## Tests

```bash
npm test           # full suite
npm run test:watch # watch mode
```

~260 tests Vitest + happy-dom. Pas d'E2E Electron — smoke test manuel pour les flows critiques.

## Troubleshooting

**Tray icon ne s'affiche pas** : vérifier que `build/tray-normal.png` existe. Sinon : `node scripts/generate-tray-icons.js`.

**`better-sqlite3` mismatch ABI au lancement** : `npm rebuild better-sqlite3` (Electron) ou
`npm run rebuild` pour rebuild explicite contre Electron.

**Raccourci global "déjà utilisé"** : un autre process Windows a déjà capturé la combinaison.
Choisis-en une autre dans Settings, ou redémarre l'app après avoir fermé l'autre process.

**Notifications ne s'affichent pas** : Settings Windows → Notifications → vérifier que l'app est autorisée.

## License

MIT
