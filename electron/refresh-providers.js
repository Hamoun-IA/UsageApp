'use strict';

/**
 * Helper that runs `adapter.refresh()`, persists the snapshot, and triggers
 * alert evaluation. Returns `{ snap, newAlerts }`. Both insertSnapshot and
 * evaluateAlerts errors are swallowed (logged) so a transient DB hiccup does
 * not break the IPC contract or stall the poller.
 *
 * @param {{
 *   database: import('better-sqlite3').Database,
 *   db: { insertSnapshot, getPref, setPref },
 *   alerts: { evaluateAlerts },
 *   getAdapter: (id: string) => { refresh: () => Promise<any> },
 *   providerId: string,
 * }} args
 * @returns {Promise<{ snap: object, newAlerts: object[] }>}
 */
async function refreshAndPersist({ database, db, alerts, getAdapter, providerId }) {
  const adapter = getAdapter(providerId);
  const snap = await adapter.refresh();

  let persisted = false;
  try {
    db.insertSnapshot(database, snap);
    persisted = true;
  } catch (e) {
    console.error('insertSnapshot failed:', e);
  }

  let newAlerts = [];
  if (persisted) {
    try {
      newAlerts = alerts.evaluateAlerts(database, db, snap) || [];
    } catch (e) {
      console.error('evaluateAlerts failed:', e);
      newAlerts = [];
    }
  }

  return { snap, newAlerts };
}

/**
 * Walk every registered adapter, refreshing each in parallel via
 * Promise.allSettled. Each fulfilled snapshot is persisted and evaluated.
 * Aggregates all newAlerts across providers.
 *
 * @param {{
 *   database: import('better-sqlite3').Database,
 *   db: { insertSnapshot, getPref, setPref },
 *   alerts: { evaluateAlerts },
 *   listAdapters: () => Array<{ id: string, refresh: () => Promise<any> }>,
 * }} args
 * @returns {Promise<{ snaps: object[], newAlerts: object[] }>}
 */
async function refreshAllAndPersist({ database, db, alerts, listAdapters }) {
  const adapters = listAdapters();
  const settled = await Promise.allSettled(adapters.map(a => a.refresh()));

  const snaps = [];
  const newAlerts = [];

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status !== 'fulfilled') {
      console.error(`refresh failed for ${adapters[i].id}:`, r.reason);
      continue;
    }
    const snap = r.value;
    if (!snap) continue;
    snaps.push(snap);

    try {
      db.insertSnapshot(database, snap);
    } catch (e) {
      console.error('insertSnapshot failed:', e);
      continue;
    }

    try {
      const triggered = alerts.evaluateAlerts(database, db, snap) || [];
      for (const a of triggered) newAlerts.push(a);
    } catch (e) {
      console.error('evaluateAlerts failed:', e);
    }
  }

  return { snaps, newAlerts };
}

module.exports = { refreshAndPersist, refreshAllAndPersist };
