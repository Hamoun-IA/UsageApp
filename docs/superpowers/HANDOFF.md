# AI Usage Monitor — Project State & Resumption Guide

> **Dernière mise à jour : 2026-05-09 (fin de M5 + dist + branding)**
>
> Document canonique pour reprendre le projet, à toi-même dans 6 mois ou à un nouvel
> agent IA en repartant de zéro. Contient : état actuel, conventions, pièges, idées
> futures, cheat sheet.

---

## TL;DR

App Electron Windows qui agrège les usages de 4 abonnements IA personnels
(Claude Pro, ChatGPT Plus / Codex, Ollama Cloud Pro, Z.ai Coding Plan) dans un widget
tray + une fenêtre détaillée avec historique et alertes.

**État actuel : v0.2.0-widget shippée.**
- Branche `master` à `8b58a32` (M5 + dist + branding fixes).
- 264 tests Vitest passants.
- Repo GitHub privé : https://github.com/Hamoun-IA/UsageApp
- Release publiée avec NSIS installer + portable .exe attachés :
  https://github.com/Hamoun-IA/UsageApp/releases/tag/v0.2.0-widget
- 8 tags posés (`m1-foundation` → `m5-polish` + `v0.2.0-widget`).

Tout fonctionne. Reprends ici si tu veux pousser plus loin (idées en bas).

---

## Historique condensé (M1 → M5)

Le projet a été un **pivot** depuis une app dashboard Admin API très différente. Le
parent commit `81f4f7e` est cet état pré-pivot — quasi tout a été remplacé.

| Milestone | Tag | Quoi |
|---|---|---|
| **M1** | `m1-foundation` | Boot Electron + tray + DB v2 + skeletons providers + widget UI minimal |
| **M2** | `m2-zai-end-to-end` | Z.ai full implementation : login webview → JWT capture → API call → snapshot → barre progress |
| **M3** | `m3-providers-complete` | Trois autres providers (claude, codex, ollama) à parité avec Z.ai |
| **M3.5/3.6** | `m3.5-providers-web-flow`, `m3.6-providers-stable` | Refinements auth flows + widget tabs UI |
| **M4** | `m4-detail-window` | Fenêtre détaillée 1200×800 avec sidebar + 4 pages (Dashboard sparklines / History recharts / Alerts seuils / Settings) |
| **M5** | `m5-polish` | Background poller, notifications natives, tray overlay critical, configurable shortcut, boot tray-only, README rewrite, cleanup obsolete |
| **v0.2.0** | `v0.2.0-widget` | Branding final (icon.kitchen export) + dist NSIS + portable + push GitHub |

Chaque milestone a sa spec dans `docs/superpowers/specs/` et son plan dans
`docs/superpowers/plans/`. Les handoffs milestone-spécifiques (`HANDOFF-M4.md`,
`HANDOFF-M5.md`) sont gardés pour la trace.

---

## Architecture

### Layout source

```
electron/                       # Main process (Node.js, CJS)
  main.js                       # Boot tray, fenêtres, wire poller, register shortcut
  preload.js                    # contextBridge → expose window.api.*
  ipc.js                        # 13 IPC handlers (providers/db/app/widget) + deps pattern
  db.js                         # SQLite v2 schema (snapshots, provider_settings, app_prefs)
  secrets.js                    # safeStorage DPAPI wrapper (chiffre cookies + JWT par provider)
  widget-window.js              # BrowserWindow popup ~340×N transparent always-on-top
  refresh-providers.js          # Helper : adapter.refresh + insertSnapshot + evaluateAlerts
  poller.js                     # Background ticker, skip-if-running guard
  notify.js                     # Native Notifications, bundlées par provider
  tray-state.js                 # Swap tray icon normal ↔ critical selon alertLog 6h
  alerts.js                     # evaluateAlerts : compare snap vs seuils, append alertLog
  providers/
    types.js                    # Snapshot shape + ProviderError + isValidSnapshot
    index.js                    # Registry getAdapter / listAdapters
    zai.js, zai-parser.js, zai-connect.js
    claude.js                   # Auth via cookies sessionKey + organization id
    codex.js                    # ChatGPT cookie + JSONL local sessions parsing
    ollama.js
    *-connect.js                # Webview-based auth capture (par provider)

src/                            # Renderer (React 18, ESM, bundled par Vite)
  shared/
    snapshot-utils.js           # PROVIDER_COLORS, PROVIDER_LABELS, formatRelativeTime
    alert-defaults.json         # Seuils par défaut (lus aussi côté main par alerts.js)
  widget/                       # Widget popup
    main.jsx, Widget.jsx
    components/ProgressBar, ProviderRow
  detail/                       # Fenêtre détaillée 1200×800
    main.jsx, App.jsx           # Router 4 pages
    pages/Dashboard, History, Alerts, Settings
    components/Sidebar, Sparkline, ProviderCard, ShortcutInput

build/                          # Assets statiques empaquetés dans l'asar (≥ M5+dist fix)
  icon.png, icon.ico            # 512×512 + multi-size .ico (16/24/32/48/64/128/256)
  tray-{normal,critical}{,@2x}.png

scripts/
  generate-tray-icons.js        # Génère les 4 tray PNG depuis build/icon.png via jimp
                                # (one-off; run après remplacement du master icon.png)

tests/                          # Vitest + happy-dom + @testing-library/react
  31 fichiers, 264 tests

docs/superpowers/
  HANDOFF.md                    # Ce fichier (canonique current state)
  HANDOFF-M4.md, HANDOFF-M5.md  # Historiques par milestone
  specs/YYYY-MM-DD-*.md         # Source de vérité du "quoi"
  plans/YYYY-MM-DD-*.md         # Source de vérité du "comment" (TDD steps)
```

### Boot flow

1. `electron/main.js` `app.whenReady` :
   1. `db.init()` ouvre SQLite, applique migrations, retourne instance
   2. Wire `ipcDeps.registerShortcut = tryRegisterShortcut` AVANT `registerIpcHandlers`
   3. Prune snapshots > retentionDays
   4. Crée mainWindow (BrowserWindow `show: false` — tray-only boot)
   5. Crée tray, charge initial icon via `tray-state.updateTrayIcon`
   6. Lit pref `globalShortcut`, register avec fallback sur défaut si conflit
   7. Construit `Poller`, wire `onResults` → `notify.fireAlertNotifications` +
      `tray-state.updateTrayIcon`
   8. Wire `ipcDeps.poller = poller`
   9. `poller.start(pollIntervalMin * 60_000)` (cadence pref-driven)

2. Au tick (toutes les 5 min par défaut) :
   - Skip-if-running guard
   - `refresh-providers.refreshAllAndPersist` → `Promise.allSettled` sur les 4 adapters
   - Pour chaque snap fulfilled : `insertSnapshot` + `evaluateAlerts` → `newAlerts[]`
   - Callback : `fireAlertNotifications(newAlerts)` + `updateTrayIcon`

3. Quit : `before-quit` → `poller.stop()` + `globalShortcut.unregisterAll()`

### Patterns à suivre

| Module | Style |
|---|---|
| `electron/zai.js`, `claude.js`, `codex.js`, `ollama.js` | Class adapter avec `deps` object pour l'injection (cf. CJS interop ci-dessous) |
| `electron/alerts.js`, `notify.js`, `tray-state.js` | Plain functions exportées + `deps` object si dépendance Electron native (Notification, nativeImage) |
| `electron/refresh-providers.js` | Plain functions avec named-args object — pas de `deps` car testable directement |
| `electron/poller.js` | Class avec constructor injection (state-bearing) |
| Tests | Vitest + happy-dom (defaut), `@testing-library/react` pour les composants React, in-memory better-sqlite3 pour les tests DB |

---

## Setup pour reprendre

### Sur la machine actuelle (Windows + node 20.17)

Le repo est cloné à `C:\Codex\UsageApp\Usage App`. Tout y est.

1. Ouvre un terminal dans le dossier
2. Vérifie que les deps sont à jour : `npm install`
3. Pour tester : voir « Gotcha better-sqlite3 ABI » ci-dessous
4. Pour développer : `npm run dev` (lance Vite + Electron en parallèle)

### Sur une nouvelle machine

```bash
git clone https://github.com/Hamoun-IA/UsageApp
cd UsageApp
npm install
```

Le `postinstall` lance `electron-builder install-app-deps` qui rebuild
`better-sqlite3` contre l'ABI Electron. Donc `npm run dev` marche directement.
Pour `npm test`, faire le rebuild manuel — voir ci-dessous.

### Avec Claude Code (nouvelle session)

Donne ce prompt :
> *« Reprends le projet AI Usage Monitor. Lis `docs/superpowers/HANDOFF.md` puis dis-moi
> où on en est et propose des pistes d'amélioration. »*

L'agent lira ce doc et aura tout le contexte historique + actuel.

---

## Conventions et pièges (lessons learned)

### CJS / ESM

- **`electron/`** est CJS (`require`, `module.exports`) — `package.json` est `"type": "commonjs"`.
- **`src/`** est ESM (Vite bundler).
- **`tests/`** est ESM, Vitest gère l'interop.
- `vitest.config.mjs` (extension `.mjs` pour ESM dans projet CJS).
- **Si tu ajoutes un module à `electron/`** : utilise `require`. Pas `import`.

### Pattern `deps` pour mocker les modules Electron en CJS

`vi.mock('electron')` n'intercepte PAS les `require('electron')` faits depuis un module
CJS appelé par un autre module CJS. Solution adoptée :

```js
// electron/notify.js
let _electron;
try { _electron = require('electron'); } catch { _electron = null; }

const deps = {
  Notification: _electron ? _electron.Notification : null,
};

function fireAlertNotifications(newAlerts) {
  const Notification = deps.Notification || (_electron && _electron.Notification);
  // ...
}

module.exports = { fireAlertNotifications, deps };
```

Le test :

```js
const mod = await import('../electron/notify.js');
mod.deps.Notification = FakeNotification;
```

Tous les modules qui touchent `electron.Notification`, `electron.nativeImage`,
`electron.app`, `electron.ipcMain` → utilisent ce pattern. Voir `electron/ipc.js`,
`electron/notify.js`, `electron/tray-state.js`, `electron/providers/*.js`.

`electron/refresh-providers.js` n'en a **pas** besoin car il accepte toutes ses deps en
named-args object — pratique modulaire au choix selon le cas.

### Pièges Vitest fakeTimers

- `vi.advanceTimersByTime()` (sync) ne flush **pas** les microtasks Promise natives entre
  les firings. Si ton code teste un async `setInterval` callback, utilise
  **`await vi.advanceTimersByTimeAsync()`**.
- Sinon les ticks sautés par un guard du type "skip-if-running" feront échouer le test
  (cf. fix `b750d88` dans `tests/poller.test.js`).

### Two-ABI dance better-sqlite3

`better-sqlite3` a un binaire natif lié à l'ABI Node.js. Mais Electron embarque sa
propre version de Node avec une ABI différente :

- **Electron 33** = NODE_MODULE_VERSION 130
- **Node 20.17** = NODE_MODULE_VERSION 115

Le `postinstall` (`electron-builder install-app-deps`) compile pour Electron (130). Donc
au début, `npm test` plante.

**Pour faire tourner les tests** :
```bash
cd node_modules/better-sqlite3 && npm run build-release && cd ../..
npm test
```

**Pour revenir au mode dev/dist Electron** :
```bash
npm run rebuild     # = electron-rebuild -f -w better-sqlite3
```

⚠ Si tu changes de version Node ou Electron, refais le bon rebuild d'abord. Si `npm test`
ou `npm run dev` plante avec un message *« was compiled against a different Node.js
version using NODE_MODULE_VERSION X »*, c'est ça.

### `build/` doit être dans `package.json > build.files`

electron-builder strippe par défaut tout ce qui n'est pas dans `build.files` lors du
packaging asar. Conséquence : si tu ajoutes un asset dans `build/` qui est requis par
`electron/main.js` ou un module main, **ajoute-le explicitement dans `build.files`**.

État actuel :
```json
"files": [
  "electron/**/*",
  "dist/**/*",
  "build/icon.ico",
  "build/icon.png",
  "build/tray-normal.png",
  "build/tray-normal@2x.png",
  "build/tray-critical.png",
  "build/tray-critical@2x.png",
  "src/shared/alert-defaults.json",
  "package.json"
]
```

Si tu ajoutes un nouveau module dans `electron/` qui require un autre fichier dans `src/`
ou ailleurs, ajoute aussi le path à `build.files`. Sinon le crash en prod sera silencieux
(`require('...').missing` se mange en `Cannot find module`).

### Cache d'icônes Windows agressif

Quand tu rebuilds le `.exe` au même chemin, Windows Explorer affiche encore l'ancienne
icône (cache). Solutions :
```powershell
ie4uinit.exe -ClearIconCache
# ou
Stop-Process -Name explorer -Force; Start-Process explorer
```

### Vrai .ico pour le packaging .exe

electron-builder veut un `.ico` avec **au moins une entrée 256×256** pour le packaging
NSIS. Le favicon.ico de icon.kitchen ne contient que 16+32 → rejet. Solution actuelle :
on commit `build/icon.ico` multi-size (généré une fois par electron-builder lui-même
puis copié, ~25 KB).

Si tu changes l'icône du projet :
1. Drop le nouveau master en 256×256+ dans `build/icon.png`
2. Regénère les tray PNGs : `node scripts/generate-tray-icons.js`
3. Pour le .ico, soit tu fournis ton propre multi-size .ico, soit tu laisses
   electron-builder en générer un (set `package.json win.icon = "build/icon.png"`),
   puis copie `release/.icon-ico/icon.ico` vers `build/icon.ico` après le premier run.

### Boot tray-only

`BrowserWindow({ show: false })` est essentiel pour que la fenêtre détaillée n'apparaisse
pas au boot. Sans ça, l'app ressemble à un programme classique au lieu d'une tray app.
La fenêtre n'apparaît qu'à action user (tray double-click, IPC `app:openDetail/openSettings`,
shortcut global → toggle widget popup).

### Test flaky pré-existant

`tests/detail/alerts-page.test.jsx` a un test (`getAllByText('Session %')`) qui flake
de temps en temps en suite complète mais passe en isolation. Documenté depuis M5,
pas introduit par M5. Re-run le test pour le débloquer si tu le rencontres.

### Génération des tray icons

Le script `scripts/generate-tray-icons.js` lit `build/icon.png` (master 256+) et produit
les 4 tray PNGs (16/32 + critical avec dot rouge bottom-right) via `jimp`.

⚠ `jimp` 1.x est ESM-only. Le script utilise `await import('jimp')` pour le charger en
CJS via dynamic import. Si tu modifies le script, garde ce pattern.

---

## Cheat sheet commandes

```bash
# Dev
npm run dev              # Vite + Electron en parallèle, hot reload
npm test                 # Vitest run (262-264 tests)
npm run test:watch       # Vitest watch mode
npm run rebuild          # better-sqlite3 → ABI Electron
cd node_modules/better-sqlite3 && npm run build-release && cd ../..
                         # better-sqlite3 → ABI Node (pour tests)

# Build
npm run build            # Vite build → dist/ (frontend assemblé)
npm run dist             # → release/AI Usage Monitor Setup 0.1.0.exe + portable
npm run dist:portable    # portable seul (skip NSIS)

# Icons
node scripts/generate-tray-icons.js
                         # Régénère les 4 tray PNGs depuis build/icon.png

# Git/release
git tag vX.Y.Z -m "..."
git push --tags
gh release create vX.Y.Z "release/AI Usage Monitor Setup 0.1.0.exe" "release/AI Usage Monitor 0.1.0.exe" --title "..." --notes "..."

# Inspection asar (debug "fichier introuvable en prod")
npx asar list release/win-unpacked/resources/app.asar | grep <pattern>

# Nettoyage Windows icon cache
ie4uinit.exe -ClearIconCache
```

---

## Idées futures (M6+)

Aucune n'est commencée. Toutes sont indépendantes. Choisis selon ton envie.

### Améliorations UX / branding

- **Vraie icône designed** — l'icône actuelle est un export icon.kitchen sympathique
  mais générique. Un design plus propre (avec un graphiste ou via Midjourney) ferait du
  bien.
- **Captures d'écran dans le README** — section actuellement vide.
- **Animation tray** quand un quota est dépassé (clignotement subtil).
- **Couleurs de barre dynamiques** — devient orange à 80 %, rouge à 95 %.

### Nouveaux providers

- **Cursor Pro** — l'app peut lire `~/.cursor/sessions` ou similaire. À investiguer.
- **Gemini Advanced** — Google n'expose probablement pas d'API d'usage stable, à voir.
- **Anthropic API direct** (clé API perso) — dashboard.anthropic.com a une page usage
  qu'on pourrait scraper, ou utiliser l'API officielle si elle expose les quotas.
- **Mistral / Le Chat Pro** — à voir.

### Auto-update

`electron-updater` est déjà dans les dependencies (depuis M1) mais pas wired. Setup à
faire :
1. Configurer un canal de release (GitHub Releases marche bien avec electron-updater).
2. Ajouter l'init dans `electron/main.js` au boot.
3. Tester avec une bump de version + push tag.

### Cross-platform (macOS, Linux)

L'app utilise des trucs platform-specific (DPAPI Windows pour les secrets, registry
auto-launch via `setLoginItemSettings`). Pour macOS :
- `safeStorage.encryptString` marche aussi sur macOS (Keychain).
- `app.setLoginItemSettings` marche.
- Tray icon : besoin de variantes template `.png` pour le rendu macOS dark mode auto.
- Build : `electron-builder --mac --x64 --arm64` (M1 + Intel).

Linux est plus exotique : safeStorage existe mais utilise libsecret (à installer).

### Statusline Claude Code

L'idée originale (cf. `memory/project_usage_app_pivot.md`) était d'avoir une intégration
avec la statusline de Claude Code (le fichier `~/.claude/usage-latest.json` ou
équivalent). Pas implémentée. Si ça réapparaît, il y aurait un IPC à ajouter pour
exposer la dernière session Claude vers un fichier que la statusline peut lire.

### Performance / qualité de code

Les reviewers de M5 ont laissé quelques notes mineures non bloquantes (cf. transcript
M5). Les principales :

- `electron/providers/index.js:18` : commentaire stale qui mentionne `scheduler.js` et
  `notifier.js` (deletés en M5).
- `_intervalMs` jamais lu dans `electron/poller.js` (champ mort).
- Tests poller : style mixte `await Promise.resolve()` vs `vi.advanceTimersByTimeAsync` —
  unifier sur le second.
- Ajouter test pour `Poller.setInterval` quand stopped (branche non couverte).
- Ajouter test pour `onResults` qui throw (branche non couverte).
- `notify.js` : `silent: false` est hardcodé alors que c'est le défaut Electron. À retirer.
- 3 patterns d'injection coexistent (deps object / named-args / constructor injection).
  Acceptable mais documenté à formaliser si ça grandit.

### Dette technique / refactor

- **Memory persistante user** Claude Code : `memory/project_usage_app_pivot.md`,
  `reference_data_sources.md`, `reference_widget_patterns.md`, `feedback_*.md` —
  hébergée hors repo dans `~/.claude/projects/`. Si tu changes de machine, ces notes
  ne suivent pas. Migrate-les vers `docs/notes/` si tu veux les rendre portables.
- **Pas de E2E tests** Electron (Playwright). Tout est manuel pour les flows critiques
  (auth providers, notifications). Si l'app grandit, à ajouter.
- **Pas de CI/CD**. Pour l'instant `npm test` est local seulement. À setup avec GitHub
  Actions Windows runner si souhaité.

---

## Memory persistante Claude (sur cette machine)

Sur ta machine actuelle, Claude Code stocke ses notes dans
`~/.claude/projects/C--Codex-UsageApp-Usage-App/memory/`. Contenu :

- `project_usage_app_pivot.md` — pivot du projet
- `reference_data_sources.md` — endpoints / auth des 4 providers
- `reference_widget_patterns.md` — patterns Electron éprouvés
- `feedback_data_freshness.md`, `feedback_widget_ux.md` — préférences UX

Ces notes sont automatiquement chargées au boot de chaque session Claude sur cette
machine. Inutile de les répéter dans les prompts — ils sont déjà dans le contexte.

---

## En cas de pépin

- **Tests cassés sans modif** : la dance ABI better-sqlite3 — voir gotcha ci-dessus
- **`npm run dev` plante** : idem, rebuild ABI Electron
- **Build dist échoue avec icon < 256** : `package.json win.icon` doit pointer sur un
  .ico avec une entrée ≥ 256, ou sur un .png ≥ 256 (electron-builder convertit)
- **App packagée crash au boot avec « Cannot find module ... »** : un fichier requis n'est
  pas dans `build.files`. Vérifier `npx asar list release/win-unpacked/resources/app.asar`
- **App packagée ouvre une fenêtre vide** : Vite n'a pas build (`npm run build`) avant le
  packaging. Utilise `npm run dist` pas `electron-builder` directement.
- **Tray icon vide** : `build/tray-normal.png` n'est pas dans l'asar. Vérifier
  `build.files`.

---

Bonne reprise 🚀
