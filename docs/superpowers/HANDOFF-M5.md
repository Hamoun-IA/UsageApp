# M5 Handoff — démarrer la session polish & background

Tu démarres dans un worktree fraîchement créé sur la branche post-merge M4.

## Setup

1. Vérifier que tu es au bon endroit :
   ```
   git status                       # working tree clean expected
   git log --oneline -3              # HEAD should show M5 spec/plan commits, parent = 3b9177c (Merge M4)
   ```
2. Installer les deps si besoin (le worktree partage `.git` mais pas `node_modules`) :
   ```
   npm install
   ```
3. **Vérification critique** : si `npm test` plante avec `NODE_MODULE_VERSION` mismatch sur `better-sqlite3`, c'est que le rebuild post-install a ciblé l'ABI Electron au lieu de Node. Fix :
   ```
   cd node_modules/better-sqlite3
   npm run build-release
   cd ../..
   ```
4. Tests baseline :
   ```
   npm test                          # expect 222 tests passing
   ```

## Documents clés

| Fichier | Rôle |
|---|---|
| [docs/superpowers/specs/2026-05-09-m5-polish-design.md](specs/2026-05-09-m5-polish-design.md) | **Spec validée** : scope, architecture, error handling, testing approach. Source de vérité pour le "quoi". Issue de la session de brainstorming Q1-Q8. |
| [docs/superpowers/plans/2026-05-09-m5-polish.md](plans/2026-05-09-m5-polish.md) | **Plan d'implémentation** : 12 tasks TDD (5.0 → 5.11), code complet par task. Source de vérité pour le "comment". |
| Cette page | Snapshot setup + comment reprendre |

## Plan à exécuter

[`docs/superpowers/plans/2026-05-09-m5-polish.md`](plans/2026-05-09-m5-polish.md)

12 tasks (5.0 → 5.11). Use `superpowers:subagent-driven-development`. Same pattern as M3/M4 (implementer → spec reviewer → code quality reviewer per task).

## Scope final (validé par 8 questions de brainstorm)

1. **Background poller** : single configurable interval (1/5/15 min, défaut 5)
2. **Tray icon overlay rouge** : basé sur alertLog 6h window, deux PNG pré-bakés
3. **Configurable global shortcut** : press-to-record kbd capture, défaut `Ctrl+Shift+Alt+U`
4. **Notifications natives** : bundlées par provider
5. **Boot tray-only** : `BrowserWindow({ show: false })`, fenêtre détaillée n'apparaît qu'à action user
6. **Cleanup** : delete `electron/scheduler.js` + `electron/notifier.js` (obsolètes pré-pivot)
7. **README rewrite** : intro, install, connexions, troubleshooting

- **Branche** : continuer sur la branche courante (worktree dédié) → merge `--no-ff` sur master à la fin
- **Tag final** : `m5-polish`
- **Test target** : ~262 tests passants (+40 vs baseline 222)

## Ce qui marche déjà (post-M4)

- 4 providers retournent des snapshots valides
- Widget tray popup fonctionne, auto-resize
- Fenêtre détaillée 4 pages : Dashboard (sparklines SVG), History (recharts 30d), Alerts (seuils + log), Settings (connexions, autostart, retention, shortcut hardcodé)
- IPC `app:setAutostart` enregistre `--minimized` mais main.js ne l'honore pas (M5 corrige via `show: false`)
- Quit logic propre (close→hide, tray Quit, window-all-closed gate)
- `evaluateAlerts` log les alertes en DB (mais pas de notification native — M5 ajoute)

## Ce qui n'existe pas encore

- Pas de polling background (seulement refresh user-triggered ou via Dashboard 60s interval)
- Pas de notifications natives Windows
- Tray icon statique (placeholder PNG)
- Global shortcut hardcodé dans main.js
- Fichiers obsolètes `scheduler.js` + `notifier.js` toujours sur disque
- README périmé

## Memories à consulter

- [project_usage_app_pivot](../../../../../Users/David/.claude/projects/C--Codex-UsageApp-Usage-App/memory/project_usage_app_pivot.md)
- [reference_data_sources](../../../../../Users/David/.claude/projects/C--Codex-UsageApp-Usage-App/memory/reference_data_sources.md)
- [reference_widget_patterns](../../../../../Users/David/.claude/projects/C--Codex-UsageApp-Usage-App/memory/reference_widget_patterns.md)
- [feedback_data_freshness](../../../../../Users/David/.claude/projects/C--Codex-UsageApp-Usage-App/memory/feedback_data_freshness.md)
- [feedback_widget_ux](../../../../../Users/David/.claude/projects/C--Codex-UsageApp-Usage-App/memory/feedback_widget_ux.md)

## Démarrage suggéré au user

> "Reprends ce projet. Lis `docs/superpowers/HANDOFF-M5.md`, puis le plan d'implémentation, puis attaque-toi à M5 avec `superpowers:subagent-driven-development`."

## Quand M5 est fini

1. Squash + merge la branche M5 → `master` avec `--no-ff`
2. Tag de release `m5-polish` (créé en task 5.11) + éventuel `v0.2.0-widget`
3. Build NSIS + portable : `npm run dist`
4. Tester l'installeur sur ta machine
5. Déposer la release ou utiliser le portable directement
