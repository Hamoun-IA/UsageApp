# AI Usage Monitor — Pivot vers widget tray d'abonnements perso

**Date** : 2026-05-08
**Statut** : design validé, en attente d'implémentation
**Auteur** : David (avec brainstorming Claude)

## 1. Contexte et motivation

Le projet `C:\Codex\UsageApp\Usage App` (Electron + React + Vite, Windows 10/11) est aujourd'hui un dashboard plein écran qui interroge les **Admin APIs** d'Anthropic et OpenAI (org-level, token-based, cost reports).

Cet usage ne correspond plus au besoin réel : David est sur des **abonnements perso** (Claude Pro/Max, ChatGPT Plus, Ollama Cloud Pro, Z.ai Coding Plan), pas un compte d'orga API. Il utilisait CodexBar pour surveiller ses limites session/weekly, mais CodexBar est devenu instable (parse errors, OAuth qui expire mal, "Failed to parse usage", "Empty output from Claude CLI"). D'où la décision de réécrire son propre tracker, plus solide, en repartant du squelette Electron déjà en place.

### Objectifs

1. Remplacer le dashboard plein écran par un **widget tray discret façon CodexBar** (~340×520px), invocable au clic tray ou raccourci clavier
2. Tracker les **limites Session 5h + Weekly** des 4 abonnements de l'utilisateur
3. Conserver une **fenêtre détaillée** accessible en backup pour les vues riches (history, settings, alerts)
4. Être **plus fiable que CodexBar** : tolérer les expirations, signaler clairement les erreurs, ne jamais afficher de valeur stale silencieusement

### Non-objectifs

- Pas de support multi-comptes (un seul compte par provider)
- Pas de Linux / macOS dans cette première version (Windows-only, comme l'app actuelle)
- Pas de tracking d'usage API admin (le code existant pour ça est obsolète et sera retiré)
- Pas de monétisation, pas de partage de données

## 2. Architecture des données

### 2.1 Adapters par provider

4 modules dans `electron/providers/`, chacun exposant la même interface :

```js
{
  id: 'claude' | 'codex' | 'ollama' | 'zai',
  label: string,
  authMode: 'webview' | 'cli-file' | 'jsonl-tail',
  connect():    Promise<void>,   // OAuth flow ou setup statusLine, persiste secret dans safeStorage
  disconnect(): Promise<void>,   // efface secret persisté
  refresh():    Promise<Snapshot>,
  subscribe(cb): Unsubscribe,    // file-watcher (CLI) ou no-op (cloud)
}
```

`Snapshot` (modèle unifié) :
```js
{
  provider, fetchedAt,
  sessionPct,           // 0..100 ou null si N/A
  weeklyPct,            // 0..100 ou null si N/A
  sessionResetAt,       // ISO 8601 UTC ou null
  weeklyResetAt,        // ISO 8601 UTC ou null
  planLevel,            // "Pro" | "Max" | "Plus" | "Pro Yearly" | etc.
  approximated,         // bool — true pour Codex
  raw,                  // payload original pour debug
  error,                // null si OK, sinon { code, message, retriable }
}
```

### 2.2 Stratégies d'acquisition

#### Anthropic Claude (Claude Pro/Max)
- Setup unique au `connect()` : patch `~/.claude/settings.json` (avec consentement explicite user) pour ajouter un `statusLine.command` qui écrit la payload JSON (incluant les headers `anthropic-ratelimit-unified-5h-*` persistés via [issue #55333](https://github.com/anthropics/claude-code/issues/55333)) dans `~/.claude/usage-latest.json`
- File-watcher (`chokidar` ou `fs.watch`) sur `~/.claude/usage-latest.json` → réagit en ~1s aux modifs
- Limitation assumée : ne se met à jour que quand `claude` tourne en interactif. Quand le CLI est fermé, la donnée gèle. UI affichera "claude inactif" en jaune + heure du dernier update.
- À éviter : parser stdout `claude --print "/status"` (broken, [issue #56138](https://github.com/anthropics/claude-code/issues/56138)), reuse OAuth tokens (= échecs CodexBar)
- Fallback cost-only (non implémenté en v1) : agrégation des `~/.claude/projects/**/*.jsonl` à la `ccusage`

#### OpenAI Codex (ChatGPT Plus tier)
- File-watcher sur `~/.codex/sessions/*.jsonl`, tail des nouveaux events
- Agrégation locale des tokens consommés sur fenêtres glissantes 5h et 7j
- Détection des 429 → flag "out of quota" + estimation reset time
- **Affichage badge "approximé"** dans l'UI car les seuils du plan ne sont pas exposés — on a `usage`, pas `usage / limit`
- Maillon le plus faible du projet, à honorer comme tel

#### Z.ai Coding Plan
- `connect()` : ouvre une `BrowserWindow` Electron vers `https://z.ai/manage-apikey/subscription` (ou `/login` si pas connecté), user fait son login Z.ai. À la fin (détection de la nav vers la page `subscription`), on lit `localStorage['z-ai-open-platform-token-production']` via `window.webContents.executeJavaScript()`, on ferme la fenêtre, on chiffre le JWT dans `safeStorage`.
- `refresh()` : `GET https://api.z.ai/api/monitor/usage/quota/limit` avec header `Authorization: <jwt>` (ou `Bearer <jwt>`)
- Réponse JSON :
  ```json
  {
    "code": 200, "success": true,
    "data": {
      "limits": [
        { "type": "TOKENS_LIMIT", "unit": 3, "percentage": 0 },                                 // 5h
        { "type": "TOKENS_LIMIT", "unit": 6, "percentage": 1, "nextResetTime": <epochMs> },     // weekly
        { "type": "TIME_LIMIT", "unit": 5, "percentage": 0, "nextResetTime": <epochMs>, ... }   // monthly tools (ignoré v1)
      ],
      "level": "pro"
    }
  }
  ```
- Mapping vers `Snapshot` : unit 3 → session, unit 6 → weekly, unit 5 → ignoré v1

#### Ollama Cloud Pro
- `connect()` : `BrowserWindow` vers `https://ollama.com/signin`, user login Google. À la fin (détection nav vers `ollama.com/settings` ou `/`), on persiste le cookie de session (`session.cookies.get({ url: 'https://ollama.com' })`) chiffré dans `safeStorage`.
- `refresh()` : `GET https://ollama.com/settings` avec le cookie. Le serveur renvoie du HTML server-rendered (HTMX, pas d'XHR JSON).
- Parsing avec `cheerio` (à ajouter en deps) :
  - Plan : `<span>Cloud Usage</span>` suivi de `<span>pro</span>`
  - Session : trouver `<span>Session usage</span>`, prendre le `<span>X% used</span>` voisin et le `<div data-time="2026-05-08T16:00:00Z">` voisin (ISO 8601 UTC, machine-readable)
  - Weekly : idem avec `<span>Weekly usage</span>`

### 2.3 Persistance

- **`safeStorage` (DPAPI Windows)** — secrets : token JWT Z.ai, cookie session Ollama. Path Claude/Codex et préférences user en JSON simple non sensible. Réutilise `electron/secrets.js` existant.
- **SQLite (`better-sqlite3`)** — table `usage_snapshots(provider TEXT, fetched_at INTEGER, session_pct REAL, weekly_pct REAL, session_reset_at INTEGER, weekly_reset_at INTEGER, plan_level TEXT, approximated INTEGER, raw_json TEXT)`. Réutilise `electron/db.js` adapté. Rétention configurable (défaut 90j).
- **Settings JSON** — fichier user prefs (raccourci clavier, intervalles, thème, autostart). Sépare des secrets.

### 2.4 Code réutilisé vs refait

| Composant | Statut |
|---|---|
| `electron/main.js` (shell, fenêtre, tray, IPC) | Adapté (gère 2 BrowserWindow + popup + raccourci global) |
| `electron/preload.js` (bridge contextIsolation) | Adapté (nouvelles APIs : `connect`, `disconnect`, `subscribe`) |
| `electron/secrets.js` (safeStorage) | Réutilisé |
| `electron/db.js` (SQLite) | Schéma adapté (table `usage_snapshots`) |
| `electron/scheduler.js` (poll périodique) | Refait (cadence per-provider, file-watchers) |
| `electron/notifier.js` (notifs + alerts) | Réutilisé, framework conservé |
| `electron/providers/*.js` (anthropic, openai, ollama, zai) | **Tout refait** — ancien code Admin API supprimé |
| `src/App.jsx`, `src/components/*` | **Tout refait** — widget compact + fenêtre détaillée |
| `src/lib/api.js` (wrapper window.api) | Adapté |

## 3. UI Widget (popup tray)

### 3.1 Trigger et présentation

- `BrowserWindow` dédié (`widgetWindow`) : frameless, transparent, `alwaysOnTop`, ~340×520px, hidden by default, `skipTaskbar: true`
- Triggers : clic gauche tray → toggle, raccourci clavier global (défaut `Ctrl+Shift+U`, configurable) → toggle
- Position : ancré près du tray (bottom-right Windows), calcul via `screen.getCursorScreenPoint()` + bounds tray
- Fermeture : clic en dehors (`window.blur` event), `Escape`, retoggle

### 3.2 Layout (CodexBar-faithful, validé Q3=A)

```
┌──────────────────────────────────────┐
│ AI Usage                       ●     │  ← titre + indicateur global
│ Mis à jour il y a 12 s               │
├──────────────────────────────────────┤
│ [All] [Claude] [Codex] [Ollama] [Z]  │  ← tabs filter
├──────────────────────────────────────┤
│ ● Claude                    Pro      │  ← orange dot
│   Session 5h          ████░░░░░ 42%  │
│   Resets in 1h 23m                   │
│   Weekly              ██░░░░░░░ 18%  │
│   Resets in 4d                       │
├──────────────────────────────────────┤
│ ● Codex (approximé)         Plus     │  ← vert dot + badge approximé
│   Session 5h          ███░░░░░░ ~30% │
│   Weekly              ░░░░░░░░░ ~5%  │
├──────────────────────────────────────┤
│ ● Ollama                    Pro      │  ← purple dot
│   ...                                │
├──────────────────────────────────────┤
│ ● Z.ai                      Pro      │  ← cyan/bleu dot
│   ...                                │
├──────────────────────────────────────┤
│ ↻ Rafraîchir          ⚙ ⤢            │  ← refresh / settings / detailed view
└──────────────────────────────────────┘
```

### 3.3 Codes couleur (validés)

| Provider | Couleur dot |
|---|---|
| Claude | orange (cohérent identité Anthropic) |
| OpenAI Codex | vert |
| Ollama | purple |
| Z.ai | bleu/cyan (cohérent logo Z.ai) |

### 3.4 Pastille indicateur global (header)

- Verte : tous providers OK + frais
- Orange : 1+ provider stale (> 5min sans update) ou approximé en warning
- Rouge : 1+ provider en erreur (token expiré, parse fail, etc.)

### 3.5 Tab "All" vs tabs spécifiques

- **All** (défaut) : la liste compacte ci-dessus, 4 lignes
- **Tab provider X** (clic sur "Claude", "Codex", etc.) : focus sur 1 seul provider, plus de détails verticaux : sparkline 24h, modèles utilisés (si dispo), reset times précis avec timezone locale

### 3.6 Tray icon

- État repos : icône statique (logo de l'app, à fournir dans `build/icon.ico`)
- Overlay rouge si **n'importe quel** provider dépasse seuil critique : session ≥ 90% **ou** weekly ≥ 95%
- L'overlay disparaît dès que tous les providers redescendent

## 4. Fenêtre détaillée (vue backup)

`mainWindow` ~1100×700px, redimensionnable, accessible via :
- `⤢` du widget (vue Dashboard)
- `⚙` du widget (vue Settings)
- Double-clic sur l'icône tray
- Raccourci `Ctrl+Shift+Alt+U`

Sidebar à 4 onglets :

### 4.1 Dashboard
- Grid 2×2 : 4 cards providers (vs liste compacte du widget)
- Chaque card : Session bar + Weekly bar + reset times + plan + dernier update + sparkline mini-graph 24h (extraite de SQLite)
- Si erreur : bouton "Reconnecter" qui relance la webview OAuth

### 4.2 Historique
- Graphes recharts (déjà en deps) sur 30 jours
- 1 ligne par provider, filtrable
- 2 séries par provider : `session_pct` et `weekly_pct` au fil du temps
- Filtres : provider(s), fenêtre temporelle (24h / 7j / 30j)
- Source : table `usage_snapshots` SQLite

### 4.3 Alertes
- Réutilise le framework existant (`notifier.js` + table alerts)
- Seuils par provider configurables : `session > X%`, `weekly > Y%`, `error persiste > Zh`
- Cooldown 6h conservé (notif déjà déclenchée → silence pendant 6h)
- Notifications Windows natives via `Notification` API Electron

### 4.4 Paramètres
- **Connexions** : 4 cards (Claude, Codex, Ollama, Z.ai) avec :
  - Statut : connecté / déconnecté / token expiré
  - Bouton "Connecter" → lance webview OAuth (Z.ai, Ollama) ou setup statusLine (Claude) ou détection auto (Codex)
  - Bouton "Déconnecter" → efface secret de safeStorage
- **Comportement** :
  - Raccourci clavier widget (capture key combo)
  - Démarrage auto avec Windows (toggle, default OFF)
  - Cadence poll cloud (default 60s, range 30s–5min)
- **Affichage** : thème (dark/light/auto), choix d'icône tray
- **Données** : durée rétention SQLite (default 90j), bouton "Exporter snapshots" (CSV/JSON), bouton "Effacer historique"

### 4.5 Quit logic
- Croix fenêtre détaillée → masque dans le tray (pas de quit)
- Clic droit tray → menu : Ouvrir / Paramètres / **Quitter**
- "Quitter" → sauve un dernier snapshot, ferme proprement les file-watchers, `app.quit()`

## 5. Erreurs et refresh

### 5.1 Cadence

| Provider | Mécanisme | Cadence |
|---|---|---|
| Claude | file watcher `~/.claude/usage-latest.json` | event-driven (~1s après modif) |
| Codex | file watcher `~/.codex/sessions/*.jsonl` | event-driven, debounce 5s |
| Z.ai | HTTP poll | 60s background + force on widget open |
| Ollama | HTTP poll (HTML scrape) | 60s background + force on widget open |

Force-refresh manuel via `↻` du widget : tous providers en parallèle (`Promise.all`).

### 5.2 États d'erreur (validé Q6=A : immédiate inline)

| Situation | Affichage row widget | Action user |
|---|---|---|
| Provider OK | barres + "Mis à jour il y a Xs" | — |
| Token JWT expiré (Z.ai) | rouge, badge "🔒 Reconnect" | clic → relance webview OAuth |
| Cookie expiré (Ollama) | idem | idem |
| `claude` pas tournant | jaune, "claude inactif depuis Xm" + dernière valeur grisée | rien (info) |
| 429 sur Codex | badge "⚠ Quota dépassé" + reset estimé | rien |
| Erreur réseau / parse | rouge, "Erreur fetch — retry dans 60s" | clic = force retry immédiat |
| Pas de connexion provider | grise, "Non configuré — Connecter" | clic → lance OAuth/setup |

### 5.3 Notifications

- Trigger sur seuil dépassé pour la 1ère fois dans la fenêtre courante (pas re-trigger en boucle)
- Trigger sur erreur **persistante > 2h** (pas sur la 1ère erreur, ça spamme)
- Cooldown 6h par notif (préserve l'existant)
- Tray icon overlay rouge en miroir des erreurs critiques

### 5.4 Justification de la fraîcheur stricte

Décision de design : pas de cache stale pour le live display. En gros projet de codage, les limites peuvent passer de 0% à 80%+ en 1h. Afficher la dernière valeur connue même < 1h donne une fausse sécurité. Préférer "données indisponibles" lisible à "vieille valeur potentiellement fausse". Le cache stale n'est utilisé que pour l'historique/audit (table SQLite), jamais pour le live.

## 6. Auto-launch et démarrage

- Option "Démarrer avec Windows" dans Paramètres (default OFF, on demande à l'user)
- Implémentation via `app.setLoginItemSettings({ openAtLogin, args: ['--minimized'] })`
- Quand lancé avec `--minimized` : pas de fenêtre détaillée ouverte, juste le tray + popup widget disponible
- Premier launch : ouvre la fenêtre détaillée onglet Paramètres, prompt pour connecter au moins 1 provider

## 7. Risques et points ouverts

### 7.1 Risques techniques

- **`~/.claude/usage-latest.json` chemin/format pas confirmé** : issue #55333 close mais nom de fichier final à vérifier dans la dernière release de Claude Code. Plan B si différent : adapter le path après vérification (variable de config), garder fallback ccusage.
- **Z.ai et Ollama sont du reverse engineering** : si Z.ai change la structure JSON ou Ollama redesigne sa page settings, la lecture casse. Mitigation : tests d'intégration manuels au release de chaque provider, parsing défensif (try/catch + fallback message clair "format inattendu, ouvre une issue").
- **Token JWT Z.ai expire** : durée d'expiration inconnue, à observer en prod. Si court, `connect()` doit gérer le silent refresh (relance webview cachée si token < 24h).
- **OAuth scraping ToS** : techniquement on lit du localStorage / cookies de l'utilisateur connecté à son propre compte — pas de scraping abusif. Mais reste à mentionner clairement dans un README/disclaimer.

### 7.2 À décider plus tard (hors scope v1)

- Multi-comptes (1 user, plusieurs Claude orgs ou plusieurs comptes z.ai)
- Support macOS / Linux (paths `~/.claude` diffèrent peu, mais `safeStorage` = Keychain/keyring, à tester)
- Export de données vers Grafana / Prometheus
- Mode "team" partagé (broadcast usage à des collègues)

## 8. Migration depuis l'app actuelle

À supprimer (code obsolète) :
- Tous les `electron/providers/*.js` (anthropic, openai, ollama, zai) — cibles Admin API
- Tous les composants frontend liés au tracking org-level (Dashboard, History, etc. dans leur version actuelle)
- Schéma SQLite actuel (table `snapshots` avec colonnes `input_tokens`, `output_tokens`, etc.)
- README sections sur Admin API et keys correspondantes

À conserver (squelette) :
- `electron/main.js`, `preload.js`, `secrets.js`, `db.js` (adapter), `scheduler.js` (refaire), `notifier.js`
- Build pipeline (Vite, electron-builder, NSIS)
- `package.json` dependencies (sauf `axios`/fetch lib si pas utilisé — à vérifier)

À ajouter (nouvelles deps) :
- `cheerio` (HTML parsing Ollama)
- `chokidar` (file-watching plus robuste que `fs.watch` natif sur Windows)
- Optionnel : `node-fetch` ou stick à `fetch` natif Node 20+

## 9. Critères de succès

1. Le widget s'ouvre en < 200ms après clic tray
2. Les 4 providers affichent une donnée correcte au moins 95% du temps quand ils sont configurés et que les sources upstream marchent
3. Aucun provider ne silently freeze sur une vieille valeur — toute donnée > 5min affiche "stale" visiblement
4. Les expirations de tokens ne bloquent pas l'utilisation : un clic sur "Reconnect" suffit, pas de redémarrage de l'app
5. L'app survit aux mises à jour des CLIs Claude/Codex (parsing défensif, log d'erreurs visible)
