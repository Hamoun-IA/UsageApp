'use strict';

/**
 * Background ticker. Wraps a setInterval that periodically invokes a
 * caller-provided `refresh()` async function and forwards its result to
 * `onResults`. Skip-if-running guard prevents two ticks from running
 * concurrently. Errors thrown by `refresh()` are logged and swallowed so
 * the loop keeps going.
 */
class Poller {
  /**
   * @param {{
   *   refresh: () => Promise<any>,
   *   onResults: (result: any) => void,
   * }} args
   */
  constructor({ refresh, onResults }) {
    this._refresh = refresh;
    this._onResults = onResults || (() => {});
    this._timer = null;
    this._intervalMs = null;
    this._running = false;
  }

  /**
   * Start (or restart) the interval with the given cadence in milliseconds.
   * The first tick fires at T+intervalMs (NOT immediately).
   */
  start(intervalMs) {
    this.stop();
    this._intervalMs = intervalMs;
    this._timer = setInterval(() => this._tick(), intervalMs);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * Reset the cadence. If the poller is currently stopped, this is a no-op
   * (only updates the stored value). If running, restart with the new cadence.
   */
  setInterval(intervalMs) {
    this._intervalMs = intervalMs;
    if (this._timer) this.start(intervalMs);
  }

  async _tick() {
    if (this._running) return;
    this._running = true;
    try {
      const result = await this._refresh();
      try {
        this._onResults(result);
      } catch (e) {
        console.error('Poller onResults failed:', e);
      }
    } catch (e) {
      console.error('Poller refresh failed:', e);
    } finally {
      this._running = false;
    }
  }
}

module.exports = { Poller };
