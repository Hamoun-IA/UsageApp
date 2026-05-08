# Milestone 4 — Detail window (Dashboard, History, Alerts, Settings)

**Goal:** flesh out the detail window opened from the widget's `⤢` and `⚙` buttons. Sidebar + 4 pages, all driven by data already produced by the M3.6 providers.

**Branch:** `feat/m4-detail-window` (parent = `master` at `976e718`).
**Tag at completion:** `m4-detail-window`.
**Test target:** ≥ 90 Vitest tests passing (74 inherited + ≥ 16 new).

## Already in place (no rebuild needed)

- 4 working providers (`zai`, `ollama`, `claude`, `codex`) returning valid Snapshots through `window.api.providers.refreshAll()`.
- `electron/db.js` has `init()`, `insertSnapshot(db, snap)`, `recentSnapshots(db, provider, sinceMs)`, `getProviderSettings`, `upsertProviderSettings`, `getPref`, `setPref`. Schema v2 (table `usage_snapshots`).
- `electron/main.js` already creates `mainWindow` (1200×800) loading `http://localhost:5173` (dev) or `dist/index.html` (prod), and hides it on close (`mainWindow.on('close', ...)`).
- `src/detail/App.jsx` is a placeholder (`<p>Sera implémenté en M4.</p>`).
- Vite multi-page already wires `index.html` → `src/detail/main.jsx` and `widget.html` → `src/widget/main.jsx`.
- Deps already installed: `recharts@^2.13.0`, `lucide-react@^0.453.0`, `tailwindcss@^3.4.14` (we'll keep using inline styles to match the widget's pattern, but tailwind is available if a page benefits).

## Scope decisions

- **Sparklines:** SVG pur (pas recharts) sur le Dashboard — bornes 24h, ~30 lignes par composant.
- **Recharts:** réservé à la page History (graphes 30j interactifs).
- **Routing:** maison via `useState`. Pas de react-router pour 4 pages.
- **Sidebar icons:** `lucide-react` (déjà installé). Use `LayoutDashboard`, `LineChart`, `Bell`, `Settings` icons.
- **Persistence:** alert thresholds + retention via `app_prefs` table (`getPref/setPref`). No new schema.

## Architecture map

```
electron/
  ipc.js                       # NEW handlers: db:recentSnapshots, db:getPref, db:setPref,
                               # app:openDetail, app:openSettings, app:setAutostart,
                               # app:getAutostart. Existing providers:* handlers persist
                               # snapshots via db.insertSnapshot after each refresh.
  main.js                      # Wire main-window IPC for show/hide, global shortcut
                               # registration (Ctrl+Shift+Alt+U), tray double-click.
  preload.js                   # Expose window.api.db.* and window.api.app.*

src/detail/
  App.jsx                      # Sidebar + active-page switcher. Uses useState for routing.
  main.jsx                     # Entry (existing — unchanged).
  components/
    Sparkline.jsx              # Pure SVG sparkline. Props: { points: number[], color, height }.
    ProviderCard.jsx           # 2x2 grid card used by Dashboard.
    Sidebar.jsx                # Vertical nav with lucide icons.
  pages/
    Dashboard.jsx              # 4 ProviderCards + auto-refresh.
    History.jsx                # Recharts AreaChart with provider selector + 30d range.
    Alerts.jsx                 # Threshold inputs + alert log (recent threshold breaches).
    Settings.jsx               # Connect/disconnect 4 providers + autostart + retention slider.
```

## Tasks

### Task 4.0 — DB plumbing: persist snapshots + expose recentSnapshots

**Why first:** without this, sparklines have no data.

**Files:**
- Modify `electron/ipc.js` — after each `a.refresh()` in `providers:refresh` and `providers:refreshAll`, call `db.insertSnapshot(deps.db, snap)`. Add new handlers `db:recentSnapshots(provider, sinceMs)`, `db:getPref(key)`, `db:setPref(key, value)`.
- Modify `electron/preload.js` — expose `window.api.db.recentSnapshots`, `window.api.db.getPref`, `window.api.db.setPref`.
- Add `tests/ipc-snapshots.test.js` — verify that calling `providers:refresh` inserts a row into `usage_snapshots`.

**Steps:**
1. Read current `electron/ipc.js`. Note: `registerIpcHandlers({ db })` already receives `db`.
2. Inside the handlers, persist:
   ```js
   ipcMain.handle('providers:refresh', async (_e, providerId) => {
     const a = getAdapter(providerId);
     const snap = await a.refresh();
     try { db.insertSnapshot(deps.db, snap); } catch (e) { console.error('insertSnapshot failed:', e); }
     return snap;
   });
   ```
   Same in `providers:refreshAll` — wrap each result with insertSnapshot in a `Promise.all` map.
3. New handlers:
   ```js
   ipcMain.handle('db:recentSnapshots', (_e, provider, sinceMs) => db.recentSnapshots(deps.db, provider, sinceMs));
   ipcMain.handle('db:getPref',         (_e, key) => db.getPref(deps.db, key));
   ipcMain.handle('db:setPref',         (_e, key, value) => db.setPref(deps.db, key, value));
   ```
4. Update `preload.js` — add `db: { recentSnapshots, getPref, setPref }` block alongside the existing `providers` and `widget` blocks.
5. Test: setup an in-memory db (the existing `db.init()` accepts a path; use `:memory:` for tests). Call refresh handler with a stub provider that returns a known snapshot. Query `usage_snapshots` and assert one row.
6. Commit: `feat(ipc): persist snapshots after refresh + expose db helpers`

### Task 4.1 — Detail layout: sidebar + maison router

**Files:**
- Rewrite `src/detail/App.jsx`
- Create `src/detail/components/Sidebar.jsx`
- Create stubs for the 4 pages: `src/detail/pages/{Dashboard,History,Alerts,Settings}.jsx`

**Steps:**
1. `App.jsx`:
   ```jsx
   const [activePage, setActivePage] = useState('dashboard');
   // Sidebar items: dashboard, history, alerts, settings.
   // Render <Sidebar active={activePage} onChange={setActivePage} /> + active page component.
   ```
   Read `?openTo=settings` from URL (so the widget's ⚙ button can deep-link to Settings on open).
2. `Sidebar.jsx`: vertical nav 200px wide. Each item: lucide icon + label. Active = brighter background.
3. Each stub page = 1-line placeholder for now (`<div>Page coming up</div>`). They get filled in later tasks.
4. Inline styles matching the widget palette (`#0e1217`, `#1f2937`, `#9ca3af`, `#e5e7eb`).
5. Commit: `feat(detail): sidebar layout + 4-page router`

### Task 4.2 — Sparkline SVG pure component

**Files:**
- Create `src/detail/components/Sparkline.jsx`
- Create `tests/detail/sparkline.test.jsx`

**Component:**
```jsx
export default function Sparkline({ points, color = '#06b6d4', width = 220, height = 36 }) {
  if (!points || points.length < 2) return <svg width={width} height={height} />;
  const max = Math.max(...points, 1);
  const min = 0;
  const span = Math.max(max - min, 1);
  const stepX = width / (points.length - 1);
  const path = points.map((y, i) => {
    const px = i * stepX;
    const py = height - ((y - min) / span) * height;
    return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={path} stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  );
}
```

Tests verify: empty array = empty SVG, 2-point line draws an `<path>` with the right `d`, max y is preserved (no clipping above top).

Commit: `feat(detail): pure SVG sparkline component`

### Task 4.3 — Dashboard page (4 ProviderCards 2×2)

**Files:**
- Create `src/detail/components/ProviderCard.jsx`
- Rewrite `src/detail/pages/Dashboard.jsx`

**Behavior:**
- On mount: `window.api.providers.refreshAll()` → snaps state. Then `recentSnapshots(provider, 24*3600_000)` for each → series state.
- Re-fetch every 60 seconds (interval).
- Grid 2×2 (CSS grid, gap 12). Card shows: provider name + dot color + plan badge top-right + Session/Weekly bars (re-use existing `ProgressBar` from `src/widget/components/`) + sparkline (use sessionPct over time from snapshots).
- Empty state: "Pas encore de données — clique Connecter dans la barre latérale Settings."

Commit: `feat(detail): Dashboard page with 4 cards + 24h sparklines`

### Task 4.4 — Settings page

**Files:**
- Rewrite `src/detail/pages/Settings.jsx`

**Sections:**
1. **Connexions** — list 4 providers with status icon (connected/disconnected/error), Connect/Disconnect button. Use `window.api.providers.connect(id)` and `disconnect(id)` (already wired).
2. **Démarrage automatique** — toggle that calls `window.api.app.setAutostart(boolean)`. State persisted via `getPref('autostart')`. New IPC `app:setAutostart` calls `app.setLoginItemSettings({ openAtLogin: bool })`.
3. **Rétention DB** — slider 7 / 30 / 90 / 180 jours. Stored via `setPref('retentionDays', N)`. Background job (run on app boot in main.js, or on widget toggle) deletes snapshots older than that.
4. **Raccourci global** — read-only display of `Ctrl+Shift+Alt+U` for now. (Configurable in M5.)

New IPC handlers in `main.js`:
```js
ipcMain.handle('app:setAutostart', (_e, enabled) => {
  app.setLoginItemSettings({ openAtLogin: !!enabled, args: ['--minimized'] });
  db.setPref(...'autostart', !!enabled);
  return true;
});
ipcMain.handle('app:getAutostart', () => app.getLoginItemSettings().openAtLogin);
```

Add a `pruneOldSnapshots()` helper in `electron/db.js` that uses the `retentionDays` pref to DELETE FROM usage_snapshots WHERE fetchedAt < cutoff.

Commit: `feat(detail): Settings page (connections, autostart, retention)`

### Task 4.5 — History page (recharts 30d)

**Files:**
- Rewrite `src/detail/pages/History.jsx`

**Behavior:**
- Provider selector (4 buttons + 'All').
- Window selector ('Session 5h' / 'Weekly').
- Fetch `recentSnapshots(provider, 30*24*3600_000)` then map to `{ time: snap.fetchedAt, value: snap.sessionPct or weeklyPct }`.
- recharts `<AreaChart>` with `<XAxis dataKey="time" tickFormatter={t => formatDate(t)}>`, `<YAxis domain={[0, 100]}>`, `<Tooltip>`, `<Area dataKey="value" stroke={PROVIDER_COLORS[selectedProvider]} fill={...with opacity}>`.
- Empty state for providers with no history: "Pas de données pour les 30 derniers jours."

Commit: `feat(detail): History page with recharts 30d series`

### Task 4.6 — Alerts page

**Files:**
- Rewrite `src/detail/pages/Alerts.jsx`
- Add `electron/alerts.js` (small module evaluating thresholds against latest snapshots)

**Behavior:**
- For each provider, three threshold inputs:
  - Session ≥ X% triggers alert (default 90)
  - Weekly ≥ Y% triggers alert (default 95)
  - Persistent error ≥ Z hours triggers alert (default 2)
- Persisted via `setPref('alertThresholds', { claude: {...}, codex: {...}, ... })`.
- Below: list of recent alerts (last 7 days). Stored as `setPref('alertLog', [{provider, type, threshold, value, at}, ...])`. Cap at 50 entries (drop oldest).
- The actual alert evaluation runs in `electron/alerts.js` after each refresh — checks current snapshot vs thresholds, appends to alertLog if breached and not already alerted in last 6h (cooldown).

Wire in `ipc.js`: after `db.insertSnapshot`, call `evaluateAlerts(deps.db, snap)` which appends to alertLog if needed.

Commit: `feat(detail): Alerts page (thresholds + recent alerts log)`

### Task 4.7 — Wiring: open detail window from widget + tray + global shortcut

**Files:**
- Modify `electron/main.js`
- Modify `electron/preload.js` (widget side)
- Modify `src/widget/Widget.jsx`

**Steps:**
1. Add `app:openDetail` IPC that calls `mainWindow.show()` + `focus()`. Add `app:openSettings` that does same + appends `?openTo=settings` to the URL (or sends an IPC to the renderer that updates state).
2. Widget side: wire `⤢` button to `window.api.app.openDetail()` and `⚙` to `window.api.app.openSettings()`. Currently they're decorative spans — replace with buttons.
3. Tray double-click: in `createTray()`, register `tray.on('double-click', () => mainWindow.show())`.
4. Global shortcut: in `app.whenReady().then(...)`, register `globalShortcut.register('CommandOrControl+Shift+Alt+U', () => { if (mainWindow.isVisible()) mainWindow.hide(); else mainWindow.show(); })`. Unregister on `before-quit`.

Commit: `feat(detail): wire ⤢/⚙/double-click/Ctrl+Shift+Alt+U → main window`

### Task 4.8 — Quit logic

**Files:**
- Modify `electron/main.js`

**Behavior:**
- mainWindow `close` event already calls `e.preventDefault() + hide()` if `!app.isQuiting`. Verify this still holds.
- Tray menu has `Quit` that sets `app.isQuiting = true; app.quit()`. Verify.
- `window-all-closed` should NOT quit (we keep running in tray). Currently it quits on non-darwin only if `app.isQuiting`. Verify.
- Add: an explicit confirmation if the user picks Quit and there are unsynced operations? Skip — overkill for personal app.

Commit: `chore(quit): verify hide-to-tray + tray Quit menu wiring`

### Task 4.9 — Verify checkpoint + tag

- Tests: ≥ 90 passing.
- Manual: open widget → click ⤢ → main window opens → navigate sidebar through 4 pages → close window → window hides not quits → tray double-click reopens → Ctrl+Shift+Alt+U toggles → Quit menu actually exits.
- Tag: `git tag m4-detail-window`.
- Merge `feat/m4-detail-window` → `master` via `--no-ff` (matches M3.6 strategy).

## Pitfalls

- `recentSnapshots` requires `usage_snapshots` to be populated. If the user has never refreshed, sparklines/History show empty. **Don't** synthesize fake data; show an honest empty state with a CTA to Settings.
- `app.setLoginItemSettings({ openAtLogin: true })` is Windows-specific behavior; macOS/Linux have different semantics. We're Windows-only per project scope, so OK.
- Global shortcut registration can fail if another app holds it. Catch and surface in Settings page (display "shortcut blocked by another app").
- Recharts is a heavy import (~80KB gz). Lazy-load via `React.lazy(() => import('recharts'))` if the bundle bloats. Defer that optimization unless Vite's bundle warning fires.
- `mainWindow.show()` on a hidden window may not focus on Windows. Combine with `mainWindow.focus()` explicitly.
- The widget's `⤢` and `⚙` are currently `<span>⚙ ⤢</span>` (decorative). Replace with `<button>` for accessibility and click handling.

## What's NOT in M4 (deferred to M5)

- Notifications (use `notifier.js` rewrite).
- Tray icon overlay red badge.
- Configurable global shortcut.
- Scheduler refactor (per-provider cadence, force-refresh on widget open).
- README full update + screenshots.
- DPAPI rotation, key-rolling, etc.

## How to execute

Use `superpowers:subagent-driven-development` — same pattern as M3. 9 tasks, dispatch implementer + spec reviewer + code quality reviewer per task. Tasks 4.1, 4.2, 4.3, 4.4, 4.5, 4.6 can all be done sequentially (they share state through DB + IPC, so don't parallelise without care). 4.7 and 4.8 are wiring tasks done last.
