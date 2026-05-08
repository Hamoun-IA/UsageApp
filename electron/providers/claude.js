const { EventEmitter } = require('events');
const fs = require('fs');
const {
  patchClaudeSettings,
  unpatchClaudeSettings,
  readClaudeSettings,
  defaultClaudeSettingsPath,
  defaultUsageFilePath,
} = require('./claude-statusline');

const id = 'claude';
const label = 'Claude';
const authMode = 'cli-file';
const STALE_MS = 30 * 60 * 1000;

const emitter = new EventEmitter();

const deps = {
  patchClaudeSettings,
  unpatchClaudeSettings,
  readClaudeSettings,
  settingsPath: defaultClaudeSettingsPath(),
  usageFilePath: defaultUsageFilePath(),
};

function isStatusLinePatched() {
  const settings = deps.readClaudeSettings(deps.settingsPath);
  const cmd = settings.statusLine && settings.statusLine.command;
  return typeof cmd === 'string' && cmd.includes('ai-usage-monitor');
}

async function connect() {
  deps.patchClaudeSettings();
}

async function disconnect() {
  deps.unpatchClaudeSettings();
}

function buildSnapshot(partial) {
  return {
    provider: id,
    fetchedAt: Date.now(),
    sessionPct: null,
    weeklyPct: null,
    sessionResetAt: null,
    weeklyResetAt: null,
    planLevel: null,
    approximated: false,
    raw: null,
    error: null,
    ...partial,
  };
}

function parseClaudeUsage(raw) {
  const fiveH = raw && raw.rate_limits && raw.rate_limits.five_hour;
  const sevenD = raw && raw.rate_limits && raw.rate_limits.seven_day;
  return {
    sessionPct: fiveH && typeof fiveH.used_percentage === 'number' ? fiveH.used_percentage : null,
    weeklyPct: sevenD && typeof sevenD.used_percentage === 'number' ? sevenD.used_percentage : null,
    sessionResetAt: fiveH && typeof fiveH.resets_at === 'number' ? fiveH.resets_at * 1000 : null,
    weeklyResetAt: sevenD && typeof sevenD.resets_at === 'number' ? sevenD.resets_at * 1000 : null,
    planLevel: raw && raw.rate_limits ? 'Subscriber' : null,
  };
}

async function refresh() {
  if (!isStatusLinePatched()) {
    return buildSnapshot({
      error: { code: 'NOT_CONFIGURED', message: 'Connect Claude first', retriable: false },
    });
  }

  let stat;
  try {
    stat = fs.statSync(deps.usageFilePath);
  } catch {
    return buildSnapshot({
      error: { code: 'CLI_INACTIVE', message: 'Lance `claude` au moins une fois après avoir connecté', retriable: true },
    });
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(deps.usageFilePath, 'utf-8'));
  } catch (e) {
    return buildSnapshot({
      error: { code: 'PARSE', message: `Failed to parse usage file: ${e.message}`, retriable: false },
    });
  }

  const parsed = parseClaudeUsage(raw);
  const ageMs = Date.now() - stat.mtimeMs;

  if (ageMs > STALE_MS) {
    return buildSnapshot({
      ...parsed,
      raw,
      error: {
        code: 'CLI_INACTIVE',
        message: `claude inactif depuis ${Math.round(ageMs / 60000)} min`,
        retriable: true,
      },
    });
  }

  return buildSnapshot({ ...parsed, raw });
}

let watcher = null;

function subscribe(cb) {
  if (!watcher) {
    const chokidar = require('chokidar');
    watcher = chokidar.watch(deps.usageFilePath, { ignoreInitial: true });
    watcher.on('change', async () => {
      const snap = await refresh();
      emitter.emit('snapshot', snap);
    });
  }
  emitter.on('snapshot', cb);
  return () => emitter.off('snapshot', cb);
}

module.exports = { id, label, authMode, connect, disconnect, refresh, subscribe, deps };
