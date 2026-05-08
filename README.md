# AI Usage Monitor

Application Windows (Electron + React) pour surveiller l'usage et les coûts de
plusieurs services d'IA dans une seule interface :

- **Anthropic Claude** — via l'Admin API (`/v1/organizations/usage_report/messages` + `/v1/organizations/cost_report`)
- **OpenAI** — via l'Admin API (`/v1/organization/usage/completions` + `/v1/organization/costs`)
- **Ollama** — service local (modèles installés / chargés, coût nul)
- **Z.ai (GLM)** — validation de clé + état (Z.ai n'expose pas encore d'endpoint usage public)

## Fonctionnalités

- Dashboard avec coût mensuel, tokens consommés, requêtes, état par provider
- Graphiques d'évolution sur 30 jours (coût + tokens, par provider)
- Quotas mensuels (budget $ et tokens) par provider avec barres de progression
- Système d'alertes avec notifications Windows natives (% budget, % tokens, coût absolu) + cooldown 6 h
- Stockage des clés API chiffré via `safeStorage` (DPAPI sous Windows)
- Collecte périodique automatique en tâche de fond (icône tray)
- Historique consultable avec filtres
- Persistance SQLite locale (`%APPDATA%/ai-usage-monitor/usage.sqlite`)

## Prérequis

- Node.js 20+
- npm 10+
- Windows 10/11

> `better-sqlite3` est natif : `npm install` invoque automatiquement `electron-builder install-app-deps` pour le rebuilder contre la version d'Electron.
> Si vous changez de version d'Electron, relancez `npm run rebuild`.

## Démarrage

```powershell
cd "C:\Codex\UsageApp\Usage App"
npm install
npm run dev
```

`npm run dev` lance Vite (port 5173) et Electron en parallèle, avec hot-reload de l'UI React.

## Build d'un installeur Windows

```powershell
npm run dist            # NSIS + portable, x64
npm run dist:portable   # uniquement portable .exe
```

Les artifacts sont produits dans `release/`.

> Pour un installeur joliment iconisé, déposez `build/icon.ico` (256×256) avant de builder.
> Pour la signature de code et l'auto-update via GitHub Releases, complétez la section `build.publish` de `package.json` et configurez les variables d'env `CSC_LINK` / `CSC_KEY_PASSWORD` (cf. docs `electron-builder`).

## Configuration des providers

Onglet **Paramètres** → pour chaque provider :

| Provider   | Type de clé recommandé                    | Où la créer                                                  |
|------------|--------------------------------------------|--------------------------------------------------------------|
| Anthropic  | Admin Key (`sk-ant-admin01-…`)             | console.anthropic.com → Settings → API keys → Admin keys     |
| OpenAI     | Admin Key (`sk-admin-…`)                   | platform.openai.com → Organization → Admin keys              |
| Ollama     | Aucune (URL locale `http://localhost:11434`)| —                                                            |
| Z.ai       | API Key utilisateur                        | z.ai dashboard                                               |

Sans clé Admin, les endpoints d'usage répondront 401 et l'app affichera un message explicite. Une clé utilisateur classique ne suffit pas pour Anthropic et OpenAI.

## Architecture

```
electron/
  main.js          # Process principal Electron, fenêtre, tray, IPC
  preload.js       # Bridge sécurisé contextIsolation
  db.js            # SQLite (better-sqlite3) — schéma, requêtes
  secrets.js       # safeStorage (DPAPI sur Windows)
  scheduler.js     # Poll périodique des providers
  notifier.js      # Notifications Windows + évaluation alertes
  providers/
    index.js
    anthropic.js   # Admin API Anthropic
    openai.js      # Admin API OpenAI
    ollama.js      # /api/tags + /api/ps (local)
    zai.js         # /models (validation clé)
src/
  App.jsx          # Routing + état global léger
  components/
    Layout.jsx     # Sidebar + header
    Dashboard.jsx  # KPIs + cartes provider + graphes recharts
    Settings.jsx   # Config providers, clés, quotas, intervalle
    Alerts.jsx     # CRUD alertes
    History.jsx    # Table de toutes les snapshots
  lib/api.js       # Wrapper window.api + helpers de format
```

Toutes les communications renderer ↔ main passent par IPC (`contextIsolation: true`,
`nodeIntegration: false`). Les clés API ne quittent jamais le main process en clair.

## Étendre l'app

Ajouter un provider :

1. Créez `electron/providers/<id>.js` exportant `{ label, requiresApiKey, ping, fetchUsage }`.
2. Référencez-le dans `electron/providers/index.js`.
3. Ajoutez son label/couleur dans `src/lib/api.js` (`PROVIDER_LABELS`, `PROVIDER_COLORS`).
4. Insérez sa config par défaut dans la migration `electron/db.js` (`defaults` array).

Les snapshots sont normalisés au schéma `{ provider, period_start, period_end,
input_tokens, output_tokens, requests, cost_usd, model, raw_json }`. Tout le reste de
l'app (UI, alertes, agrégations) fonctionne automatiquement.
