# M4 Handoff — démarrer la session detail window

Tu démarres dans un worktree fraîchement créé au tip de master (post-merge M3.6).

## Setup

1. Vérifier que tu es au bon endroit:
   ```
   git status                       # branch should be feat/m4-detail-window
   git log --oneline -2              # HEAD = 976e718 Merge feat/widget-pivot
   ```
2. Installer les deps si besoin (le worktree partage `.git` mais pas `node_modules`):
   ```
   npm install
   ```
3. Tests baseline:
   ```
   npm test                          # expect 74 tests passing
   ```

## Plan à exécuter

[`docs/superpowers/plans/2026-05-08-m4-detail-window.md`](plans/2026-05-08-m4-detail-window.md)

9 tasks (4.0 → 4.9). Use `superpowers:subagent-driven-development`. Same pattern as M3 (implementer → spec reviewer → code quality reviewer per task).

## Scope final (validé)

- **4 pages complètes**: Dashboard, History, Alerts, Settings.
- **Sparklines Dashboard**: SVG pur (pas recharts).
- **History**: recharts (déjà installé dans `package.json`).
- **Branche**: `feat/m4-detail-window` → merge `--no-ff` sur master à la fin.
- **Tag final**: `m4-detail-window`.
- **Test target**: ≥ 90 tests.

## Ce qui marche déjà

4 providers (zai, ollama, claude, codex) retournent des snapshots valides via `window.api.providers.refreshAll()`. Le widget tray popup auto-resize et affiche les 4 lignes. Le clic ⤢ ouvre une `mainWindow` 1200×800 qui charge `src/detail/App.jsx` (placeholder vide aujourd'hui). 74 tests passent.

## Ce qui n'existe pas encore

- Pas d'historique persisté (les snapshots arrivent via IPC mais ne sont pas insérés dans `usage_snapshots` — Task 4.0 corrige ça).
- Pas de routing dans `App.jsx` (Task 4.1).
- Pas de pages réelles (Tasks 4.3 → 4.6).
- Pas de wiring du bouton ⤢ vers la mainWindow depuis le widget (Task 4.7).
- Pas de quit logic propre (Task 4.8 — verify only).

## Memories à consulter

- [project_usage_app_pivot](../../../../../Users/David/.claude/projects/C--Codex-UsageApp-Usage-App/memory/project_usage_app_pivot.md)
- [reference_data_sources](../../../../../Users/David/.claude/projects/C--Codex-UsageApp-Usage-App/memory/reference_data_sources.md)
- [reference_widget_patterns](../../../../../Users/David/.claude/projects/C--Codex-UsageApp-Usage-App/memory/reference_widget_patterns.md)
- [feedback_data_freshness](../../../../../Users/David/.claude/projects/C--Codex-UsageApp-Usage-App/memory/feedback_data_freshness.md)
- [feedback_widget_ux](../../../../../Users/David/.claude/projects/C--Codex-UsageApp-Usage-App/memory/feedback_widget_ux.md)

## Démarrage suggéré au user

> "Reprends ce projet. Lis `docs/superpowers/HANDOFF-M4.md`, puis le plan d'implémentation, puis attaque-toi à M4 avec `superpowers:subagent-driven-development`."
