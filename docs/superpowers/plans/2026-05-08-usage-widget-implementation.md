# AI Usage Monitor — Widget Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactorer l'AI Usage Monitor d'un dashboard org-level Admin API vers un widget tray discret tracking 4 abonnements perso (Claude Pro/Max, ChatGPT Plus, Ollama Cloud Pro, Z.ai Coding Plan), avec auth scraping via webview embarquée, file-watchers pour les CLIs, et fenêtre détaillée backup.

**Architecture:** Electron + React (existant). Adapters par provider avec interface unifiée (`connect/disconnect/refresh/subscribe`). Modèle `Snapshot` unifié persisté en SQLite. Secrets (JWT, cookies) en `safeStorage`. Widget = `BrowserWindow` frameless 340×520 invocable au tray ou raccourci global. Fenêtre détaillée = `BrowserWindow` classique avec sidebar Dashboard/History/Alerts/Settings.

**Tech Stack:** Electron 33 (CommonJS), React 18 + Vite 5, Tailwind 3, `better-sqlite3`, Vitest (à ajouter), `cheerio` (HTML parse Ollama), `chokidar` (file-watching cross-platform).

**Spec source:** [docs/superpowers/specs/2026-05-08-usage-widget-design.md](../specs/2026-05-08-usage-widget-design.md)

---

## Milestones

| # | Milestone | Statut plan |
|---|-----------|-------------|
| 1 | Foundation : tests, deps, cleanup, interfaces | Détaillé ci-dessous |
| 2 | Z.ai end-to-end + widget skeleton (proof of architecture) | Détaillé ci-dessous |
| 3 | 3 autres providers (Ollama, Claude, Codex) | Plan détaillé à écrire post-M2 |
| 4 | Fenêtre détaillée (Dashboard, History, Alerts, Settings) | Plan détaillé à écrire post-M3 |
| 5 | Polish (notifs, autostart, shortcut, tray overlay, quit logic) | Plan détaillé à écrire post-M4 |

**Pourquoi ce phasage** : M2 prouve l'architecture end-to-end (du clic tray au JSON Z.ai parsé jusqu'à l'affichage React). Une fois validé, M3 réplique le pattern aux 3 autres providers. M4-M5 sont planifiés à part car les apprentissages de M1-M3 affineront les choix d'UI/UX.

---

## File Structure

### Nouveaux fichiers

```
electron/
  providers/
    types.js              # Adapter interface + Snapshot shape (JSDoc)
    base-http.js          # Helper class pour adapters HTTP poll (Z.ai, Ollama)
    base-file.js          # Helper class pour adapters file-watch (Claude, Codex)
  widget-window.js        # BrowserWindow widget popup
  shortcuts.js            # globalShortcut registration
  ipc.js                  # IPC handlers, séparés de main.js
src/
  widget/                 # Entry point widget (séparé du detail window)
    main.jsx
    Widget.jsx
    ProviderRow.jsx
    ProviderTabs.jsx
    components/
      ProgressBar.jsx
      StatusDot.jsx
      ResetTimer.jsx
  detail/                 # Entry point detail window (refactor de l'existant)
    main.jsx
    App.jsx
    pages/
      Dashboard.jsx
      History.jsx
      Alerts.jsx
      Settings.jsx
    components/
      ProviderConnectCard.jsx
  shared/
    snapshot-utils.js     # Helpers : isStale, formatResetTime, severityFor
tests/
  providers/
    zai.test.js
    ollama.test.js
    claude.test.js
    codex.test.js
  shared/
    snapshot-utils.test.js
widget.html               # Vite entry HTML pour le widget
```

### Fichiers modifiés

```
package.json              # +deps : vitest, cheerio, chokidar. +scripts test
vite.config.js            # Multi-page (widget + detail), watch-ignore .superpowers/
electron/main.js          # Refactor : 2 windows + tray + shortcut + IPC delegation
electron/preload.js       # Nouvelle API : connect/disconnect/refresh/subscribe
electron/db.js            # Schéma : drop snapshots, create usage_snapshots
electron/secrets.js       # Helpers nouveaux : getProviderSecret/setProviderSecret
electron/scheduler.js     # Refactor : per-provider cadence + file-watch trigger
electron/notifier.js      # Adapté aux nouveaux seuils (session/weekly%)
electron/providers/index.js  # Registry des 4 nouveaux adapters
src/lib/api.js            # Wrapper IPC nouvelle API
README.md                 # MAJ : nouveau use case, plus d'Admin API
.gitignore                # Déjà mis à jour M0
```

### Fichiers supprimés

```
electron/providers/anthropic.js   # Admin API obsolète
electron/providers/openai.js      # idem
electron/providers/ollama.js      # rewrite from scratch (ne réutilise rien)
electron/providers/zai.js         # idem
src/components/Dashboard.jsx      # Replaced by src/detail/pages/Dashboard.jsx (différent contenu)
src/components/History.jsx        # idem
src/components/Settings.jsx       # idem
src/components/Alerts.jsx         # idem
src/components/Layout.jsx         # Refait sous src/detail/App.jsx
src/App.jsx                       # Renommé/déplacé src/detail/App.jsx
src/main.jsx                      # Renommé/déplacé src/detail/main.jsx
```

---

# Milestone 1 — Foundation

**Objectif M1** : préparer le terrain pour la suite. À la fin, l'app se lance sans crash, la DB a le nouveau schéma, les tests tournent, les 4 adapters ont des stubs avec interface unifiée, et tout le code obsolète est parti. Aucune fonctionnalité visible nouvelle pour l'utilisateur, juste une base propre.

### Task 1.1: Branche feature + setup Vitest

**Files:**
- Create: `vitest.config.js`
- Modify: `package.json:10-20`

- [ ] **Step 1: Créer la branche de travail**

```bash
git checkout -b feat/widget-pivot
```

- [ ] **Step 2: Installer Vitest et happy-dom (DOM léger pour tests UI)**

```bash
npm install --save-dev vitest @vitest/ui happy-dom
```

- [ ] **Step 3: Créer `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
```

- [ ] **Step 4: Ajouter scripts test dans `package.json`**

Modifier la section `"scripts"` :
```json
"scripts": {
  "dev": "concurrently -k \"npm:dev:vite\" \"npm:dev:electron\"",
  "dev:vite": "vite",
  "dev:electron": "wait-on http://localhost:5173 && cross-env NODE_ENV=development electron .",
  "build": "vite build",
  "rebuild": "electron-rebuild -f -w better-sqlite3",
  "postinstall": "electron-builder install-app-deps",
  "dist": "npm run build && electron-builder --win --x64",
  "dist:portable": "npm run build && electron-builder --win portable --x64",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui"
}
```

- [ ] **Step 5: Créer un test sentinel pour vérifier l'install**

`tests/setup.test.js` :
```js
import { describe, it, expect } from 'vitest';
describe('vitest setup', () => {
  it('runs', () => { expect(1 + 1).toBe(2); });
});
```

- [ ] **Step 6: Run sentinel**

Run: `npm test`
Expected: 1 test passé.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.js tests/setup.test.js package.json package-lock.json
git commit -m "chore: add vitest test infrastructure"
```

### Task 1.2: Ajout deps cheerio + chokidar

**Files:** `package.json:21-25`

- [ ] **Step 1: Installer**

```bash
npm install cheerio chokidar
```

- [ ] **Step 2: Vérifier installation**

Run: `node -e "console.log(require('cheerio').load('<p>ok</p>')('p').text())"`
Expected: `ok`

Run: `node -e "console.log(typeof require('chokidar').watch)"`
Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add cheerio + chokidar deps for HTML parse and file watching"
```

### Task 1.3: Vite — ignorer `.superpowers/` du watch

**Files:** `vite.config.js`

- [ ] **Step 1: Lire le fichier actuel**

Run: `cat vite.config.js` (ou Read tool)

- [ ] **Step 2: Ajouter `server.watch.ignored` config**

Modifier `vite.config.js` pour inclure :
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/.superpowers/**', '**/node_modules/**'],
    },
  },
});
```

(Note : la config multi-page Vite arrive en M2 quand on aura `widget.html`. Pour l'instant on garde `index.html` comme entry unique.)

- [ ] **Step 3: Lancer dev server, écrire dans `.superpowers/test.html`, vérifier pas de hot-reload**

Run: `npm run dev` (background)
Touch un fichier dans `.superpowers/` ou attendre.
Expected: pas de "page reload" log côté Vite.
Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add vite.config.js
git commit -m "chore: ignore .superpowers/ from Vite watch"
```

### Task 1.4: Suppression code provider obsolète + components React obsolètes

**Files:**
- Delete: `electron/providers/anthropic.js`, `openai.js`, `ollama.js`, `zai.js`
- Delete: `src/components/Dashboard.jsx`, `History.jsx`, `Settings.jsx`, `Alerts.jsx`, `Layout.jsx`
- Modify: `electron/providers/index.js`, `src/App.jsx`

- [ ] **Step 1: Supprimer les 4 fichiers providers**

```bash
git rm electron/providers/anthropic.js electron/providers/openai.js electron/providers/ollama.js electron/providers/zai.js
```

- [ ] **Step 2: Supprimer les 5 fichiers components React**

```bash
git rm src/components/Dashboard.jsx src/components/History.jsx src/components/Settings.jsx src/components/Alerts.jsx src/components/Layout.jsx
```

- [ ] **Step 3: Vider `electron/providers/index.js` (placeholder)**

```js
// Registry des adapters de provider. Sera rempli en M1.6.
module.exports = { providers: {} };
```

- [ ] **Step 4: Réduire `src/App.jsx` à un placeholder qui dit "refonte en cours"**

```jsx
import React from 'react';

export default function App() {
  return (
    <div style={{ padding: 32, fontFamily: 'Segoe UI, sans-serif', color: '#9ca3af', background: '#0e1217', minHeight: '100vh' }}>
      <h1 style={{ color: '#e5e7eb' }}>AI Usage Monitor</h1>
      <p>Refonte en cours — widget tray + abonnements perso. Voir le plan d'implémentation.</p>
    </div>
  );
}
```

- [ ] **Step 5: Lancer l'app**

Run: `npm run dev`
Expected: la fenêtre Electron s'ouvre, affiche "Refonte en cours" sans crasher, console sans erreur fatale (warnings OK).
Stop.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove obsolete provider code and dashboard UI"
```

### Task 1.5: Définir Snapshot type + adapter interface

**Files:**
- Create: `electron/providers/types.js`
- Create: `tests/providers/types.test.js`

- [ ] **Step 1: Écrire test qui vérifie qu'un Snapshot bien formé passe la validation**

`tests/providers/types.test.js` :
```js
import { describe, it, expect } from 'vitest';
import { isValidSnapshot } from '../../electron/providers/types.js';

describe('Snapshot validation', () => {
  it('accepts a complete snapshot', () => {
    const s = {
      provider: 'zai',
      fetchedAt: Date.now(),
      sessionPct: 42,
      weeklyPct: 18,
      sessionResetAt: Date.now() + 3600_000,
      weeklyResetAt: Date.now() + 86400_000,
      planLevel: 'Pro',
      approximated: false,
      raw: {},
      error: null,
    };
    expect(isValidSnapshot(s)).toBe(true);
  });

  it('rejects snapshot missing required fields', () => {
    expect(isValidSnapshot({})).toBe(false);
    expect(isValidSnapshot({ provider: 'zai' })).toBe(false);
  });

  it('accepts snapshot with null pct (provider not configured)', () => {
    const s = {
      provider: 'codex',
      fetchedAt: Date.now(),
      sessionPct: null,
      weeklyPct: null,
      sessionResetAt: null,
      weeklyResetAt: null,
      planLevel: null,
      approximated: true,
      raw: null,
      error: { code: 'NOT_CONFIGURED', message: 'Run connect()', retriable: false },
    };
    expect(isValidSnapshot(s)).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer le test (doit échouer)**

Run: `npm test -- providers/types`
Expected: FAIL — `Cannot find module '../../electron/providers/types.js'`

- [ ] **Step 3: Implémenter `electron/providers/types.js`**

```js
/**
 * @typedef {Object} Snapshot
 * @property {string} provider           - 'claude' | 'codex' | 'ollama' | 'zai'
 * @property {number} fetchedAt          - epoch ms
 * @property {number|null} sessionPct    - 0..100 ou null si N/A
 * @property {number|null} weeklyPct
 * @property {number|null} sessionResetAt  - epoch ms ou null
 * @property {number|null} weeklyResetAt
 * @property {string|null} planLevel     - "Pro", "Max", etc.
 * @property {boolean} approximated      - true pour Codex
 * @property {object|null} raw           - payload brut (debug)
 * @property {ProviderError|null} error
 */

/**
 * @typedef {Object} ProviderError
 * @property {string} code     - 'NOT_CONFIGURED' | 'AUTH_EXPIRED' | 'NETWORK' | 'PARSE' | 'CLI_INACTIVE' | 'QUOTA_EXCEEDED'
 * @property {string} message
 * @property {boolean} retriable
 */

const REQUIRED_KEYS = [
  'provider', 'fetchedAt',
  'sessionPct', 'weeklyPct',
  'sessionResetAt', 'weeklyResetAt',
  'planLevel', 'approximated', 'raw', 'error',
];

function isValidSnapshot(s) {
  if (!s || typeof s !== 'object') return false;
  for (const k of REQUIRED_KEYS) {
    if (!(k in s)) return false;
  }
  if (typeof s.provider !== 'string') return false;
  if (typeof s.fetchedAt !== 'number') return false;
  if (typeof s.approximated !== 'boolean') return false;
  return true;
}

/**
 * Adapter interface every provider must implement.
 * Not enforced by JS — documentation only.
 *
 * @typedef {Object} ProviderAdapter
 * @property {string} id
 * @property {string} label
 * @property {'webview'|'cli-file'|'jsonl-tail'} authMode
 * @property {() => Promise<void>} connect
 * @property {() => Promise<void>} disconnect
 * @property {() => Promise<Snapshot>} refresh
 * @property {(cb: (s: Snapshot) => void) => () => void} subscribe
 */

module.exports = { isValidSnapshot };
```

- [ ] **Step 4: Run test**

Run: `npm test -- providers/types`
Expected: 3 tests passés.

- [ ] **Step 5: Commit**

```bash
git add electron/providers/types.js tests/providers/types.test.js
git commit -m "feat(providers): define Snapshot type and adapter interface"
```

### Task 1.6: Mise à jour schéma SQLite

**Files:**
- Modify: `electron/db.js`
- Create: `tests/db.test.js` (best-effort — better-sqlite3 nécessite un binaire natif, on testera en dummy si possible)

- [ ] **Step 1: Lire `electron/db.js` actuel pour comprendre la migration logic**

Use Read tool on `electron/db.js`.

- [ ] **Step 2: Ajouter migration v2 : drop ancienne table `snapshots`, créer `usage_snapshots`**

Dans `electron/db.js`, à l'endroit où la migration est gérée (chercher un schéma de version `user_version`), ajouter :

```js
function migrate(db) {
  const v = db.pragma('user_version', { simple: true });

  if (v < 2) {
    db.exec(`
      DROP TABLE IF EXISTS snapshots;
      DROP TABLE IF EXISTS provider_configs;
      DROP TABLE IF EXISTS quotas;

      CREATE TABLE usage_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        session_pct REAL,
        weekly_pct REAL,
        session_reset_at INTEGER,
        weekly_reset_at INTEGER,
        plan_level TEXT,
        approximated INTEGER NOT NULL DEFAULT 0,
        raw_json TEXT,
        error_json TEXT
      );
      CREATE INDEX idx_usage_snapshots_provider_fetched ON usage_snapshots (provider, fetched_at DESC);

      CREATE TABLE provider_settings (
        provider TEXT PRIMARY KEY,
        connected INTEGER NOT NULL DEFAULT 0,
        connected_at INTEGER,
        last_error TEXT
      );

      CREATE TABLE app_prefs (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    db.pragma('user_version = 2');
  }
}
```

(Adapter aux noms de fonctions existants. Le but est qu'au boot, l'ancienne table soit supprimée et la nouvelle créée.)

- [ ] **Step 3: Exposer helper `insertSnapshot(snap)` et `recentSnapshots(provider, sinceMs)`**

Ajouter à `electron/db.js` :

```js
function insertSnapshot(db, snap) {
  const stmt = db.prepare(`
    INSERT INTO usage_snapshots
      (provider, fetched_at, session_pct, weekly_pct,
       session_reset_at, weekly_reset_at, plan_level, approximated,
       raw_json, error_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    snap.provider,
    snap.fetchedAt,
    snap.sessionPct,
    snap.weeklyPct,
    snap.sessionResetAt,
    snap.weeklyResetAt,
    snap.planLevel,
    snap.approximated ? 1 : 0,
    snap.raw ? JSON.stringify(snap.raw) : null,
    snap.error ? JSON.stringify(snap.error) : null,
  );
}

function recentSnapshots(db, provider, sinceMs) {
  return db.prepare(`
    SELECT * FROM usage_snapshots
    WHERE provider = ? AND fetched_at >= ?
    ORDER BY fetched_at DESC
  `).all(provider, sinceMs);
}

module.exports = { /* existing exports */, insertSnapshot, recentSnapshots, migrate };
```

- [ ] **Step 4: Smoke test : delete `%APPDATA%/ai-usage-monitor/usage.sqlite`, lancer l'app, vérifier création**

```powershell
Remove-Item "$env:APPDATA\ai-usage-monitor\usage.sqlite" -ErrorAction SilentlyContinue
npm run dev
```

Expected: app boote, `usage.sqlite` recréé. Vérifier le schéma :
```powershell
sqlite3 "$env:APPDATA\ai-usage-monitor\usage.sqlite" ".schema usage_snapshots"
```
Expected: la définition CREATE TABLE qu'on a écrite.

- [ ] **Step 5: Commit**

```bash
git add electron/db.js
git commit -m "feat(db): migrate to usage_snapshots schema (v2)"
```

### Task 1.7: Stub des 4 adapters + registry

**Files:**
- Create: `electron/providers/zai.js`, `claude.js`, `codex.js`, `ollama.js`
- Modify: `electron/providers/index.js`

- [ ] **Step 1: Créer `electron/providers/zai.js` (stub)**

```js
const { EventEmitter } = require('events');

const id = 'zai';
const label = 'Z.ai';
const authMode = 'webview';

const emitter = new EventEmitter();

async function connect() {
  throw new Error('zai.connect not implemented (M2)');
}

async function disconnect() {
  // no-op stub
}

async function refresh() {
  return {
    provider: id,
    fetchedAt: Date.now(),
    sessionPct: null,
    weeklyPct: null,
    sessionResetAt: null,
    weeklyResetAt: null,
    planLevel: null,
    approximated: false,
    raw: null,
    error: { code: 'NOT_CONFIGURED', message: 'Adapter stub — implement in M2', retriable: false },
  };
}

function subscribe(cb) {
  emitter.on('snapshot', cb);
  return () => emitter.off('snapshot', cb);
}

module.exports = { id, label, authMode, connect, disconnect, refresh, subscribe };
```

- [ ] **Step 2: Créer `claude.js`, `codex.js`, `ollama.js` sur le même pattern**

Mêmes 4 fichiers, ne diffèrent que par `id`, `label`, `authMode` :
- `claude` : `authMode: 'cli-file'`, `label: 'Claude'`
- `codex` : `authMode: 'jsonl-tail'`, `label: 'Codex'`
- `ollama` : `authMode: 'webview'`, `label: 'Ollama'`

- [ ] **Step 3: Mettre à jour `electron/providers/index.js`**

```js
const claude = require('./claude');
const codex = require('./codex');
const ollama = require('./ollama');
const zai = require('./zai');

const providers = { claude, codex, ollama, zai };

function getAdapter(id) {
  const a = providers[id];
  if (!a) throw new Error(`Unknown provider: ${id}`);
  return a;
}

function listAdapters() {
  return Object.values(providers);
}

module.exports = { providers, getAdapter, listAdapters };
```

- [ ] **Step 4: Test d'intégration : appeler `refresh()` sur les 4 stubs et vérifier le shape**

`tests/providers/stubs.test.js` :
```js
import { describe, it, expect } from 'vitest';
import { listAdapters } from '../../electron/providers/index.js';
import { isValidSnapshot } from '../../electron/providers/types.js';

describe('Provider stubs', () => {
  it('all 4 stubs return valid snapshots from refresh()', async () => {
    const adapters = listAdapters();
    expect(adapters).toHaveLength(4);
    for (const a of adapters) {
      const snap = await a.refresh();
      expect(isValidSnapshot(snap)).toBe(true);
      expect(snap.provider).toBe(a.id);
      expect(snap.error?.code).toBe('NOT_CONFIGURED');
    }
  });
});
```

Run: `npm test -- providers/stubs`
Expected: 1 test passé.

- [ ] **Step 5: Commit**

```bash
git add electron/providers/ tests/providers/stubs.test.js
git commit -m "feat(providers): scaffold 4 adapter stubs with unified interface"
```

### Task 1.8: IPC scaffolding + preload API

**Files:**
- Create: `electron/ipc.js`
- Modify: `electron/preload.js`, `electron/main.js`

- [ ] **Step 1: Créer `electron/ipc.js`**

```js
const { ipcMain } = require('electron');
const { listAdapters, getAdapter } = require('./providers');

function registerIpcHandlers(deps) {
  const { db } = deps;

  ipcMain.handle('providers:list', () => {
    return listAdapters().map(a => ({ id: a.id, label: a.label, authMode: a.authMode }));
  });

  ipcMain.handle('providers:refresh', async (_e, providerId) => {
    const a = getAdapter(providerId);
    return a.refresh();
  });

  ipcMain.handle('providers:refreshAll', async () => {
    return Promise.all(listAdapters().map(a => a.refresh()));
  });

  ipcMain.handle('providers:connect', async (_e, providerId) => {
    const a = getAdapter(providerId);
    return a.connect();
  });

  ipcMain.handle('providers:disconnect', async (_e, providerId) => {
    const a = getAdapter(providerId);
    return a.disconnect();
  });
}

module.exports = { registerIpcHandlers };
```

- [ ] **Step 2: Mettre à jour `electron/preload.js`**

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  providers: {
    list:        () => ipcRenderer.invoke('providers:list'),
    refresh:     (id) => ipcRenderer.invoke('providers:refresh', id),
    refreshAll:  () => ipcRenderer.invoke('providers:refreshAll'),
    connect:     (id) => ipcRenderer.invoke('providers:connect', id),
    disconnect:  (id) => ipcRenderer.invoke('providers:disconnect', id),
  },
});
```

- [ ] **Step 3: Wire `registerIpcHandlers` dans `main.js`**

Dans `main.js`, après la création de la DB et avant la création de la BrowserWindow :

```js
const { registerIpcHandlers } = require('./ipc');
// ...
registerIpcHandlers({ db });
```

- [ ] **Step 4: Smoke test manuel**

`src/App.jsx` (placeholder) — ajouter un test rapide :

```jsx
import React, { useEffect, useState } from 'react';

export default function App() {
  const [providers, setProviders] = useState([]);
  const [refreshAll, setRefreshAll] = useState(null);

  useEffect(() => {
    window.api.providers.list().then(setProviders);
  }, []);

  return (
    <div style={{ padding: 32, fontFamily: 'Segoe UI, sans-serif', color: '#9ca3af', background: '#0e1217', minHeight: '100vh' }}>
      <h1 style={{ color: '#e5e7eb' }}>AI Usage Monitor</h1>
      <p>Refonte en cours.</p>
      <h3>Providers IPC test</h3>
      <pre>{JSON.stringify(providers, null, 2)}</pre>
      <button onClick={() => window.api.providers.refreshAll().then(setRefreshAll)}>Refresh all stubs</button>
      <pre>{JSON.stringify(refreshAll, null, 2)}</pre>
    </div>
  );
}
```

Run: `npm run dev`
Expected: l'UI affiche les 4 providers et après clic, 4 snapshots avec error code `NOT_CONFIGURED`.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc.js electron/preload.js electron/main.js src/App.jsx
git commit -m "feat(ipc): wire provider IPC handlers (list, refresh, connect, disconnect)"
```

### Task 1.9: Fin M1 — verify checkpoint

- [ ] **Step 1: Run la suite de tests complète**

Run: `npm test`
Expected: all tests pass (sentinel + types + stubs).

- [ ] **Step 2: Run dev server, smoke test manuel**

Run: `npm run dev`
Cliquer "Refresh all stubs", vérifier que les 4 lignes apparaissent avec `error.code = "NOT_CONFIGURED"`.

- [ ] **Step 3: Tag de fin de M1**

```bash
git tag m1-foundation
```

---

# Milestone 2 — Z.ai end-to-end + widget skeleton

**Objectif M2** : prouver l'architecture sur un provider complet (Z.ai), du `connect()` (webview JWT capture) au `refresh()` (API fetch + parse) jusqu'à l'affichage React dans une fenêtre widget popup invocable au tray. À la fin : clic sur tray → fenêtre popup s'ouvre → 1 ligne Z.ai avec données réelles.

### Task 2.1: Z.ai — parser pur (testable)

**Files:**
- Create: `electron/providers/zai-parser.js`
- Create: `tests/providers/zai-parser.test.js`

- [ ] **Step 1: Écrire test avec payload réel observé**

`tests/providers/zai-parser.test.js` :
```js
import { describe, it, expect } from 'vitest';
import { parseZaiResponse } from '../../electron/providers/zai-parser.js';

const sample = {
  code: 200,
  msg: '操作成功',
  data: {
    limits: [
      { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 0 },
      { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 1, nextResetTime: 1778688591979 },
      { type: 'TIME_LIMIT', unit: 5, number: 1, usage: 1000, currentValue: 0, remaining: 1000, percentage: 0, nextResetTime: 1780330191995 },
    ],
    level: 'pro',
  },
  success: true,
};

describe('parseZaiResponse', () => {
  it('extracts session and weekly from limits[]', () => {
    const result = parseZaiResponse(sample);
    expect(result.sessionPct).toBe(0);
    expect(result.weeklyPct).toBe(1);
    expect(result.weeklyResetAt).toBe(1778688591979);
    expect(result.planLevel).toBe('Pro');
  });

  it('returns null pcts when limits missing', () => {
    const empty = { code: 200, success: true, data: { limits: [], level: 'pro' } };
    const result = parseZaiResponse(empty);
    expect(result.sessionPct).toBeNull();
    expect(result.weeklyPct).toBeNull();
  });

  it('throws if response shape unexpected', () => {
    expect(() => parseZaiResponse({ code: 401 })).toThrow();
    expect(() => parseZaiResponse(null)).toThrow();
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

Run: `npm test -- zai-parser`
Expected: FAIL — module not found.

- [ ] **Step 3: Implémenter `electron/providers/zai-parser.js`**

```js
const UNIT_5H = 3;
const UNIT_WEEKLY = 6;

function parseZaiResponse(raw) {
  if (!raw || typeof raw !== 'object' || !raw.success || !raw.data) {
    throw new Error(`Unexpected Z.ai response: ${JSON.stringify(raw).slice(0, 200)}`);
  }
  const limits = raw.data.limits || [];
  const session = limits.find(l => l.type === 'TOKENS_LIMIT' && l.unit === UNIT_5H);
  const weekly = limits.find(l => l.type === 'TOKENS_LIMIT' && l.unit === UNIT_WEEKLY);
  const level = raw.data.level ? raw.data.level.charAt(0).toUpperCase() + raw.data.level.slice(1) : null;
  return {
    sessionPct: session ? session.percentage : null,
    weeklyPct: weekly ? weekly.percentage : null,
    sessionResetAt: session?.nextResetTime ?? null,
    weeklyResetAt: weekly?.nextResetTime ?? null,
    planLevel: level,
  };
}

module.exports = { parseZaiResponse };
```

- [ ] **Step 4: Run test (PASS)**

Run: `npm test -- zai-parser`
Expected: 3 tests passés.

- [ ] **Step 5: Commit**

```bash
git add electron/providers/zai-parser.js tests/providers/zai-parser.test.js
git commit -m "feat(zai): pure parser for usage/quota/limit response"
```

### Task 2.2: Z.ai refresh() — fetch + parse, JWT depuis safeStorage

**Files:**
- Modify: `electron/providers/zai.js`
- Modify: `electron/secrets.js` (ajouter helpers `getProviderSecret`/`setProviderSecret`)
- Create: `tests/providers/zai.test.js`

- [ ] **Step 1: Ajouter helpers dans `electron/secrets.js`**

```js
const { safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function secretsFilePath() {
  return path.join(app.getPath('userData'), 'secrets.json');
}

function loadAll() {
  try {
    return JSON.parse(fs.readFileSync(secretsFilePath(), 'utf-8'));
  } catch { return {}; }
}

function saveAll(map) {
  fs.writeFileSync(secretsFilePath(), JSON.stringify(map), { encoding: 'utf-8' });
}

function setProviderSecret(provider, plainText) {
  const map = loadAll();
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption not available');
  }
  map[provider] = safeStorage.encryptString(plainText).toString('base64');
  saveAll(map);
}

function getProviderSecret(provider) {
  const map = loadAll();
  if (!map[provider]) return null;
  const buf = Buffer.from(map[provider], 'base64');
  return safeStorage.decryptString(buf);
}

function clearProviderSecret(provider) {
  const map = loadAll();
  delete map[provider];
  saveAll(map);
}

module.exports = { setProviderSecret, getProviderSecret, clearProviderSecret };
```

- [ ] **Step 2: Écrire test pour `zai.refresh()` avec mock fetch + mock secrets**

`tests/providers/zai.test.js` :
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() },
}));

vi.mock('../../electron/secrets.js', () => ({
  getProviderSecret: vi.fn(),
  setProviderSecret: vi.fn(),
  clearProviderSecret: vi.fn(),
}));

describe('zai.refresh()', () => {
  beforeEach(() => { vi.clearAllMocks(); global.fetch = vi.fn(); });

  it('returns NOT_CONFIGURED when no token stored', async () => {
    const { getProviderSecret } = await import('../../electron/secrets.js');
    getProviderSecret.mockReturnValue(null);
    const zai = (await import('../../electron/providers/zai.js'));
    const snap = await zai.refresh();
    expect(snap.error.code).toBe('NOT_CONFIGURED');
    expect(snap.sessionPct).toBeNull();
  });

  it('returns parsed snapshot on success', async () => {
    const { getProviderSecret } = await import('../../electron/secrets.js');
    getProviderSecret.mockReturnValue('FAKE_JWT');
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, success: true, data: { limits: [
        { type: 'TOKENS_LIMIT', unit: 3, percentage: 12 },
        { type: 'TOKENS_LIMIT', unit: 6, percentage: 34, nextResetTime: 1778688591979 },
      ], level: 'pro' } }),
    });
    const zai = (await import('../../electron/providers/zai.js'));
    const snap = await zai.refresh();
    expect(snap.error).toBeNull();
    expect(snap.sessionPct).toBe(12);
    expect(snap.weeklyPct).toBe(34);
    expect(snap.planLevel).toBe('Pro');
  });

  it('returns AUTH_EXPIRED on 401', async () => {
    const { getProviderSecret } = await import('../../electron/secrets.js');
    getProviderSecret.mockReturnValue('FAKE_JWT');
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: 1001, success: false }),
    });
    const zai = (await import('../../electron/providers/zai.js'));
    const snap = await zai.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
  });

  it('returns NETWORK error on fetch throw', async () => {
    const { getProviderSecret } = await import('../../electron/secrets.js');
    getProviderSecret.mockReturnValue('FAKE_JWT');
    global.fetch.mockRejectedValue(new Error('ECONNRESET'));
    const zai = (await import('../../electron/providers/zai.js'));
    const snap = await zai.refresh();
    expect(snap.error.code).toBe('NETWORK');
    expect(snap.error.retriable).toBe(true);
  });
});
```

- [ ] **Step 3: Run test (FAIL)**

Run: `npm test -- providers/zai`
Expected: FAILs because zai.js still stub.

- [ ] **Step 4: Implémenter `electron/providers/zai.js`**

```js
const { EventEmitter } = require('events');
const { parseZaiResponse } = require('./zai-parser');
const { getProviderSecret, setProviderSecret, clearProviderSecret } = require('../secrets');

const id = 'zai';
const label = 'Z.ai';
const authMode = 'webview';
const ENDPOINT = 'https://api.z.ai/api/monitor/usage/quota/limit';

const emitter = new EventEmitter();

async function connect() {
  // Implémentation webview en Task 2.3
  throw new Error('zai.connect: webview flow not yet implemented (Task 2.3)');
}

async function disconnect() {
  clearProviderSecret(id);
}

function buildSnapshot(partial) {
  return {
    provider: id,
    fetchedAt: Date.now(),
    sessionPct: null,
    weeklyPct: null,
    sessionResetAt: null,
    weeklyResetAt: null,
    planLevel: null,
    approximated: false,
    raw: null,
    error: null,
    ...partial,
  };
}

async function refresh() {
  const token = getProviderSecret(id);
  if (!token) {
    return buildSnapshot({ error: { code: 'NOT_CONFIGURED', message: 'Connect Z.ai first', retriable: false } });
  }
  try {
    const resp = await fetch(ENDPOINT, { headers: { Authorization: token } });
    if (resp.status === 401 || resp.status === 403) {
      return buildSnapshot({ error: { code: 'AUTH_EXPIRED', message: 'Token expired — reconnect Z.ai', retriable: false } });
    }
    if (!resp.ok) {
      return buildSnapshot({ error: { code: 'NETWORK', message: `HTTP ${resp.status}`, retriable: true } });
    }
    const json = await resp.json();
    const parsed = parseZaiResponse(json);
    return buildSnapshot({ ...parsed, raw: json });
  } catch (e) {
    if (e.message?.includes('Unexpected Z.ai response')) {
      return buildSnapshot({ error: { code: 'PARSE', message: e.message, retriable: false } });
    }
    return buildSnapshot({ error: { code: 'NETWORK', message: e.message || String(e), retriable: true } });
  }
}

function subscribe(cb) {
  emitter.on('snapshot', cb);
  return () => emitter.off('snapshot', cb);
}

module.exports = { id, label, authMode, connect, disconnect, refresh, subscribe };
```

- [ ] **Step 5: Run tests (PASS)**

Run: `npm test -- providers/zai`
Expected: 4 tests passés.

- [ ] **Step 6: Commit**

```bash
git add electron/providers/zai.js electron/secrets.js tests/providers/zai.test.js
git commit -m "feat(zai): refresh() with HTTP fetch + parse + error mapping"
```

### Task 2.3: Z.ai connect() — webview JWT capture

**Files:**
- Modify: `electron/providers/zai.js`
- Create: `electron/providers/zai-connect.js` (logique webview, séparée pour testabilité)

- [ ] **Step 1: Implémenter `electron/providers/zai-connect.js`**

```js
const { BrowserWindow, session } = require('electron');

const LOGIN_URL = 'https://z.ai/manage-apikey/subscription';
const TOKEN_KEY = 'z-ai-open-platform-token-production';

/**
 * Ouvre une fenêtre, attend que l'user soit loggué (token apparaît
 * dans localStorage), retourne le JWT.
 */
async function captureZaiToken() {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 1024,
      height: 768,
      title: 'Connect to Z.ai',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'persist:zai-connect',
      },
    });

    let resolved = false;
    const cleanup = () => { if (!win.isDestroyed()) win.close(); };
    const finishOk = (token) => { if (resolved) return; resolved = true; cleanup(); resolve(token); };
    const finishErr = (err) => { if (resolved) return; resolved = true; cleanup(); reject(err); };

    win.on('closed', () => { if (!resolved) finishErr(new Error('User closed the window')); });

    const tryRead = async () => {
      try {
        const token = await win.webContents.executeJavaScript(
          `localStorage.getItem(${JSON.stringify(TOKEN_KEY)})`
        );
        if (token && typeof token === 'string' && token.length > 50) {
          finishOk(token);
        }
      } catch (e) { /* page navigation, retry */ }
    };

    win.webContents.on('did-finish-load', tryRead);
    win.webContents.on('did-navigate-in-page', tryRead);
    win.webContents.on('did-navigate', tryRead);

    // Polling de secours toutes les 1.5s (au cas où aucun event ne fire)
    const interval = setInterval(tryRead, 1500);
    const timeout = setTimeout(() => finishErr(new Error('Connect Z.ai: timeout (5 min)')), 5 * 60 * 1000);

    win.on('closed', () => { clearInterval(interval); clearTimeout(timeout); });

    win.loadURL(LOGIN_URL);
  });
}

module.exports = { captureZaiToken };
```

- [ ] **Step 2: Wire dans `zai.js`**

Remplacer `connect()` :
```js
const { captureZaiToken } = require('./zai-connect');

async function connect() {
  const token = await captureZaiToken();
  setProviderSecret(id, token);
}
```

- [ ] **Step 3: Smoke test manuel**

Add à `App.jsx` :
```jsx
<button onClick={() => window.api.providers.connect('zai')}>Connect Z.ai</button>
```

Run: `npm run dev`
Cliquer "Connect Z.ai" → fenêtre Z.ai s'ouvre, login, fenêtre se ferme.
Cliquer "Refresh all stubs" → la ligne `zai` doit retourner des data réelles (sessionPct, weeklyPct, planLevel).

- [ ] **Step 4: Vérifier que le secret est bien stocké et chiffré**

Inspecter `%APPDATA%\ai-usage-monitor\secrets.json` :
Expected : objet JSON avec clé `zai` mappant un blob base64 (pas de JWT en clair).

- [ ] **Step 5: Commit**

```bash
git add electron/providers/zai-connect.js electron/providers/zai.js src/App.jsx
git commit -m "feat(zai): connect() captures JWT via Electron BrowserWindow"
```

### Task 2.4: Vite multi-page (widget + detail entries)

**Files:**
- Create: `widget.html`
- Create: `src/widget/main.jsx`, `src/widget/Widget.jsx`
- Create: `src/detail/main.jsx`, `src/detail/App.jsx` (déplace l'ancien)
- Modify: `vite.config.js`, `index.html`

- [ ] **Step 1: Bouger `src/main.jsx` → `src/detail/main.jsx`**

Le contenu reste identique au `src/main.jsx` actuel mais l'import devient `./App` qu'on va créer.

- [ ] **Step 2: Créer `src/detail/App.jsx` (placeholder)**

```jsx
import React from 'react';

export default function App() {
  return (
    <div style={{ padding: 32, fontFamily: 'Segoe UI, sans-serif', color: '#9ca3af', background: '#0e1217', minHeight: '100vh' }}>
      <h1 style={{ color: '#e5e7eb' }}>AI Usage Monitor — Detailed View</h1>
      <p>Sera implémenté en M4.</p>
    </div>
  );
}
```

- [ ] **Step 3: Modifier `index.html` (entry detail)**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>AI Usage Monitor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/detail/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Créer `widget.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>AI Usage Monitor — Widget</title>
    <style>
      html, body { background: transparent; margin: 0; padding: 0; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/widget/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Créer `src/widget/main.jsx` et `src/widget/Widget.jsx`**

`src/widget/main.jsx` :
```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import Widget from './Widget';
createRoot(document.getElementById('root')).render(<Widget />);
```

`src/widget/Widget.jsx` (placeholder pour M2 — vrai contenu en Task 2.6) :
```jsx
import React, { useEffect, useState } from 'react';

export default function Widget() {
  const [snaps, setSnaps] = useState(null);
  const refresh = () => window.api.providers.refreshAll().then(setSnaps);

  useEffect(() => { refresh(); }, []);

  return (
    <div style={{ width: 320, background: '#0e1217', color: '#e5e7eb', padding: 14, fontFamily: 'Segoe UI, sans-serif', fontSize: 12, height: '100vh' }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>AI Usage</div>
      <button onClick={refresh}>↻</button>
      <pre style={{ marginTop: 12, fontSize: 10 }}>{JSON.stringify(snaps, null, 2)}</pre>
    </div>
  );
}
```

- [ ] **Step 6: Modifier `vite.config.js` pour multi-page**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        widget: resolve(__dirname, 'widget.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/.superpowers/**', '**/node_modules/**'],
    },
  },
});
```

- [ ] **Step 7: Smoke test**

Run: `npm run dev`
Naviguer manuellement vers `http://localhost:5173/widget.html` dans un browser → page widget s'affiche.
La fenêtre Electron continue de charger `index.html` (detail) — pour l'instant.

- [ ] **Step 8: Commit**

```bash
git add widget.html index.html src/widget/ src/detail/ vite.config.js
git commit -m "feat(ui): split into widget and detail entry points"
```

### Task 2.5: Widget BrowserWindow + tray click

**Files:**
- Create: `electron/widget-window.js`
- Modify: `electron/main.js`

- [ ] **Step 1: Créer `electron/widget-window.js`**

```js
const { BrowserWindow, screen, Tray } = require('electron');
const path = require('path');

let widgetWin = null;

function getWidgetUrl() {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5173/widget.html';
  }
  return `file://${path.join(__dirname, '..', 'dist', 'widget.html')}`;
}

function createWidgetWindow() {
  if (widgetWin && !widgetWin.isDestroyed()) return widgetWin;
  widgetWin = new BrowserWindow({
    width: 340,
    height: 540,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  widgetWin.loadURL(getWidgetUrl());
  widgetWin.on('blur', () => { if (widgetWin && !widgetWin.isDestroyed()) widgetWin.hide(); });
  return widgetWin;
}

function positionNearTray(tray) {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const work = display.workArea;
  const w = widgetWin.getBounds().width;
  const h = widgetWin.getBounds().height;
  // Bottom-right Windows : tray en bas-droite → popup au-dessus du tray
  const x = Math.min(trayBounds.x + (trayBounds.width / 2) - (w / 2), work.x + work.width - w - 8);
  const y = trayBounds.y - h - 8;
  widgetWin.setPosition(Math.round(x), Math.round(Math.max(work.y + 8, y)));
}

function toggleWidget(tray) {
  const w = createWidgetWindow();
  if (w.isVisible()) {
    w.hide();
  } else {
    positionNearTray(tray);
    w.show();
    w.focus();
  }
}

module.exports = { createWidgetWindow, toggleWidget };
```

- [ ] **Step 2: Modifier `electron/main.js` pour wire tray + widget**

Dans `main.js`, dans la création du Tray (ou en créer un si absent) :

```js
const { Tray, Menu, app, BrowserWindow } = require('electron');
const path = require('path');
const { toggleWidget } = require('./widget-window');

let tray = null;

function createTray() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png'); // fallback si .ico absent
  tray = new Tray(iconPath);
  tray.setToolTip('AI Usage Monitor');
  tray.on('click', () => toggleWidget(tray));
  tray.on('double-click', () => {
    // Double-clic ouvrira la fenêtre détaillée — wire en M4
  });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Widget', click: () => toggleWidget(tray) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

app.whenReady().then(() => {
  // ... existing init (db, ipc, etc.)
  createTray();
});
```

(Note : si `build/icon.png` n'existe pas, créer un PNG 32×32 placeholder. Cf. Step 3.)

- [ ] **Step 3: Créer une icône placeholder**

Si `build/icon.png` n'existe pas, créer un PNG 32×32 simple. Soit via un outil, soit programmatiquement avec un Buffer base64 dans une commande Node :

```bash
node -e "require('fs').writeFileSync('build/icon.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAH0lEQVR42u3QAQ0AAAjDsJN+UVHBjzWQbBjKy9YH/QAcAAAAAQAAAQAAAAEAAAAAAAEAAAEAAAEAAAEAAAEBAAEBAAEBAAEBAAEAAQABAAEAAQAA', 'base64'));"
```

(Adapter à un vrai icône plus tard.)

- [ ] **Step 4: Smoke test manuel**

Run: `npm run dev`
Une icône doit apparaître dans le tray Windows. Clic gauche → fenêtre widget s'ouvre près du tray, affiche le placeholder JSON. Clic en dehors → se cache. Re-clic → ré-apparaît.

- [ ] **Step 5: Commit**

```bash
git add electron/widget-window.js electron/main.js build/icon.png
git commit -m "feat(widget): tray icon + popup BrowserWindow with click-toggle"
```

### Task 2.6: Widget UI — afficher la ligne Z.ai correctement

**Files:**
- Modify: `src/widget/Widget.jsx`
- Create: `src/widget/components/ProviderRow.jsx`
- Create: `src/widget/components/ProgressBar.jsx`
- Create: `src/shared/snapshot-utils.js`
- Create: `tests/shared/snapshot-utils.test.js`

- [ ] **Step 1: Tests pour `snapshot-utils`**

`tests/shared/snapshot-utils.test.js` :
```js
import { describe, it, expect } from 'vitest';
import { formatRelativeTime, severityFor } from '../../src/shared/snapshot-utils.js';

describe('formatRelativeTime', () => {
  it('formats 30s ago', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toMatch(/30 ?s/);
  });
  it('formats 5min ago', () => {
    expect(formatRelativeTime(Date.now() - 5 * 60_000)).toMatch(/5 ?min/);
  });
  it('formats 2h ago', () => {
    expect(formatRelativeTime(Date.now() - 2 * 3600_000)).toMatch(/2 ?h/);
  });
});

describe('severityFor', () => {
  it('error → red', () => {
    expect(severityFor({ error: { code: 'NETWORK' }, sessionPct: null, weeklyPct: null })).toBe('error');
  });
  it('weekly > 95 → critical', () => {
    expect(severityFor({ error: null, sessionPct: 50, weeklyPct: 96 })).toBe('critical');
  });
  it('session > 90 → critical', () => {
    expect(severityFor({ error: null, sessionPct: 91, weeklyPct: 50 })).toBe('critical');
  });
  it('session > 80 → warn', () => {
    expect(severityFor({ error: null, sessionPct: 82, weeklyPct: 30 })).toBe('warn');
  });
  it('all green → ok', () => {
    expect(severityFor({ error: null, sessionPct: 30, weeklyPct: 30 })).toBe('ok');
  });
});
```

- [ ] **Step 2: Run (FAIL)**

Run: `npm test -- snapshot-utils`
Expected: FAIL.

- [ ] **Step 3: Implémenter `src/shared/snapshot-utils.js`**

```js
export function formatRelativeTime(epochMs) {
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s`;
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}min`;
  if (diff < 86_400_000) return `${Math.round(diff / 3600_000)}h`;
  return `${Math.round(diff / 86_400_000)}j`;
}

export function severityFor(snap) {
  if (snap.error) return 'error';
  if ((snap.weeklyPct ?? 0) >= 95) return 'critical';
  if ((snap.sessionPct ?? 0) >= 90) return 'critical';
  if ((snap.sessionPct ?? 0) >= 80) return 'warn';
  if ((snap.weeklyPct ?? 0) >= 80) return 'warn';
  return 'ok';
}

export function formatResetIn(epochMs) {
  if (!epochMs) return '';
  const diff = epochMs - Date.now();
  if (diff <= 0) return 'now';
  const h = Math.floor(diff / 3600_000);
  const m = Math.floor((diff % 3600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const PROVIDER_COLORS = {
  claude: '#f59e0b',  // orange
  codex:  '#10b981',  // vert
  ollama: '#a855f7',  // purple
  zai:    '#06b6d4',  // cyan
};

export const PROVIDER_LABELS = {
  claude: 'Claude',
  codex:  'Codex',
  ollama: 'Ollama',
  zai:    'Z.ai',
};
```

- [ ] **Step 4: Run (PASS)**

Run: `npm test -- snapshot-utils`
Expected: 8 tests passés.

- [ ] **Step 5: Créer `src/widget/components/ProgressBar.jsx`**

```jsx
import React from 'react';

export default function ProgressBar({ pct, color, dimmed = false }) {
  const width = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <div style={{ height: 6, background: '#1f2937', borderRadius: 3, overflow: 'hidden', opacity: dimmed ? 0.4 : 1 }}>
      <div style={{ width: `${width}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  );
}
```

- [ ] **Step 6: Créer `src/widget/components/ProviderRow.jsx`**

```jsx
import React from 'react';
import ProgressBar from './ProgressBar';
import { PROVIDER_COLORS, PROVIDER_LABELS, formatResetIn, severityFor } from '../../shared/snapshot-utils';

const ROW_BORDER = '#1f2937';

export default function ProviderRow({ snap, onConnectClick }) {
  const color = PROVIDER_COLORS[snap.provider];
  const label = PROVIDER_LABELS[snap.provider];
  const sev = severityFor(snap);

  if (snap.error?.code === 'NOT_CONFIGURED') {
    return (
      <div style={{ padding: '10px 0', borderBottom: `1px solid ${ROW_BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4b5563' }} />
          <span style={{ fontWeight: 500 }}>{label}</span>
        </div>
        <button onClick={() => onConnectClick(snap.provider)} style={{ background: 'transparent', color: '#9ca3af', border: '1px solid #374151', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
          Connecter
        </button>
      </div>
    );
  }

  if (snap.error) {
    return (
      <div style={{ padding: '10px 0', borderBottom: `1px solid ${ROW_BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
          <span style={{ fontWeight: 500 }}>{label}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#ef4444' }}>{snap.error.code}</span>
        </div>
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{snap.error.message}</div>
        {snap.error.code === 'AUTH_EXPIRED' && (
          <button onClick={() => onConnectClick(snap.provider)} style={{ background: 'transparent', color: '#f87171', border: '1px solid #7f1d1d', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, marginTop: 4 }}>
            🔒 Reconnect
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${ROW_BORDER}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <span style={{ fontWeight: 500 }}>{label}</span>
        {snap.approximated && <span style={{ fontSize: 10, color: '#9ca3af' }}>(approximé)</span>}
        {snap.planLevel && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9ca3af' }}>{snap.planLevel}</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
        <span>Session 5h</span>
        <span style={{ color: '#9ca3af' }}>{snap.sessionPct ?? 0}%</span>
      </div>
      <ProgressBar pct={snap.sessionPct} color={color} />
      {snap.sessionResetAt && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>Resets in {formatResetIn(snap.sessionResetAt)}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 8, marginBottom: 2 }}>
        <span>Weekly</span>
        <span style={{ color: '#9ca3af' }}>{snap.weeklyPct ?? 0}%</span>
      </div>
      <ProgressBar pct={snap.weeklyPct} color={color} />
      {snap.weeklyResetAt && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>Resets in {formatResetIn(snap.weeklyResetAt)}</div>}
    </div>
  );
}
```

- [ ] **Step 7: Réécrire `src/widget/Widget.jsx`**

```jsx
import React, { useEffect, useState, useCallback } from 'react';
import ProviderRow from './components/ProviderRow';
import { formatRelativeTime } from '../shared/snapshot-utils';

export default function Widget() {
  const [snaps, setSnaps] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch, setLastFetch] = useState(Date.now());

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await window.api.providers.refreshAll();
      setSnaps(result);
      setLastFetch(Date.now());
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleConnect = useCallback(async (providerId) => {
    try {
      await window.api.providers.connect(providerId);
      await refresh();
    } catch (e) {
      console.error('connect failed', e);
    }
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div style={{ width: 320, background: '#0e1217', color: '#e5e7eb', padding: 14, fontFamily: 'Segoe UI, sans-serif', fontSize: 12, height: '100vh', boxSizing: 'border-box', borderRadius: 10, border: '1px solid #1f2937' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid #1f2937' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>AI Usage</div>
          <div style={{ color: '#9ca3af', fontSize: 11 }}>Mis à jour il y a {formatRelativeTime(lastFetch)}</div>
        </div>
      </div>
      <div>
        {snaps.map(s => (
          <ProviderRow key={s.provider} snap={s} onConnectClick={handleConnect} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 6, borderTop: '1px solid #1f2937', color: '#9ca3af', fontSize: 11 }}>
        <button onClick={refresh} disabled={refreshing} style={{ background: 'transparent', color: 'inherit', border: 'none', cursor: 'pointer' }}>
          ↻ Rafraîchir
        </button>
        <span>⚙ ⤢</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Smoke test**

Run: `npm run dev`
Cliquer tray → widget s'ouvre. Cliquer "Connecter" sur Z.ai → fenêtre login s'ouvre, login, fenêtre se ferme. Le widget rafraîchit auto et affiche les barres réelles Z.ai. Les 3 autres providers affichent "Connecter" (stubs).

- [ ] **Step 9: Commit**

```bash
git add src/widget/ src/shared/ tests/shared/
git commit -m "feat(widget): provider rows with progress bars, connect button, real Z.ai data"
```

### Task 2.7: Fin M2 — Verify checkpoint + tag

- [ ] **Step 1: Run la suite tests**

Run: `npm test`
Expected: tous tests passent (sentinel + types + stubs + zai-parser + zai + snapshot-utils).

- [ ] **Step 2: Run dev + scénario complet**

1. `npm run dev`
2. Clic tray → widget popup
3. Clic Connecter Z.ai → login → window close → widget refresh auto
4. Vérifier que session/weekly Z.ai s'affichent avec les % réels
5. Clic ↻ → refresh manuel marche
6. Clic en dehors → widget se cache
7. Clic tray → ré-apparaît

- [ ] **Step 3: Tag**

```bash
git tag m2-zai-end-to-end
```

---

# Milestone 3 — Provider portfolio (Ollama + Claude + Codex)

**Objectif M3** : étendre le pattern Z.ai aux 3 autres providers et ajouter le filtre tabs dans le widget. À la fin : les 4 lignes du widget affichent des données réelles (ou des explications honnêtes pour Codex), tabs cliquables pour zoomer sur un provider.

**Lessons learned de M1+M2 à appliquer** :
- **CJS modules + Vitest mocks** : `vi.mock()` n'intercepte pas `require()` dans les modules CJS. Pattern à utiliser : exposer un objet `deps` depuis le module et le remplacer dans les tests. Voir `electron/providers/zai.js` pour l'exemple.
- **Module exports** : tous les fichiers sous `electron/` sont CJS (`module.exports`). Tous les fichiers sous `src/` sont ESM (`export`). Les tests dans `tests/` sont ESM avec interop Vitest.
- **L'app boote bien** sans scheduler ni notifier (commenté dans main.js). Quand on les réactive en M5, attention aux callsites de l'ancienne API DB qui auront été nettoyés.
- **Helpers de db** disponibles : `insertSnapshot(db, snap)`, `recentSnapshots(db, provider, sinceMs)`, `getProviderSettings`, `upsertProviderSettings`, `getPref`, `setPref`. Voir `electron/db.js`.
- **Helpers de secrets** : `setProviderSecret(provider, plainText)`, `getProviderSecret(provider)`, `clearProviderSecret(provider)`. Chiffrement DPAPI Windows. Voir `electron/secrets.js`.
- **Snapshot validator** : `isValidSnapshot(s)` valide aussi le shape de l'erreur (commit `b268857`). Tout snapshot que retourne refresh() DOIT passer cette validation.

## Section A — Ollama Cloud Pro

### Task 3.1: Ollama HTML parser (pure function, TDD)

**Files:**
- Create: `electron/providers/ollama-parser.js`
- Create: `tests/providers/ollama-parser.test.js`

- [ ] **Step 1: Écrire test avec HTML réel observé**

`tests/providers/ollama-parser.test.js` :
```js
import { describe, it, expect } from 'vitest';
import { parseOllamaSettings } from '../../electron/providers/ollama-parser.js';

const sampleHtml = `
<html>
<body>
  <div>
    <span>Cloud Usage</span><span>pro</span>
  </div>
  <div>
    <span>Session usage</span><span>42% used</span>
    <div data-time="2026-05-08T16:00:00Z">Resets in 3 hours</div>
  </div>
  <div>
    <span>Weekly usage</span><span>18% used</span>
    <div data-time="2026-05-11T00:00:00Z">Resets in 2 days</div>
  </div>
</body>
</html>
`;

describe('parseOllamaSettings', () => {
  it('extracts plan, session, weekly from HTML', () => {
    const result = parseOllamaSettings(sampleHtml);
    expect(result.planLevel).toBe('Pro');
    expect(result.sessionPct).toBe(42);
    expect(result.weeklyPct).toBe(18);
    expect(result.sessionResetAt).toBe(new Date('2026-05-08T16:00:00Z').getTime());
    expect(result.weeklyResetAt).toBe(new Date('2026-05-11T00:00:00Z').getTime());
  });

  it('handles 0% used', () => {
    const html = `<span>Session usage</span><span>0% used</span><div data-time="2026-05-08T16:00:00Z">Resets in 3 hours</div><span>Weekly usage</span><span>0% used</span><div data-time="2026-05-11T00:00:00Z">Resets in 2 days</div>`;
    const result = parseOllamaSettings(html);
    expect(result.sessionPct).toBe(0);
    expect(result.weeklyPct).toBe(0);
  });

  it('returns nulls when usage section absent (free tier?)', () => {
    const result = parseOllamaSettings('<html><body><h1>Settings</h1></body></html>');
    expect(result.sessionPct).toBeNull();
    expect(result.weeklyPct).toBeNull();
    expect(result.planLevel).toBeNull();
  });

  it('throws when input not a string', () => {
    expect(() => parseOllamaSettings(null)).toThrow();
    expect(() => parseOllamaSettings({})).toThrow();
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd "C:\Codex\UsageApp\Usage App"
npm test -- ollama-parser
```

- [ ] **Step 3: Implémenter `electron/providers/ollama-parser.js`**

```js
const cheerio = require('cheerio');

function parseOllamaSettings(html) {
  if (typeof html !== 'string') {
    throw new Error('parseOllamaSettings expects HTML string');
  }
  const $ = cheerio.load(html);

  const findSection = (label) => {
    const labelSpan = $('span').filter((_, el) => $(el).text().trim() === label).first();
    if (!labelSpan.length) return { pct: null, resetAt: null };
    const parent = labelSpan.parent();
    const pctText = parent.find('span').filter((_, el) => /\d+% used/.test($(el).text())).first().text();
    const m = pctText.match(/(\d+(?:\.\d+)?)% used/);
    const pct = m ? parseFloat(m[1]) : null;
    const resetEl = parent.find('[data-time]').first();
    const isoTime = resetEl.attr('data-time') || null;
    const resetAt = isoTime ? new Date(isoTime).getTime() : null;
    return { pct, resetAt };
  };

  const session = findSection('Session usage');
  const weekly = findSection('Weekly usage');

  // Plan : Cloud Usage label, voisin span = "pro" / "free" etc.
  let planLevel = null;
  const planLabel = $('span').filter((_, el) => $(el).text().trim() === 'Cloud Usage').first();
  if (planLabel.length) {
    const planSpan = planLabel.parent().find('span').filter((_, el) => $(el).text().trim() !== 'Cloud Usage').first();
    if (planSpan.length) {
      const raw = planSpan.text().trim();
      planLevel = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : null;
    }
  }

  return {
    sessionPct: session.pct,
    weeklyPct: weekly.pct,
    sessionResetAt: session.resetAt,
    weeklyResetAt: weekly.resetAt,
    planLevel,
  };
}

module.exports = { parseOllamaSettings };
```

- [ ] **Step 4: Run test (PASS)** : `npm test -- ollama-parser` → 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/providers/ollama-parser.js tests/providers/ollama-parser.test.js
git commit -m "feat(ollama): pure HTML parser for /settings page using cheerio"
```

### Task 3.2: Ollama refresh() — fetch HTML + parse, cookie depuis safeStorage

**Files:**
- Modify: `electron/providers/ollama.js` (replace stub from Task 1.7, follow Z.ai pattern with `deps` injection)
- Create: `tests/providers/ollama.test.js`

- [ ] **Step 1: Test avec mocked fetch + secrets (suit le pattern de zai.test.js)**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() },
}));

describe('ollama.refresh()', () => {
  let ollama;
  let fakeSecrets;

  beforeEach(async () => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.resetModules();
    ollama = await import('../../electron/providers/ollama.js');
    fakeSecrets = {
      getProviderSecret: vi.fn(),
      setProviderSecret: vi.fn(),
      clearProviderSecret: vi.fn(),
    };
    ollama.deps.secrets = fakeSecrets;
  });

  it('returns NOT_CONFIGURED when no cookie stored', async () => {
    fakeSecrets.getProviderSecret.mockReturnValue(null);
    const snap = await ollama.refresh();
    expect(snap.error.code).toBe('NOT_CONFIGURED');
    expect(snap.sessionPct).toBeNull();
  });

  it('returns parsed snapshot on success', async () => {
    fakeSecrets.getProviderSecret.mockReturnValue('session=ABC123');
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `<span>Cloud Usage</span><span>pro</span><span>Session usage</span><span>42% used</span><div data-time="2026-05-08T16:00:00Z"></div><span>Weekly usage</span><span>18% used</span><div data-time="2026-05-11T00:00:00Z"></div>`,
    });
    const snap = await ollama.refresh();
    expect(snap.error).toBeNull();
    expect(snap.sessionPct).toBe(42);
    expect(snap.weeklyPct).toBe(18);
    expect(snap.planLevel).toBe('Pro');
  });

  it('returns AUTH_EXPIRED on redirect to login (302/sign-in)', async () => {
    fakeSecrets.getProviderSecret.mockReturnValue('session=EXPIRED');
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      url: 'https://ollama.com/signin',
      text: async () => '<form>Sign in</form>',
    });
    const snap = await ollama.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
  });

  it('returns NETWORK error on fetch throw', async () => {
    fakeSecrets.getProviderSecret.mockReturnValue('session=ABC');
    global.fetch.mockRejectedValue(new Error('ETIMEDOUT'));
    const snap = await ollama.refresh();
    expect(snap.error.code).toBe('NETWORK');
    expect(snap.error.retriable).toBe(true);
  });
});
```

- [ ] **Step 2: Run (FAIL)**

- [ ] **Step 3: Implémenter `electron/providers/ollama.js`** (full rewrite du stub Task 1.7)

```js
const { EventEmitter } = require('events');
const { parseOllamaSettings } = require('./ollama-parser');

const id = 'ollama';
const label = 'Ollama';
const authMode = 'webview';
const ENDPOINT = 'https://ollama.com/settings';

const emitter = new EventEmitter();

const deps = {
  secrets: require('../secrets'),
};

async function connect() {
  // Implémentation webview en Task 3.3
  throw new Error('ollama.connect: webview flow not yet implemented (Task 3.3)');
}

async function disconnect() {
  deps.secrets.clearProviderSecret(id);
}

function buildSnapshot(partial) {
  return {
    provider: id,
    fetchedAt: Date.now(),
    sessionPct: null,
    weeklyPct: null,
    sessionResetAt: null,
    weeklyResetAt: null,
    planLevel: null,
    approximated: false,
    raw: null,
    error: null,
    ...partial,
  };
}

async function refresh() {
  const cookie = deps.secrets.getProviderSecret(id);
  if (!cookie) {
    return buildSnapshot({ error: { code: 'NOT_CONFIGURED', message: 'Connect Ollama first', retriable: false } });
  }
  try {
    const resp = await fetch(ENDPOINT, {
      headers: { Cookie: cookie },
      redirect: 'follow',
    });
    // Detect redirect to signin (cookie expired)
    if (resp.url && /\/signin/i.test(resp.url)) {
      return buildSnapshot({ error: { code: 'AUTH_EXPIRED', message: 'Cookie expired — reconnect Ollama', retriable: false } });
    }
    if (resp.status === 401 || resp.status === 403) {
      return buildSnapshot({ error: { code: 'AUTH_EXPIRED', message: 'Auth rejected — reconnect Ollama', retriable: false } });
    }
    if (!resp.ok) {
      return buildSnapshot({ error: { code: 'NETWORK', message: `HTTP ${resp.status}`, retriable: true } });
    }
    const html = await resp.text();
    if (/sign[- ]in/i.test(html) && !/Cloud Usage/i.test(html)) {
      return buildSnapshot({ error: { code: 'AUTH_EXPIRED', message: 'Got signin page — reconnect Ollama', retriable: false } });
    }
    const parsed = parseOllamaSettings(html);
    return buildSnapshot({ ...parsed, raw: { html: html.slice(0, 2000) } });
  } catch (e) {
    if (e.message?.includes('parseOllamaSettings')) {
      return buildSnapshot({ error: { code: 'PARSE', message: e.message, retriable: false } });
    }
    return buildSnapshot({ error: { code: 'NETWORK', message: e.message || String(e), retriable: true } });
  }
}

function subscribe(cb) {
  emitter.on('snapshot', cb);
  return () => emitter.off('snapshot', cb);
}

module.exports = { id, label, authMode, connect, disconnect, refresh, subscribe, deps };
```

- [ ] **Step 4: Run tests (PASS)** : `npm test` → tous tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/providers/ollama.js tests/providers/ollama.test.js
git commit -m "feat(ollama): refresh() with HTTP fetch + HTML parse + error mapping"
```

### Task 3.3: Ollama connect() — webview cookie capture

**Files:**
- Create: `electron/providers/ollama-connect.js`
- Modify: `electron/providers/ollama.js` (replace `connect()` throw)

- [ ] **Step 1: Créer `electron/providers/ollama-connect.js`**

```js
const { BrowserWindow, session } = require('electron');

const SIGNIN_URL = 'https://ollama.com/signin';
const SUCCESS_URL_PATTERN = /^https:\/\/ollama\.com\/(settings|$)/;

async function captureOllamaCookie() {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 1024,
      height: 768,
      title: 'Connect to Ollama',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'persist:ollama-connect',
      },
    });

    let resolved = false;
    const cleanup = () => { if (!win.isDestroyed()) win.close(); };
    const finishOk = (cookie) => { if (resolved) return; resolved = true; cleanup(); resolve(cookie); };
    const finishErr = (err) => { if (resolved) return; resolved = true; cleanup(); reject(err); };

    win.on('closed', () => { if (!resolved) finishErr(new Error('User closed the window')); });

    const tryCapture = async () => {
      try {
        const url = win.webContents.getURL();
        if (!SUCCESS_URL_PATTERN.test(url)) return;
        const cookies = await win.webContents.session.cookies.get({ url: 'https://ollama.com' });
        if (cookies && cookies.length > 0) {
          const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          finishOk(cookieStr);
        }
      } catch (e) { /* retry */ }
    };

    win.webContents.on('did-finish-load', tryCapture);
    win.webContents.on('did-navigate', tryCapture);

    const interval = setInterval(tryCapture, 1500);
    const timeout = setTimeout(() => finishErr(new Error('Connect Ollama: timeout (5 min)')), 5 * 60 * 1000);
    win.on('closed', () => { clearInterval(interval); clearTimeout(timeout); });

    win.loadURL(SIGNIN_URL);
  });
}

module.exports = { captureOllamaCookie };
```

- [ ] **Step 2: Wire dans `ollama.js`** — extend `deps`:

```js
const { captureOllamaCookie } = require('./ollama-connect');

const deps = {
  secrets: require('../secrets'),
  captureOllamaCookie,
};

async function connect() {
  const cookie = await deps.captureOllamaCookie();
  deps.secrets.setProviderSecret(id, cookie);
}
```

- [ ] **Step 3: Smoke test (manuel après commit)** + tests `npm test` toujours OK.

- [ ] **Step 4: Commit**

```bash
git add electron/providers/ollama-connect.js electron/providers/ollama.js
git commit -m "feat(ollama): connect() captures session cookie via Electron BrowserWindow"
```

## Section B — Anthropic Claude

### Task 3.4: Claude statusLine config helper

**Files:**
- Create: `electron/providers/claude-statusline.js`
- Create: `tests/providers/claude-statusline.test.js`

This module is responsible for reading and patching `~/.claude/settings.json` to add the statusLine command that writes usage data to disk. The patching is idempotent (won't duplicate if already present).

⚠️ **Risk noted in spec section 7.1** : the exact file path (`~/.claude/usage-latest.json`) needs verification on the target Claude Code version. Issue #55333 is closed but the final filename should be confirmed at implementation time. **Investigation step à inclure dans la Task 3.4** : avant d'écrire le statusLine command, explorer `~/.claude/` pour voir quels fichiers la dernière version Claude Code génère naturellement.

- [ ] **Step 1: Test pour readSettings/writeSettings idempotence**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'path';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';

let tempDir;
beforeEach(() => {
  tempDir = mkdtempSync(resolve(tmpdir(), 'claude-stl-'));
});

describe('claude-statusline', () => {
  it('reads existing settings.json or returns empty', async () => {
    const { readClaudeSettings } = await import('../../electron/providers/claude-statusline.js');
    expect(readClaudeSettings(resolve(tempDir, 'missing.json'))).toEqual({});
    writeFileSync(resolve(tempDir, 'settings.json'), JSON.stringify({ foo: 'bar' }));
    expect(readClaudeSettings(resolve(tempDir, 'settings.json'))).toEqual({ foo: 'bar' });
  });

  it('patchSettings injects statusLine without losing other keys', async () => {
    const { patchClaudeSettings } = await import('../../electron/providers/claude-statusline.js');
    const settingsPath = resolve(tempDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({ unrelated: 42 }));
    const usagePath = resolve(tempDir, 'usage-latest.json');
    patchClaudeSettings(settingsPath, usagePath);
    const after = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(after.unrelated).toBe(42);
    expect(after.statusLine).toBeDefined();
    expect(after.statusLine.command).toContain(usagePath.replace(/\\/g, '\\\\').slice(-30));
  });

  it('patchSettings is idempotent', async () => {
    const { patchClaudeSettings } = await import('../../electron/providers/claude-statusline.js');
    const settingsPath = resolve(tempDir, 'settings.json');
    const usagePath = resolve(tempDir, 'usage-latest.json');
    patchClaudeSettings(settingsPath, usagePath);
    const first = readFileSync(settingsPath, 'utf-8');
    patchClaudeSettings(settingsPath, usagePath);
    const second = readFileSync(settingsPath, 'utf-8');
    expect(first).toBe(second);
  });
});
```

- [ ] **Step 2: Implémenter** `electron/providers/claude-statusline.js`:

```js
const fs = require('fs');
const path = require('path');
const os = require('os');

function defaultClaudeSettingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function defaultUsageFilePath() {
  return path.join(os.homedir(), '.claude', 'ai-usage-monitor', 'usage-latest.json');
}

function readClaudeSettings(settingsPath = defaultClaudeSettingsPath()) {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch { return {}; }
}

/**
 * Patches ~/.claude/settings.json with a statusLine command that
 * writes the JSON payload (incl. rate-limit headers from issue #55333)
 * to `usagePath` whenever Claude Code refreshes its statusline.
 *
 * Idempotent : if our statusLine is already present, nothing changes.
 */
function patchClaudeSettings(settingsPath = defaultClaudeSettingsPath(), usagePath = defaultUsageFilePath()) {
  const settings = readClaudeSettings(settingsPath);

  // Ensure usage file dir exists
  fs.mkdirSync(path.dirname(usagePath), { recursive: true });

  // Build a node command that consumes stdin (Claude statusline JSON), writes to disk, prints empty (so terminal shows nothing extra)
  const escapedPath = usagePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const command = `node -e "let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{require('fs').writeFileSync(\\"${escapedPath}\\",d)})"`;

  if (settings.statusLine?.command === command) {
    return; // idempotent
  }

  settings.statusLine = {
    type: 'command',
    command,
  };

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function unpatchClaudeSettings(settingsPath = defaultClaudeSettingsPath()) {
  const settings = readClaudeSettings(settingsPath);
  if (settings.statusLine?.command?.includes('ai-usage-monitor')) {
    delete settings.statusLine;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }
}

module.exports = { readClaudeSettings, patchClaudeSettings, unpatchClaudeSettings, defaultClaudeSettingsPath, defaultUsageFilePath };
```

- [ ] **Step 3: Run tests (PASS)** : 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add electron/providers/claude-statusline.js tests/providers/claude-statusline.test.js
git commit -m "feat(claude): statusLine config helper to patch settings.json"
```

### Task 3.5: Claude refresh() + connect() + chokidar subscribe

**Files:**
- Modify: `electron/providers/claude.js` (full rewrite of stub)
- Create: `tests/providers/claude.test.js`

- [ ] **Step 1: Tests**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
}));

let tempDir;
beforeEach(() => {
  tempDir = mkdtempSync(resolve(tmpdir(), 'claude-test-'));
});

describe('claude.refresh()', () => {
  it('returns CLI_INACTIVE when usage file absent', async () => {
    vi.resetModules();
    const claude = await import('../../electron/providers/claude.js');
    claude.deps.usageFilePath = resolve(tempDir, 'never-exists.json');
    const snap = await claude.refresh();
    expect(snap.error.code).toBe('CLI_INACTIVE');
  });

  it('returns parsed snapshot when usage file present', async () => {
    const usagePath = resolve(tempDir, 'usage.json');
    writeFileSync(usagePath, JSON.stringify({
      // Shape based on issue #55333 — verify at impl time
      session_pct_used: 42,
      weekly_pct_used: 18,
      session_reset_at: '2026-05-08T16:00:00Z',
      weekly_reset_at: '2026-05-11T00:00:00Z',
      plan: 'max',
    }));
    vi.resetModules();
    const claude = await import('../../electron/providers/claude.js');
    claude.deps.usageFilePath = usagePath;
    const snap = await claude.refresh();
    expect(snap.error).toBeNull();
    expect(snap.sessionPct).toBe(42);
    expect(snap.weeklyPct).toBe(18);
    expect(snap.planLevel).toBe('Max');
  });

  it('returns CLI_INACTIVE if usage file is stale (> 30 min)', async () => {
    const usagePath = resolve(tempDir, 'usage.json');
    writeFileSync(usagePath, JSON.stringify({ session_pct_used: 50 }));
    // Set mtime to 1 hour ago
    const oldTime = (Date.now() - 3600_000) / 1000;
    require('fs').utimesSync(usagePath, oldTime, oldTime);
    vi.resetModules();
    const claude = await import('../../electron/providers/claude.js');
    claude.deps.usageFilePath = usagePath;
    const snap = await claude.refresh();
    expect(snap.error.code).toBe('CLI_INACTIVE');
    expect(snap.sessionPct).toBe(50); // dernière valeur connue exposée mais avec error
  });
});
```

⚠️ Le shape exact de usage-latest.json est **à vérifier** quand l'implémentation arrive. Le test ci-dessus suppose des keys plausibles (`session_pct_used`, etc.). À ajuster après inspection réelle d'une instance Claude Code récente.

- [ ] **Step 2: Implémenter `electron/providers/claude.js`**

```js
const { EventEmitter } = require('events');
const fs = require('fs');
const { patchClaudeSettings, unpatchClaudeSettings, defaultUsageFilePath } = require('./claude-statusline');

const id = 'claude';
const label = 'Claude';
const authMode = 'cli-file';
const STALE_MS = 30 * 60 * 1000; // 30 min

const emitter = new EventEmitter();

const deps = {
  patchClaudeSettings,
  unpatchClaudeSettings,
  usageFilePath: defaultUsageFilePath(),
};

async function connect() {
  // Lit + patch ~/.claude/settings.json (consent assumé via UI parent)
  deps.patchClaudeSettings();
}

async function disconnect() {
  deps.unpatchClaudeSettings();
}

function buildSnapshot(partial) {
  return {
    provider: id,
    fetchedAt: Date.now(),
    sessionPct: null,
    weeklyPct: null,
    sessionResetAt: null,
    weeklyResetAt: null,
    planLevel: null,
    approximated: false,
    raw: null,
    error: null,
    ...partial,
  };
}

function parseClaudeUsage(raw) {
  // ⚠️ Shape réel à valider — adapter aux clés effectives de la dernière release
  const planRaw = raw.plan || raw.subscription_tier || null;
  const planLevel = planRaw ? planRaw.charAt(0).toUpperCase() + planRaw.slice(1) : null;
  return {
    sessionPct: typeof raw.session_pct_used === 'number' ? raw.session_pct_used : null,
    weeklyPct: typeof raw.weekly_pct_used === 'number' ? raw.weekly_pct_used : null,
    sessionResetAt: raw.session_reset_at ? new Date(raw.session_reset_at).getTime() : null,
    weeklyResetAt: raw.weekly_reset_at ? new Date(raw.weekly_reset_at).getTime() : null,
    planLevel,
  };
}

async function refresh() {
  let stat;
  try {
    stat = fs.statSync(deps.usageFilePath);
  } catch {
    return buildSnapshot({ error: { code: 'CLI_INACTIVE', message: 'Lance `claude` au moins une fois après avoir connecté', retriable: true } });
  }
  const ageMs = Date.now() - stat.mtimeMs;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(deps.usageFilePath, 'utf-8'));
  } catch (e) {
    return buildSnapshot({ error: { code: 'PARSE', message: `Failed to parse usage file: ${e.message}`, retriable: false } });
  }
  const parsed = parseClaudeUsage(raw);

  if (ageMs > STALE_MS) {
    return buildSnapshot({
      ...parsed,
      raw,
      error: { code: 'CLI_INACTIVE', message: `claude inactif depuis ${Math.round(ageMs / 60_000)} min`, retriable: true },
    });
  }

  return buildSnapshot({ ...parsed, raw });
}

let watcher = null;

function subscribe(cb) {
  if (!watcher) {
    const chokidar = require('chokidar');
    watcher = chokidar.watch(deps.usageFilePath, { ignoreInitial: true });
    watcher.on('change', async () => {
      const snap = await refresh();
      emitter.emit('snapshot', snap);
    });
  }
  emitter.on('snapshot', cb);
  return () => emitter.off('snapshot', cb);
}

module.exports = { id, label, authMode, connect, disconnect, refresh, subscribe, deps };
```

- [ ] **Step 3: Run tests** → PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/providers/claude.js tests/providers/claude.test.js
git commit -m "feat(claude): refresh via statusLine usage file + chokidar subscribe"
```

## Section C — OpenAI Codex

### Task 3.6: Codex JSONL aggregator

**Files:**
- Create: `electron/providers/codex-aggregator.js`
- Create: `tests/providers/codex-aggregator.test.js`

Aggregate token consumption from `~/.codex/sessions/*.jsonl` rollouts. Detect 429 events. Return time-bucketed totals.

⚠️ **Note de scope** : sans connaître les seuils du plan ChatGPT Plus, on ne peut **pas** calculer un % de consommation. M3 retourne donc :
- Tokens totaux fenêtres 5h et 7j
- `approximated: true`
- `sessionPct` / `weeklyPct` = `null` (pas de % réel possible)
- `error.code = 'QUOTA_UNKNOWN'` avec message "Tokens utilisés : X — limite plan inconnue"

L'utilisateur configurera son tier limit dans Settings (M4). En attendant, le widget affichera "X tokens used / 5h" textuel pour Codex au lieu d'une barre %.

- [ ] **Step 1: Tests**

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { aggregateCodexTokens } from '../../electron/providers/codex-aggregator.js';

describe('aggregateCodexTokens', () => {
  it('sums tokens from JSONL files within window', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'codex-'));
    const now = Date.now();
    const lines = [
      JSON.stringify({ timestamp: now - 1000, usage: { input_tokens: 100, output_tokens: 50 } }),
      JSON.stringify({ timestamp: now - 2 * 3600_000, usage: { input_tokens: 200, output_tokens: 100 } }),
      JSON.stringify({ timestamp: now - 6 * 3600_000, usage: { input_tokens: 999, output_tokens: 999 } }), // outside 5h window
    ];
    writeFileSync(resolve(dir, 'session.jsonl'), lines.join('\n') + '\n');
    const result = await aggregateCodexTokens(dir);
    // Last 5h: 100+50 + 200+100 = 450
    expect(result.session5hTokens).toBe(450);
    // Last 7d: includes all = 450 + 1998 = 2448
    expect(result.weekly7dTokens).toBe(2448);
  });

  it('detects 429 rollouts', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'codex-'));
    const now = Date.now();
    const lines = [
      JSON.stringify({ timestamp: now - 1000, error: { code: 'rate_limit_exceeded', http_status: 429 } }),
    ];
    writeFileSync(resolve(dir, 'session.jsonl'), lines.join('\n') + '\n');
    const result = await aggregateCodexTokens(dir);
    expect(result.lastRateLimitAt).toBeGreaterThan(now - 2000);
  });

  it('returns zeros when directory empty', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'codex-'));
    const result = await aggregateCodexTokens(dir);
    expect(result.session5hTokens).toBe(0);
    expect(result.weekly7dTokens).toBe(0);
    expect(result.lastRateLimitAt).toBeNull();
  });
});
```

- [ ] **Step 2: Implémenter** `electron/providers/codex-aggregator.js`. Use `fs.readdirSync` to list `*.jsonl`, line-by-line parse, filter by timestamp.

⚠️ **Shape réel des JSONL events** à vérifier en regardant un `~/.codex/sessions/*.jsonl` réel. Le test ci-dessus suppose `{ timestamp, usage: { input_tokens, output_tokens } }`. À ajuster.

- [ ] **Step 3-4** : tests pass + commit `feat(codex): JSONL aggregator for token consumption`.

### Task 3.7: Codex refresh() + connect()

**Files:**
- Modify: `electron/providers/codex.js`

```js
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { aggregateCodexTokens } = require('./codex-aggregator');

const id = 'codex';
const label = 'Codex';
const authMode = 'jsonl-tail';

const deps = {
  sessionsDir: path.join(os.homedir(), '.codex', 'sessions'),
};

async function connect() {
  if (!fs.existsSync(deps.sessionsDir)) {
    throw new Error('Codex CLI introuvable — installe `codex` et lance-le au moins une fois');
  }
  // No-op : juste vérification
}

async function disconnect() { /* no-op */ }

async function refresh() {
  if (!fs.existsSync(deps.sessionsDir)) {
    return buildSnapshot({ error: { code: 'NOT_CONFIGURED', message: 'Connect Codex first', retriable: false } });
  }
  const agg = await aggregateCodexTokens(deps.sessionsDir);
  const wasRateLimited = agg.lastRateLimitAt && (Date.now() - agg.lastRateLimitAt < 5 * 3600_000);
  return buildSnapshot({
    sessionPct: null, // limite du plan inconnue → pas de %
    weeklyPct: null,
    planLevel: 'Plus', // assumption ; à exposer en Settings
    approximated: true,
    raw: agg,
    error: wasRateLimited
      ? { code: 'QUOTA_EXCEEDED', message: 'Rate limit hit dans les dernières 5h', retriable: true }
      : { code: 'QUOTA_UNKNOWN', message: `${agg.session5hTokens} tokens / 5h, ${agg.weekly7dTokens} / 7j (limite plan inconnue)`, retriable: false },
  });
}
```

⚠️ Le `ProviderRow.jsx` du widget devra afficher Codex différemment : pas de barre, juste un compteur de tokens + le message d'erreur. Cf. Task 3.10 pour les ajustements UI.

- [ ] Tests + commit.

## Section D — UI : tabs filter

### Task 3.8: Widget tabs (All / Claude / Codex / Ollama / Z.ai)

**Files:**
- Create: `src/widget/components/ProviderTabs.jsx`
- Modify: `src/widget/Widget.jsx`

```jsx
// ProviderTabs.jsx
import React from 'react';
import { PROVIDER_COLORS, PROVIDER_LABELS } from '../../shared/snapshot-utils';

const TABS = ['all', 'claude', 'codex', 'ollama', 'zai'];

export default function ProviderTabs({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '8px 0', borderBottom: '1px solid #1f2937' }}>
      {TABS.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            padding: '6px 8px', borderRadius: 6, fontSize: 10,
            background: active === t ? '#1e293b' : '#161b22',
            color: active === t ? '#e5e7eb' : '#9ca3af',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {t !== 'all' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: PROVIDER_COLORS[t] }} />}
          {t === 'all' ? 'All' : PROVIDER_LABELS[t]}
        </button>
      ))}
    </div>
  );
}
```

In `Widget.jsx`, add `[activeTab, setActiveTab] = useState('all')` and filter `snaps` accordingly. When `activeTab !== 'all'`, render only the matching row but with extended detail (sparkline mini-graph 24h depuis SQLite — cf. M4 pour le query helper).

### Task 3.9: M3 verify checkpoint + tag

- [ ] Tests : tous pass (≥ 35 cumulés).
- [ ] Manuel : 4 providers connectables, tabs fonctionnels.
- [ ] Tag : `git tag m3-providers-complete`.

---

# Milestone 4 — Fenêtre détaillée

**Plan détaillé à écrire après M3.** Esquisse :

- Création `mainWindow` (BrowserWindow classique 1100×700) chargeant `index.html`
- `src/detail/App.jsx` avec sidebar + 4 pages :
  - `pages/Dashboard.jsx` — grid 2×2 cards providers + sparklines depuis SQLite
  - `pages/History.jsx` — recharts 30j par provider, filtres
  - `pages/Alerts.jsx` — re-purpose framework existant pour seuils session/weekly
  - `pages/Settings.jsx` — connexions, raccourci clavier, autostart, rétention
- Wire `⤢` du widget, `⚙`, double-clic tray, raccourci `Ctrl+Shift+Alt+U`
- Quit logic : croix → hide to tray, Quit menu tray → vrai exit

---

# Milestone 5 — Polish

**Plan détaillé à écrire après M4.** Esquisse :

- **Notifications** : adapter `notifier.js` aux nouveaux seuils (session > X, weekly > Y, error persistant > 2h). Cooldown 6h conservé.
- **Tray icon overlay rouge** : génération dynamique de l'icône (canvas + tray.setImage) quand un provider est en critical
- **Global shortcut** : `globalShortcut.register` au boot (défaut `Ctrl+Shift+U`), configurable depuis Settings
- **Auto-launch** : `app.setLoginItemSettings` + flag `--minimized` géré au boot
- **Scheduler refactor** : cadence per-provider (cloud 60s, file-watch event-driven), force-refresh on widget open
- **Quit logic** : window-all-closed ne quit pas, croix hide, vrai quit via tray menu
- **README** : MAJ complète, capture d'écran widget, instructions auth scraping

---

## Notes globales

**Convention de commits** :
- `feat(scope): ...` pour les ajouts
- `fix(scope): ...` pour bugs
- `chore: ...` pour deps/tooling
- `refactor(scope): ...` pour restructure sans changement comportement
- `docs: ...` pour docs

**Branche** : tout sur `feat/widget-pivot`. Merge sur `master` quand M5 fini.

**Quand Claude Code arrive en M2** : c'est ici qu'il faut bien valider l'archi adapter + IPC + widget UI. Si quelque chose grince, ajuster avant de cloner sur les 3 autres providers.

**Tests auto** :
- Adapters → unit tests Vitest avec mocks fetch/fs
- Parser pur (zai-parser, ollama-parser) → unit tests sur payloads réels
- React UI → smoke test manuel pour M2, tests RTL si besoin en M4
- Electron main process → smoke test manuel uniquement (pas de Playwright dans ce plan)
