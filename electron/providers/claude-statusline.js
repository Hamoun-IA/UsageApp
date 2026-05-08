const fs = require('fs');
const path = require('path');
const os = require('os');

function defaultClaudeSettingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function defaultUsageFilePath() {
  return path.join(os.homedir(), '.claude', 'ai-usage-monitor', 'usage-latest.json');
}

function readClaudeSettings(settingsPath = defaultClaudeSettingsPath()) {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    return {};
  }
}

function buildStatusLineCommand(usagePath) {
  const escapedPath = usagePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `node -e "let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{require('fs').writeFileSync(\\"${escapedPath}\\",d)})"`;
}

function patchClaudeSettings(settingsPath = defaultClaudeSettingsPath(), usagePath = defaultUsageFilePath()) {
  const settings = readClaudeSettings(settingsPath);

  fs.mkdirSync(path.dirname(usagePath), { recursive: true });

  const command = buildStatusLineCommand(usagePath);

  if (settings.statusLine && settings.statusLine.type === 'command' && settings.statusLine.command === command) {
    return;
  }

  settings.statusLine = { type: 'command', command };

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function unpatchClaudeSettings(settingsPath = defaultClaudeSettingsPath()) {
  const settings = readClaudeSettings(settingsPath);
  const cmd = settings.statusLine && settings.statusLine.command;
  if (cmd && cmd.includes('ai-usage-monitor')) {
    delete settings.statusLine;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }
}

module.exports = {
  readClaudeSettings,
  patchClaudeSettings,
  unpatchClaudeSettings,
  defaultClaudeSettingsPath,
  defaultUsageFilePath,
};
