const providers = require('./providers');
const secrets = require('./secrets');
const notifier = require('./notifier');

/**
 * Periodic poll: walk every enabled provider, fetch usage, store snapshots,
 * evaluate alerts, broadcast a "usage:updated" event to the renderer.
 */
class Scheduler {
  constructor({ db, mainWindow }) {
    this.db = db;
    this.mainWindow = mainWindow;
    this.timer = null;
    this.running = false;
    this.lastRunAt = null;
    this.lastNotes = {};
  }

  setMainWindow(win) {
    this.mainWindow = win;
  }

  start(intervalMs) {
    this.stop();
    // Run once shortly after start, then on the configured cadence.
    setTimeout(() => this.runNow(), 5000);
    this.timer = setInterval(() => this.runNow(), intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runNow() {
    if (this.running) return { skipped: true };
    this.running = true;
    const notes = {};
    try {
      const configs = this.db.getProviderConfigs();
      for (const cfg of configs) {
        if (!cfg.enabled) continue;
        const mod = providers.get(cfg.provider);
        if (!mod) continue;
        const apiKey = cfg.encrypted_key ? secrets.decrypt(cfg.encrypted_key) : null;
        try {
          const { rows, note } = await mod.fetchUsage({
            apiKey,
            baseUrl: cfg.base_url,
            days: 30,
          });
          if (rows && rows.length) this.db.insertSnapshots(rows);
          if (note) notes[cfg.provider] = note;
        } catch (e) {
          notes[cfg.provider] = `Erreur: ${e.message}`;
        }
      }

      // Alerts
      const totals = Object.fromEntries(
        this.db.getMonthToDateTotals().map((r) => [r.provider, r]),
      );
      const quotas = Object.fromEntries(this.db.getQuotas().map((r) => [r.provider, r]));
      notifier.evaluateAlerts({
        alerts: this.db.getAlerts(),
        totalsByProvider: totals,
        quotasByProvider: quotas,
        db: this.db,
      });

      this.lastRunAt = new Date().toISOString();
      this.lastNotes = notes;
      this.broadcast();
      return { ok: true, notes };
    } finally {
      this.running = false;
    }
  }

  broadcast() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('usage:updated', {
        lastRunAt: this.lastRunAt,
        notes: this.lastNotes,
      });
    }
  }
}

module.exports = Scheduler;
