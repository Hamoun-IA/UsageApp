const { Notification } = require('electron');

function notify({ title, body, silent = false }) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent });
  n.show();
}

/**
 * Evaluate alert rules against the current MTD totals + quota config and
 * fire native notifications. Each alert has a cooldown of 6 hours by default
 * to avoid spamming the user.
 */
function evaluateAlerts({ alerts, totalsByProvider, quotasByProvider, db }) {
  const now = Date.now();
  const cooldownMs = 6 * 3600 * 1000;

  for (const a of alerts) {
    if (!a.enabled) continue;
    if (a.last_fired_at && now - new Date(a.last_fired_at).getTime() < cooldownMs) continue;

    const totals = totalsByProvider[a.provider] || {};
    const quota = quotasByProvider[a.provider] || {};

    let triggered = false;
    let message = null;

    if (a.kind === 'budget_pct' && quota.monthly_budget_usd) {
      const pct = (totals.cost_usd || 0) / quota.monthly_budget_usd;
      if (pct >= a.threshold / 100) {
        triggered = true;
        message = `${a.provider}: ${Math.round(pct * 100)}% du budget mensuel atteint ($${(totals.cost_usd || 0).toFixed(2)} / $${quota.monthly_budget_usd}).`;
      }
    } else if (a.kind === 'tokens_pct' && quota.monthly_token_limit) {
      const tokens = (totals.input_tokens || 0) + (totals.output_tokens || 0);
      const pct = tokens / quota.monthly_token_limit;
      if (pct >= a.threshold / 100) {
        triggered = true;
        message = `${a.provider}: ${Math.round(pct * 100)}% des tokens consommés (${tokens.toLocaleString()} / ${quota.monthly_token_limit.toLocaleString()}).`;
      }
    } else if (a.kind === 'absolute_cost') {
      if ((totals.cost_usd || 0) >= a.threshold) {
        triggered = true;
        message = `${a.provider}: coût mensuel ≥ $${a.threshold} (actuel: $${(totals.cost_usd || 0).toFixed(2)}).`;
      }
    }

    if (triggered) {
      notify({ title: 'AI Usage Monitor', body: message });
      db.setAlertFired(a.id);
    }
  }
}

module.exports = { notify, evaluateAlerts };
