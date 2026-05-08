'use strict';

// Authoritative default thresholds — imported by electron/alerts.js (CJS require)
// and src/detail/pages/Alerts.jsx (Vite ESM import with CJS interop).
// Do NOT duplicate this object elsewhere.

const DEFAULT_THRESHOLDS = {
  claude: { session: 90, weekly: 95, errorHours: 2 },
  codex:  { session: 90, weekly: 95, errorHours: 2 },
  ollama: { session: 90, weekly: 95, errorHours: 2 },
  zai:    { session: 90, weekly: 95, errorHours: 2 },
};

module.exports = { DEFAULT_THRESHOLDS };
