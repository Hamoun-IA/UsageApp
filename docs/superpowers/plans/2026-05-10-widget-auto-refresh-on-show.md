# Widget Auto-Refresh On Show — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the widget transitions hidden→visible (via global shortcut, tray click, or context menu), auto-refresh provider data, with a 10s throttle to prevent spam.

**Architecture:** Unidirectional IPC main→renderer. `toggleWidget` in `electron/widget-window.js` sends `widget:onShow` after `show()`. Preload exposes `window.api.widget.onShow(cb)` (mirror of the existing `app.onNavigateTo`). `Widget.jsx` subscribes via `useEffect`, with throttle stored in a `useRef` updated at refresh-start.

**Tech Stack:** Electron 33, React 18, Vitest 4, happy-dom, @testing-library/react.

**Spec:** [docs/superpowers/specs/2026-05-10-widget-auto-refresh-on-show-design.md](../specs/2026-05-10-widget-auto-refresh-on-show-design.md)

---

## File Structure

- **Modify** `src/widget/Widget.jsx` — add `lastFetchRef` updated at refresh-start; add `useEffect` that subscribes to `window.api.widget.onShow` and calls `refresh()` if throttle has elapsed.
- **Modify** `electron/preload.js` — expose `widget.onShow(cb)` returning unsubscribe.
- **Modify** `electron/widget-window.js` — in `toggleWidget`, after `w.show()` / `w.focus()`, call `w.webContents.send('widget:onShow')`.
- **Create** `tests/widget-auto-refresh.test.jsx` — Vitest renderer tests covering the three scenarios (throttle skip, throttle elapsed, unsubscribe on unmount).

---

## Task 1: Renderer test — failing tests for auto-refresh behavior

**Files:**
- Create: `tests/widget-auto-refresh.test.jsx`

- [ ] **Step 1: Write the failing test file**

Create `tests/widget-auto-refresh.test.jsx` with this content:

```jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import Widget from '../src/widget/Widget.jsx';

let onShowCallback = null;
let onShowUnsubscribe = null;

beforeEach(() => {
  onShowCallback = null;
  onShowUnsubscribe = vi.fn();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.api = {
    providers: {
      refreshAll: vi.fn().mockResolvedValue([]),
      connect: vi.fn().mockResolvedValue({}),
    },
    widget: {
      setHeight: vi.fn(),
      onShow: vi.fn((cb) => {
        onShowCallback = cb;
        return onShowUnsubscribe;
      }),
    },
    app: {
      openDetail: vi.fn().mockResolvedValue(true),
      openSettings: vi.fn().mockResolvedValue(true),
    },
    db: {
      recentSnapshots: vi.fn().mockResolvedValue([]),
      getPref: vi.fn().mockResolvedValue(null),
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
  delete window.api;
  cleanup();
});

describe('Widget auto-refresh on show', () => {
  it('subscribes to widget.onShow on mount', () => {
    render(<Widget />);
    expect(window.api.widget.onShow).toHaveBeenCalledTimes(1);
    expect(typeof onShowCallback).toBe('function');
  });

  it('unsubscribes from widget.onShow on unmount', () => {
    const { unmount } = render(<Widget />);
    unmount();
    expect(onShowUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('skips refresh when onShow fires within 10s of last refresh', async () => {
    render(<Widget />);
    await waitFor(() => expect(window.api.providers.refreshAll).toHaveBeenCalledTimes(1));

    await act(async () => { vi.advanceTimersByTime(5_000); });
    await act(async () => { onShowCallback(); });

    expect(window.api.providers.refreshAll).toHaveBeenCalledTimes(1);
  });

  it('triggers refresh when onShow fires more than 10s after last refresh', async () => {
    render(<Widget />);
    await waitFor(() => expect(window.api.providers.refreshAll).toHaveBeenCalledTimes(1));

    await act(async () => { vi.advanceTimersByTime(11_000); });
    await act(async () => { onShowCallback(); });

    await waitFor(() => expect(window.api.providers.refreshAll).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/widget-auto-refresh.test.jsx`

Expected: tests fail because `window.api.widget.onShow` is never called by the current Widget (the `subscribes` test fails first; subsequent throttle tests fail because `onShowCallback` stays null).

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/widget-auto-refresh.test.jsx
git commit -m "test(widget): failing tests for auto-refresh on show + 10s throttle"
```

---

## Task 2: Implement auto-refresh in `Widget.jsx`

**Files:**
- Modify: `src/widget/Widget.jsx`

- [ ] **Step 1: Add `useRef` import and the throttle constant**

Edit `src/widget/Widget.jsx` line 1 — change:

```jsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
```

(Already imports `useRef`, no change needed if already present — verify and skip if so.)

Just below the imports, add the throttle constant:

```jsx
const REFRESH_THROTTLE_MS = 10_000;
```

- [ ] **Step 2: Add `lastFetchRef` and update `refresh` to mark it at start**

In `Widget.jsx`, inside the `Widget` component (right after the existing `rootRef` declaration around line 11), add:

```jsx
const lastFetchRef = useRef(0);
```

Then modify the `refresh` callback (currently lines 22-31) to mark `lastFetchRef.current` at the START of the fetch:

```jsx
const refresh = useCallback(async () => {
  lastFetchRef.current = Date.now();
  setRefreshing(true);
  try {
    const result = await window.api.providers.refreshAll();
    setSnaps(result);
    setLastFetch(Date.now());
  } finally {
    setRefreshing(false);
  }
}, []);
```

- [ ] **Step 3: Add the `useEffect` that subscribes to `widget.onShow`**

Add a new `useEffect` immediately after the existing `useEffect(() => { refresh(); }, [refresh]);` (around line 42):

```jsx
useEffect(() => {
  if (!window.api?.widget?.onShow) return;
  return window.api.widget.onShow(() => {
    if (Date.now() - lastFetchRef.current < REFRESH_THROTTLE_MS) return;
    refresh();
  });
}, [refresh]);
```

- [ ] **Step 4: Run renderer tests to verify they pass**

Run: `npm test -- tests/widget-auto-refresh.test.jsx`

Expected: all 4 tests PASS.

- [ ] **Step 5: Run the full test suite to ensure no regression**

Run: `npm test`

Expected: all tests pass (including existing `tests/widget-buttons.test.jsx`).

If `widget-buttons.test.jsx` fails because its `window.api.widget` mock now lacks `onShow`, fix it by adding `onShow: vi.fn(() => () => {})` to that test's `window.api.widget` mock object.

- [ ] **Step 6: Commit**

```bash
git add src/widget/Widget.jsx tests/widget-buttons.test.jsx
git commit -m "feat(widget): auto-refresh on widget:onShow with 10s throttle"
```

---

## Task 3: Expose `widget.onShow` in preload

**Files:**
- Modify: `electron/preload.js`

- [ ] **Step 1: Add `onShow` to the `widget` namespace**

Edit `electron/preload.js` lines 16-18 — change:

```js
  widget: {
    setHeight:   (h) => ipcRenderer.send('widget:setHeight', h),
  },
```

To:

```js
  widget: {
    setHeight:   (h) => ipcRenderer.send('widget:setHeight', h),
    onShow:      (cb) => {
      const handler = () => cb();
      ipcRenderer.on('widget:onShow', handler);
      return () => ipcRenderer.removeListener('widget:onShow', handler);
    },
  },
```

(This mirrors the pattern already used by `app.onNavigateTo` lower in the same file.)

- [ ] **Step 2: Commit**

```bash
git add electron/preload.js
git commit -m "feat(preload): expose widget.onShow listener"
```

---

## Task 4: Send `widget:onShow` from `toggleWidget`

**Files:**
- Modify: `electron/widget-window.js`

- [ ] **Step 1: Send the IPC event after `w.show()`**

Edit `electron/widget-window.js` — modify the `toggleWidget` function (lines 51-61) to send the event after the window becomes visible:

```js
function toggleWidget(tray) {
  lastTray = tray;
  const w = createWidgetWindow();
  if (w.isVisible()) {
    w.hide();
  } else {
    positionNearTray(tray);
    w.show();
    w.focus();
    w.webContents.send('widget:onShow');
  }
}
```

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add electron/widget-window.js
git commit -m "feat(widget-window): emit widget:onShow on hidden→visible transition"
```

---

## Task 5: Manual end-to-end verification

**Files:** none — interactive verification only.

- [ ] **Step 1: Start the dev app**

Run: `npm run dev`

Wait for the Electron window to launch and the tray icon to appear in the bottom-right.

- [ ] **Step 2: First open via shortcut**

Press `Ctrl+Shift+Alt+U`.

Expected: widget appears. Header shows "Mis à jour il y a 0s" (or similar low value) within ~1-2s. Refresh button (↻) flickers disabled briefly during the fetch.

- [ ] **Step 3: Throttle skip — quick reopen**

Press Esc / click outside to close the widget. Within 5 seconds, press `Ctrl+Shift+Alt+U` again.

Expected: widget reappears instantly. **No** new fetch fires (the "Mis à jour il y a Xs" counter does not reset to 0; ↻ button does not flicker disabled).

- [ ] **Step 4: Throttle elapsed — slow reopen**

Close the widget. Wait at least 11 seconds. Reopen via `Ctrl+Shift+Alt+U`.

Expected: a fresh fetch fires (button flickers disabled, counter resets to 0s).

- [ ] **Step 5: Tray click also triggers refresh**

Wait at least 11 seconds since the last refresh. Click the tray icon (left-click).

Expected: widget appears AND a fresh fetch fires.

- [ ] **Step 6: Sanity — refresh button still works**

Open the widget. Click the ↻ button.

Expected: fetch fires (button briefly disabled, counter resets).

- [ ] **Step 7: Done — no commit**

If all six checks pass, the feature is verified. No code changes needed at this stage.

---

## Self-Review

**Spec coverage:**
- ✅ "Trigger on every hidden→visible transition (shortcut/tray/menu)" — Task 4 sends `widget:onShow` from the unified `toggleWidget` path.
- ✅ "Throttle 10s" — Task 2 step 3 with `REFRESH_THROTTLE_MS = 10_000` and `lastFetchRef` set at refresh start.
- ✅ "Reuse existing refresh state for visual feedback" — `refresh()` is called as-is; `setRefreshing` already in place.
- ✅ "Mirror `app.onNavigateTo` pattern in preload" — Task 3.
- ✅ "Edge case: first show / mount-refresh dedup" — `lastFetchRef` is set at refresh START (cleaner than the spec's "init at mount" alternative; both achieve the same outcome). If `onShow` arrives during mount-refresh, the ref is already updated and the throttle skips the duplicate.
- ✅ "Renderer unit test for throttle" — Task 1.

**Note on edge case implementation:** The spec mentions initializing `lastFetchRef` to `Date.now()` at mount as the deduplication mechanism. The plan uses an equivalent but cleaner approach: set `lastFetchRef.current = Date.now()` at the start of `refresh()` itself. This single-write-site eliminates the need for two separate initializers and handles the in-flight-during-onShow case identically.

**Placeholder scan:** Every step shows full code or full commands. No TBD/TODO. No "similar to" — code is repeated verbatim where needed.

**Type/identifier consistency:**
- `widget:onShow` — used identically in `widget-window.js` (send), `preload.js` (`ipcRenderer.on`), and conceptually in `Widget.jsx` (via `window.api.widget.onShow`).
- `lastFetchRef` — declared once, written in `refresh`, read in the new `useEffect`.
- `REFRESH_THROTTLE_MS` — declared once at module scope, used once in the throttle check.
