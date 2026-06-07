const { BrowserWindow } = require('electron');
const { randomUUID } = require('crypto');

const CODEX_PARTITION = 'persist:codex-connect';
const PAGE_URL = 'https://chatgpt.com/';

// Hardcoded from a recent chatgpt.com deploy. Going stale on each frontend
// release is OK because the page-hosted fetch already mimics most of the
// browser fingerprint automatically; these are belt-and-suspenders.
const OAI_CLIENT_VERSION = 'prod-a9e268687461965b9507d0c5eeb8d58ad00b12dd';
const OAI_CLIENT_BUILD_NUMBER = '7215851';

/**
 * Why a BrowserWindow instead of net.fetch:
 *
 * /api/auth/session and /backend-api/wham/usage refuse main-process net.fetch
 * (returns {WARNING_BANNER} or token_invalidated) because Chromium can't
 * set sec-fetch-site: same-origin without a page origin. Even with cookies
 * + UA pinned, the request still looks "page-less" and OpenAI's anti-scraping
 * intercepts.
 *
 * Loading a hidden BrowserWindow on https://chatgpt.com/ gives us a real
 * same-origin page context. fetch() called from inside that page is
 * indistinguishable from what chatgpt.com's own frontend does: identical
 * sec-fetch-*, identical sec-ch-ua, identical JA3 TLS fingerprint, automatic
 * cookie attachment and rotation.
 */

let win = null;
let loadPromise = null;

function isWinAlive() {
  return win && !win.isDestroyed() && !win.webContents.isDestroyed();
}

function destroy() {
  loadPromise = null;
  if (isWinAlive()) {
    try { win.close(); } catch {}
  }
  win = null;
}

async function ensureWindow() {
  if (isWinAlive() && loadPromise) {
    await loadPromise;
    return win;
  }
  destroy();
  win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      partition: CODEX_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.on('closed', () => {
    win = null;
    loadPromise = null;
  });
  loadPromise = win.loadURL(PAGE_URL).catch((e) => {
    // Surface load failure on next ensureWindow call.
    loadPromise = null;
    throw e;
  });
  await loadPromise;
  return win;
}

/**
 * Run both /api/auth/session and /backend-api/wham/usage from inside the
 * hidden chatgpt.com page. The page's `fetch()` carries identical credentials
 * and fingerprint to what chatgpt.com's own JS sends.
 *
 * @returns {Promise<
 *   | { ok: true, usage: object }
 *   | { ok: false, phase: 'session'|'usage'|'exception', status?: number, noToken?: boolean, keys?: string, body?: string, message?: string }
 * >}
 */
async function fetchCodexUsage() {
  const w = await ensureWindow();
  const oaiSessionId = randomUUID();

  const script = `
    (async () => {
      try {
        const sR = await fetch('/api/auth/session', {
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
        });
        if (!sR.ok) {
          const t = await sR.text().catch(() => '');
          return { ok: false, phase: 'session', status: sR.status, body: t.slice(0, 200) };
        }
        const session = await sR.json().catch(() => null);
        if (!session || typeof session.accessToken !== 'string') {
          const keys = session && typeof session === 'object' ? Object.keys(session).join(',') : '<not-object>';
          const body = JSON.stringify(session || null).slice(0, 200);
          return { ok: false, phase: 'session', noToken: true, keys, body };
        }
        const uR = await fetch('/backend-api/wham/usage', {
          credentials: 'include',
          headers: {
            'Authorization': 'Bearer ' + session.accessToken,
            'Accept': 'application/json',
            'oai-language': 'en-US',
            'oai-client-version': ${JSON.stringify(OAI_CLIENT_VERSION)},
            'oai-client-build-number': ${JSON.stringify(OAI_CLIENT_BUILD_NUMBER)},
            'oai-session-id': ${JSON.stringify(oaiSessionId)},
            'x-openai-target-path': '/backend-api/wham/usage',
            'x-openai-target-route': '/backend-api/wham/usage',
          },
        });
        if (!uR.ok) {
          const t = await uR.text().catch(() => '');
          return { ok: false, phase: 'usage', status: uR.status, body: t.slice(0, 200) };
        }
        const usage = await uR.json();
        return { ok: true, usage };
      } catch (e) {
        return { ok: false, phase: 'exception', message: (e && e.message) ? e.message : String(e) };
      }
    })()
  `;

  return w.webContents.executeJavaScript(script, true);
}

module.exports = { fetchCodexUsage, destroy };
