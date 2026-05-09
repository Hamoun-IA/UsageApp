# M5 — Polish & Background Operation : Design Spec

> Source de vérité validée pour Milestone 5. Issue de la session de brainstorming du 2026-05-09.
> Plan d'implémentation détaillé : voir `docs/superpowers/plans/2026-05-09-m5-polish.md` (à écrire après validation de cette spec).

## Contexte

L'app `AI Usage Monitor` est aujourd'hui à la fin de M4 : 4 providers fonctionnels, widget tray popup, fenêtre détaillée 4 pages (Dashboard / History / Alerts / Settings), 222 tests passants. Mais elle n'est **pas autonome** : si les deux fenêtres sont fermées, plus aucun refresh, plus aucune évaluation d'alertes, plus aucune notification. M5 transforme l'app en outil quotidien qui tourne en background dans le tray, alerte au bon moment, et est configurable.

## Problèmes adressés

1. **Pas de polling background** — `evaluateAlerts` n'est appelé que lors d'un refresh user-triggered (clic widget, ouverture Dashboard). Si l'user ferme tout, l'app dort.
2. **Notifications natives manquantes** — `evaluateAlerts` log les alertes en DB mais ne fait jamais `Notification.show()`.
3. **Tray icon statique** — aucune indication visuelle quand un provider passe critical.
4. **Global shortcut hardcodé** — `Ctrl+Shift+Alt+U` non configurable, alors que la Settings page promet "Configurable dans M5".
5. **Auto-launch incomplet** — IPC `app:setAutostart` enregistre `--minimized` mais main.js n'honore pas le flag.
6. **Code obsolète sur disque** — `electron/scheduler.js` + `electron/notifier.js` réfèrent l'ancien schéma DB pré-pivot.
7. **Tray icon placeholder** — `build/icon.png` est un PNG noir basique.
8. **README périmé** — décrit l'ancienne version Admin API.

## Scope final (validé par 8 questions de brainstorm)

### 1. Background poller — cadence unique configurable

- Une seule classe `Poller` dans `electron/poller.js` qui wrap un `setInterval`.
- Cadence configurable via Settings : **1 min / 5 min / 15 min**, défaut **5 min**.
- Persistée sous `app_prefs.pollIntervalMin`.
- Pas de cadence par-provider, pas de file-watch chokidar : tout passe par l'interval unique. (Codex.js relit déjà le JSONL le plus récent à chaque appel, donc reste réactif en pratique.)
- **Skip-if-running guard** : si un tick est encore in-flight quand l'interval refire, le second est skip silencieusement.
- Au tick : appelle `refreshAllAndPersist`, puis `onResults({ snaps, newAlerts })` callback côté main.

### 2. Tray icon overlay rouge

- **Critère "critical"** : entrée non périmée dans `app_prefs.alertLog` (= seuil dépassé dans les 6h dernières, donc dans la fenêtre de cooldown du système d'alertes).
- Mécanisme : deux PNG pré-bakés `build/tray-normal.png` et `build/tray-critical.png` (+ retina @2x) commit'és dans le repo. Au boot et après chaque refresh, le main process appelle `updateTrayIcon(tray, ...)` qui choisit lequel charger via `tray.setImage(nativeImage.createFromPath(...))`.
- Génération des artefacts : choix d'implémentation (script Node one-off avec `pngjs` devDep ou pre-made via image editor — décision côté plan, pas spec). Look basique acceptable. L'user pourra plus tard remplacer les bytes des fichiers sans changement de code.

### 3. Configurable global shortcut

- UX **press-to-record** : nouveau composant `<ShortcutInput>` dans Settings. Click "Modifier" → input passe en mode capture → user appuie sur la combinaison voulue → on assemble l'Accelerator Electron format (`CommandOrControl+Shift+Alt+K`), valide (≥ 1 modifier + 1 key non-modifier), tente `globalShortcut.register`, persiste si OK.
- Persisté sous `app_prefs.globalShortcut`. Défaut `'CommandOrControl+Shift+Alt+U'`.
- Sur conflit (combo déjà prise par un autre process Windows), `register()` retourne `false` → UI affiche "Déjà utilisée par un autre process", l'ancien shortcut reste actif, rien n'est persisté.
- Esc pendant capture → annule.

### 4. Notifications natives — bundlées par provider

- `evaluateAlerts` retourne déjà `newAlerts[]` post-cooldown. M5 ajoute `electron/notify.js` qui :
  - Groupe `newAlerts` par provider.
  - Émet **une** `new Notification({ title, body }).show()` par provider, body listant tous les types triggered (ex. `"Claude : session 92 %, weekly 88 %"`).
  - No-op si `Notification.isSupported() === false`.
- Le poller appelle `fireAlertNotifications(allNewAlerts)` après chaque tick.
- Pas de rate-limiting global supplémentaire : la cooldown 6h de `evaluateAlerts` suffit.

### 5. Auto-launch — boot tray-only par défaut

- **Aujourd'hui** : `BrowserWindow` constructeur utilise `show: true` par défaut → `createWindow()` au boot affiche immédiatement la fenêtre détaillée 1200×800. Comportement non-désiré pour une app tray.
- **M5** : changer `BrowserWindow({ ..., show: false })` dans `createWindow()`. La fenêtre détaillée n'apparaît plus qu'en réponse à une action user (tray double-click, widget ⤢, IPC `app:openDetail`/`app:openSettings`).
- Effet de bord : le flag `--minimized` (déjà passé par `app:setAutostart`) devient un no-op puisque le boot est déjà tray-only. On garde l'arg en place pour cohérence/futur, mais main.js ne le parse pas.

### 6. Suppression `scheduler.js` + `notifier.js`

- Les deux fichiers réfèrent un schéma DB qui n'existe plus (`getProviderConfigs`, `getMonthToDateTotals`, alerts `kind: 'budget_pct'`, etc.).
- Suppression complète. Aucun fichier ne les require'.
- Tests associés (s'il y en a) supprimés aussi.

### 7. README rewrite

- Réécriture complète : intro projet (widget tray pour limites d'abos perso Claude/ChatGPT/Ollama/Z.ai), install/dev/build/dist, comment connecter chaque provider, troubleshooting, license.
- Screenshots optionnels (peuvent venir post-M5).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  electron/main.js (boot orchestration)                          │
│  - reads prefs (pollIntervalMin, globalShortcut)                │
│  - registers shortcut (with conflict fallback)                  │
│  - honors --minimized                                            │
│  - new Poller({ ... }).start(intervalMs)                        │
│  - on tick result: fireAlertNotifications + updateTrayIcon       │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  electron/poller.js                                              │
│  class Poller {                                                  │
│    constructor({ refreshAll, onResults, deps })                  │
│    start(intervalMs); stop(); setInterval(ms);                   │
│    private tick() { skip-if-running; await refreshAll(); ...}    │
│  }                                                                │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  electron/refresh-providers.js (extracted helper)                │
│  refreshAndPersist(database, db, alerts, getAdapter, providerId) │
│    → { snap, newAlerts }                                         │
│  refreshAllAndPersist(database, db, alerts, listAdapters)        │
│    → { snaps, newAlerts }                                        │
└─────────────────────────────────────────────────────────────────┘
            │                                   │
            │ snaps                             │ newAlerts
            ▼                                   ▼
┌──────────────────────────┐      ┌─────────────────────────────┐
│  electron/tray-state.js  │      │  electron/notify.js          │
│  updateTrayIcon(...)     │      │  fireAlertNotifications(...) │
│  - reads alertLog        │      │  - groupBy(provider)         │
│  - 6h window check       │      │  - new Notification each     │
│  - tray.setImage         │      │  - no-op if unsupported      │
└──────────────────────────┘      └─────────────────────────────┘

Settings UI changes:
  src/detail/components/ShortcutInput.jsx (NEW) — press-to-record
  src/detail/pages/Settings.jsx — +Fréquence section, +Raccourci section

IPC additions:
  app:setPollInterval(min)         (side effect: poller.setInterval)
  app:setGlobalShortcut(acc)       (side effect: globalShortcut re-register, returns { ok, reason? })
  (read side: renderer uses generic db.getPref for both, no dedicated IPC)
```

## Composants

| Fichier | Rôle | Surface | LOC |
|---|---|---|---|
| `electron/refresh-providers.js` | Helper extrait de ipc.js : refresh + insertSnapshot + evaluateAlerts en une seule fonction réutilisable. | `{ refreshAndPersist, refreshAllAndPersist, deps }` | ~60 |
| `electron/poller.js` | Classe Poller (start/stop/setInterval). Skip-if-running guard. Inject deps pour testabilité. | `class Poller` | ~70 |
| `electron/notify.js` | `fireAlertNotifications(newAlerts)`. Inject `Notification` constructor. | `{ fireAlertNotifications, deps }` | ~50 |
| `electron/tray-state.js` | `updateTrayIcon(tray, database, db, paths, now)`. Lit alertLog, swap PNG. | `{ updateTrayIcon, deps }` | ~60 |
| `src/detail/components/ShortcutInput.jsx` | Press-to-record kbd capture. Props value/onChange/onError. | React component | ~100 |
| `build/tray-{normal,critical}{,@2x}.png` | Artefacts statiques (pas de code runtime). Génération one-off avec `pngjs` ou outil externe. | 4 fichiers PNG ≈ 16×16 et 32×32 | n/a |

**Modifs** :
- `electron/ipc.js` : refactor `providers:refresh*` pour utiliser `refreshAndPersist`. Ajouter 2 IPC : `app:setPollInterval(min)` (persiste pref + reset poller) et `app:setGlobalShortcut(accelerator)` (unregister/register, retourne `{ ok, reason? }`). Lecture des prefs côté renderer reste via `db:getPref` générique.
- `electron/main.js` : lire prefs, instancier Poller, register shortcut configurable, honorer `--minimized`, wire onResults.
- `electron/preload.js` : exposer les 4 nouveaux IPC.
- `src/detail/pages/Settings.jsx` : ajouter sections Fréquence + Raccourci.

**Suppressions** : `electron/scheduler.js`, `electron/notifier.js`, tests associés s'ils existent.

## Data flow — un tick complet

1. `setInterval` firing → `Poller.tick()`
2. Skip si `this.running === true`. Sinon `this.running = true`.
3. Appel `refreshAllAndPersist(database, db, alerts, listAdapters)` qui :
   - `Promise.allSettled` sur tous les `adapter.refresh()`
   - Pour chaque snap fulfilled : `db.insertSnapshot` + `alerts.evaluateAlerts` (récolte les newAlerts)
   - Retourne `{ snaps: [...], newAlerts: [{ provider, type, threshold, value, at }, ...] }`
4. Callback `onResults({ snaps, newAlerts })` :
   - `fireAlertNotifications(newAlerts)` → 0..N toasts Windows
   - `updateTrayIcon(tray, database, db)` → re-lit alertLog, choisit le PNG à charger
5. `this.running = false`.

## Error handling

| Situation | Comportement |
|---|---|
| Poller tick alors qu'un autre est in-flight | Skip silencieux (`this.running` guard). |
| Adapter `refresh()` reject | `Promise.allSettled` filtre. Le snap n'est ni persisté ni évalué. Autres providers continuent. |
| `evaluateAlerts` throw | Try/catch dans `refreshAndPersist`, log `console.error`, snap quand même persisté en DB. |
| `Notification.isSupported() === false` | `fireAlertNotifications` no-op silencieux. |
| `tray.setImage` avec PNG manquant | `nativeImage.createFromPath` retourne empty image. Garde la dernière icône valide, log warning. |
| Pref `pollIntervalMin` corrompue (négative, null, string) | Validation lecture : `Number.isFinite(v) && v >= 1 && v <= 60` → utilise, sinon fallback 5. |
| Pref `globalShortcut` corrompue/format invalide | `globalShortcut.register` retourne `false`, fallback sur défaut `Ctrl+Shift+Alt+U`. Si défaut lui-même fail : log warning, app fonctionne sans shortcut. |
| `app:setGlobalShortcut` échoue (combo prise) | Renvoie `{ ok: false, reason: 'CONFLICT' }`. UI Settings affiche message, ne persiste pas, ancien shortcut reste actif. |
| ShortcutInput : user appuie juste un modifier | Validation côté composant : ≥ 1 modifier ET 1 key non-modifier. Sinon recording continue. |
| Boot tray-only | `BrowserWindow({ show: false })` dans `createWindow()`. Fenêtre détaillée n'apparaît qu'en réponse à action user. `--minimized` arg devient un no-op. |
| `alertLog` entrées malformées | `updateTrayIcon` filtre comme Alerts.jsx : `typeof entry.at === 'number' && Number.isFinite(entry.at)`. |
| User change interval pendant tick in-flight | Tick en cours finit normalement, prochain part au nouveau rythme. Pas de réentrance. |
| App quitte pendant un tick | `app.on('before-quit')` → `poller.stop()` → `clearInterval`. Promise en cours laissée orpheline (acceptable). |

## Testing approach

Vitest + happy-dom + deps injection (pattern existant).

| Module | Tests | Cible |
|---|---|---|
| `refresh-providers` | `tests/refresh-providers.test.js` | ~6-8 |
| `poller` | `tests/poller.test.js` (fakeTimers) | ~6-8 |
| `notify` | `tests/notify.test.js` | ~5-6 |
| `tray-state` | `tests/tray-state.test.js` | ~5-7 |
| `ShortcutInput` | `tests/detail/shortcut-input.test.jsx` (RTL) | ~6 |
| `Settings.jsx` (extension) | `tests/detail/settings-page.test.jsx` (+3) | ~3 |
| `ipc.js` (extension) | `tests/ipc-app-settings.test.js` (+6) | ~6 |
| `main.js` boot | manuel | 0 |

**Cible quantitative** : 222 → ~262 tests (+40).

**Tests manuels à exécuter en fin de M5** (checklist) :

1. `npm run dev` → tray icon visible, pas de crash console
2. Boot sans flag → widget popup pas auto-ouverte
3. Attendre 5 min sans toucher → poller tick observable (log)
4. Forcer un seuil (ex. `t.session = 1` pour Z.ai) → next refresh → toast Windows + tray icon devient critical
5. Settings → changer Fréquence à 1 min → vérifier que poller tick à T+60s
6. Settings → ShortcutInput → press `Ctrl+Alt+M` → ancien shortcut désactivé, nouveau actif
7. Activer autostart, redémarrer Windows → app boote en mode tray-only (icône tray présente, fenêtre détaillée NON visible jusqu'à action user)
8. Quit via tray menu → vraie sortie process

## Out of scope (post-M5)

- Vraie icône tray "designed" (les PNG générés sont fonctionnels mais basiques — slot prête pour swap manuel ultérieur).
- Cadence par-provider distincte (codex local pourrait être 30s, cloud 5min). Décidé inutile : codex.js relit le JSONL à chaque appel, c'est déjà event-driven en pratique.
- File-watch chokidar.
- Sentry / telemetry.
- Tests E2E Playwright.
- Badge tray avec compteur (ex. "3 alertes"). Le dot rouge suffit.

## Risques

| Risque | Mitigation |
|---|---|
| `globalShortcut.register` peut échouer silencieusement sur Windows si l'OS prend la combo | Validation au register : si `false`, on garde l'ancienne, on n'écrase pas la pref. UI Settings affiche l'erreur. |
| Poller hammer les endpoints cloud → rate-limit Cloudflare (Claude/Z.ai) | Cadence par défaut 5 min. Min 1 min reste raisonnable (cf. tests M2/M3). |
| `Notification` toasts spammés au boot après une longue inactivité | `evaluateAlerts` cooldown 6h dédoublonne déjà par (provider, type). |
| Tray icon swap rapide qui clignote (refresh manuel + poller tick proches) | `setImage` est synchrone et idempotent : pas de flash visible. |
| User enlève les fichiers PNG à la main | `nativeImage.createFromPath` retourne empty, on log warning, app continue avec la dernière icône en mémoire. |

## Définition de "done" pour M5

- 8 tests manuels listés ci-dessus tous OK
- ~262 tests automatisés passants (+40)
- `electron/scheduler.js` et `electron/notifier.js` supprimés du repo
- README à jour, lisible par quelqu'un qui découvre le projet
- Branche `feat/m5-polish` (ou nom équivalent) merge `--no-ff` sur master
- Tag final `m5-polish`
