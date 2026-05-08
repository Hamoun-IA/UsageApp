# AI Usage Monitor — Handoff (2026-05-08)

Document de reprise pour relancer ce projet dans une nouvelle session Claude Code (ou pour toi si tu veux replonger plus tard).

## TL;DR

Refonte de l'app `C:\Codex\UsageApp\Usage App` (Electron + React) d'un dashboard Admin API vers un widget tray discret façon CodexBar qui tracke les limites d'abonnements perso (Claude Pro/Max, ChatGPT Plus, Ollama Cloud Pro, Z.ai Coding Plan).

**Statut** : Milestones 1 + 2 livrés. Branche `feat/widget-pivot`, 16 commits, 29 tests passants. App boote, widget popup au tray fonctionne, **Z.ai end-to-end opérationnel**.

**Reste à faire** : M3 (3 autres providers + tabs UI), M4 (fenêtre détaillée), M5 (polish).

## Documents clés

| Fichier | Rôle |
|---|---|
| [docs/superpowers/specs/2026-05-08-usage-widget-design.md](specs/2026-05-08-usage-widget-design.md) | **Spec validée** : architecture, UI, comportements, risques. Source de vérité pour le "quoi". |
| [docs/superpowers/plans/2026-05-08-usage-widget-implementation.md](plans/2026-05-08-usage-widget-implementation.md) | **Plan d'implémentation** : M1 + M2 + M3 détaillés en TDD steps, M4 + M5 esquissés. Source de vérité pour le "comment". |
| Cette page | Snapshot du statut + comment reprendre |

## État du repo

- **Branche** : `feat/widget-pivot` (parent : `master` à `81f4f7e`, initial commit pré-pivot)
- **Tags** : `m1-foundation` (= b462e54) et `m2-zai-end-to-end` (= 31b819e)
- **Tests** : 29 passants via Vitest (`npm test`)
- **Build** : `npx vite build` produit `dist/index.html` + `dist/widget.html` correctement
- **Boot** : `npm run dev` lance Vite + Electron sans crash, tray icon apparaît

## Ce qui marche aujourd'hui (à tester manuellement)

1. `cd "C:\Codex\UsageApp\Usage App" && npm run dev`
2. Tray icon apparaît (icône PNG noire placeholder dans `build/icon.png` — à remplacer par une vraie icône en M5)
3. Clic gauche tray → widget popup ~340×540px ouvre près du tray
4. 4 lignes provider visibles avec leurs couleurs (Claude orange, Codex vert, Ollama purple, Z.ai cyan)
5. Toutes affichent "Connecter" (NOT_CONFIGURED) sauf si déjà connecté
6. Clic "Connecter" sur **Z.ai** → fenêtre login z.ai → après login, capture du JWT → fenêtre se ferme → widget refresh auto → Z.ai affiche barres Session 5h + Weekly avec ton % réel
7. Clic "↻ Rafraîchir" → re-fetch tous providers
8. Clic en dehors du widget → se cache. Re-clic tray → ré-apparaît.

⚠️ Les 3 autres providers (Claude, Codex, Ollama) ont toujours "Connecter" avec un throw → c'est attendu, ils sont stubs en M2. Ils s'implémentent en M3.

## Architecture installée

```
electron/
  main.js                       # 88 lignes, propre. Tray + widget toggle + IPC wiring.
                                # scheduler/notifier commentés (réactiver en M5).
  preload.js                    # 11 lignes, expose window.api.providers.*
  ipc.js                        # 5 IPC handlers : list / refresh / refreshAll / connect / disconnect
  widget-window.js              # BrowserWindow popup 340×540 frameless transparent always-on-top
  db.js                         # SQLite v2 schema : usage_snapshots, provider_settings, app_prefs
  secrets.js                    # safeStorage DPAPI + getProviderSecret/setProviderSecret/clearProviderSecret
  scheduler.js                  # ⚠ obsolète, sera refactor en M5
  notifier.js                   # ⚠ obsolète, sera refactor en M5
  providers/
    types.js                    # Snapshot + ProviderError + isValidSnapshot validator
    index.js                    # Registry : getAdapter, listAdapters + back-compat get/list
    zai.js                      # ✅ Z.ai full implementation (deps injection pattern)
    zai-parser.js               # ✅ Pure parser pour /api/monitor/usage/quota/limit
    zai-connect.js              # ✅ Webview JWT capture
    claude.js                   # 🔲 stub (M3)
    codex.js                    # 🔲 stub (M3)
    ollama.js                   # 🔲 stub (M3)

src/
  shared/
    snapshot-utils.js           # formatRelativeTime, severityFor, formatResetIn, PROVIDER_COLORS, PROVIDER_LABELS
  widget/
    main.jsx                    # Entry React du widget
    Widget.jsx                  # 47 lignes, refresh-all + map vers ProviderRow
    components/
      ProgressBar.jsx           # Bar 6px hauteur
      ProviderRow.jsx           # NOT_CONFIGURED / AUTH_EXPIRED / NETWORK / success states
  detail/
    main.jsx                    # Entry React fenêtre détaillée
    App.jsx                     # Placeholder "Sera implémenté en M4"

tests/                          # 7 fichiers, 29 tests Vitest (happy-dom)
```

## Conventions et pièges (lessons learned de M1 + M2)

### CJS / ESM
- Tout sous `electron/` est **CJS** (`require`/`module.exports`) — package.json est `"type": "commonjs"`
- Tout sous `src/` est **ESM** (Vite bundler)
- Tests sous `tests/` sont ESM, Vitest gère l'interop
- `vitest.config.mjs` (extension `.mjs` pour ESM dans projet CJS)

### Pattern `deps` pour mocker les providers
**`vi.mock()` n'intercepte PAS les `require()` dans des modules CJS appelés par d'autres modules CJS.** Solution adoptée dans `electron/providers/zai.js` :

```js
const deps = {
  secrets: require('../secrets'),
  captureZaiToken,
};
// ...
async function connect() {
  const token = await deps.captureZaiToken();
  deps.secrets.setProviderSecret(id, token);
}
module.exports = { /* …, */ deps };
```

Tests :
```js
const zai = await import('../../electron/providers/zai.js');
zai.deps.secrets = { getProviderSecret: vi.fn(), /* … */ };
```

Tous les futurs adapters (claude.js, codex.js, ollama.js) doivent suivre ce pattern.

### Snapshot validator strict
`isValidSnapshot` valide aussi le shape de l'erreur (`{ code: string, message: string, retriable: boolean }`). Tout snapshot retourné par `refresh()` DOIT le passer. Cf. `electron/providers/types.js`.

### Helpers DB disponibles
```js
const db = require('./db');
db.insertSnapshot(dbInstance, snap);
db.recentSnapshots(dbInstance, provider, sinceMs);
db.getProviderSettings(provider);
db.upsertProviderSettings({ provider, connected, ... });
db.getPref(key);
db.setPref(key, value);
```

### Helpers secrets disponibles
```js
const { setProviderSecret, getProviderSecret, clearProviderSecret } = require('./secrets');
setProviderSecret('zai', jwtString);            // chiffré DPAPI
const jwt = getProviderSecret('zai');           // string ou null
clearProviderSecret('zai');                     // unlink
```

## Comment reprendre dans une nouvelle session Claude

1. **Donne-lui le contexte** :
   > "Reprends ce projet. Lis `docs/superpowers/HANDOFF.md`, puis le plan d'implémentation, puis attaque-toi au Milestone 3."

2. **Le plan M3 est détaillé** dans le doc d'implémentation, à partir de la section "Milestone 3 — Provider portfolio". 9 tasks bite-sized, mêmes patterns TDD que M1 + M2.

3. **Pour M3, dis-lui d'utiliser `superpowers:subagent-driven-development`** — c'est ce qu'on a fait pour M1 + M2 et ça marche bien. Skill : Subagent-Driven Development.

4. **Avant de lancer M3 implementation**, deux investigations valent un check rapide :
   - **Claude Code statusLine** : vérifier que `~/.claude/usage-latest.json` (ou path équivalent post-issue #55333) est bien généré par la dernière version de Claude. Lancer `claude` une fois et inspecter `~/.claude/`.
   - **Codex sessions JSONL shape** : ouvrir un fichier `~/.codex/sessions/*.jsonl` réel et confirmer la structure des events (les Tasks 3.6 supposent `{ timestamp, usage: { input_tokens, output_tokens } }`).

5. **M4 + M5 sont esquissés** mais pas en TDD steps. Il faudra écrire leurs plans détaillés au fur et à mesure (le plan a la convention "plan détaillé à écrire après MN" — c'est volontaire pour ne pas figer trop tôt).

## Petites dettes techniques à régler en M5

- `electron/scheduler.js` et `electron/notifier.js` sont sur disque mais désactivés dans main.js. Référencent l'ancienne API DB. À refondre.
- `build/icon.png` est un placeholder PNG noir. Remplacer par une vraie icône.
- `vite.config.js` a un warning "CJS build of Vite's Node API is deprecated". À surveiller.
- Pas de tests E2E Electron (BrowserWindow). Manuel uniquement. OK pour l'instant.
- `coverage` v8 dépendance ajoutée mais pas utilisée — `npm test -- --coverage` marche.

## Memory persistante Claude (Windows user)

Saved memory entries pour contexte cross-session :
- `project_usage_app_pivot.md` — pivot projet
- `reference_data_sources.md` — endpoints + auth pour les 4 providers (research live via Chrome MCP)
- `feedback_data_freshness.md` — préférence : ne jamais afficher de stale silently

Toute nouvelle session de Claude Code lira ces memories et aura le contexte.

## Quand tout est fini

Quand M5 est livré et testé manuel par toi :
1. Squash + merge `feat/widget-pivot` → `master`
2. Tag de release (ex. `v0.2.0-widget`)
3. Build NSIS + portable : `npm run dist`
4. Test installeur sur ta machine
5. Déposer la release ou utiliser le portable directement
