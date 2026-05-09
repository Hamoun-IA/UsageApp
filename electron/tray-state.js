'use strict';

let _electron;
try { _electron = require('electron'); } catch { _electron = null; }

const ALERT_WINDOW_MS = 6 * 3_600_000;

const deps = {
  nativeImage: _electron ? _electron.nativeImage : null,
};

function _resolveNativeImage() {
  return deps.nativeImage || (_electron && _electron.nativeImage) || null;
}

/**
 * Choose the appropriate tray icon (normal vs critical) based on whether
 * any entry in `app_prefs.alertLog` falls within the last 6 hours, and
 * apply it via `tray.setImage`.
 *
 * @param {{
 *   tray: { setImage: (img: any) => void },
 *   database: import('better-sqlite3').Database,
 *   db: { getPref: (database, key, fallback) => any },
 *   paths: { normal: string, critical: string },
 *   now?: number,
 * }} args
 */
function updateTrayIcon({ tray, database, db, paths, now }) {
  const t = typeof now === 'number' ? now : Date.now();
  const alertLog = db.getPref(database, 'alertLog', []) || [];

  const isCritical = alertLog.some(
    (entry) =>
      entry &&
      typeof entry.at === 'number' &&
      Number.isFinite(entry.at) &&
      t - entry.at < ALERT_WINDOW_MS,
  );

  const target = isCritical ? paths.critical : paths.normal;
  const ni = _resolveNativeImage();
  if (!ni) {
    console.warn('tray-state: nativeImage not available — skipping setImage');
    return;
  }
  try {
    const img = ni.createFromPath(target);
    tray.setImage(img);
  } catch (e) {
    console.warn(`tray.setImage(${target}) failed:`, e);
  }
}

module.exports = { updateTrayIcon, deps };
