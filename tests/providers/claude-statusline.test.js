import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';

let tempDir;
beforeEach(() => {
  tempDir = mkdtempSync(resolve(tmpdir(), 'claude-stl-'));
});
afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('claude-statusline', () => {
  it('reads existing settings.json or returns empty', async () => {
    const { readClaudeSettings } = await import('../../electron/providers/claude-statusline.js');
    expect(readClaudeSettings(resolve(tempDir, 'missing.json'))).toEqual({});
    writeFileSync(resolve(tempDir, 'settings.json'), JSON.stringify({ foo: 'bar' }));
    expect(readClaudeSettings(resolve(tempDir, 'settings.json'))).toEqual({ foo: 'bar' });
  });

  it('returns empty object when settings.json contains malformed JSON', async () => {
    const { readClaudeSettings } = await import('../../electron/providers/claude-statusline.js');
    const settingsPath = resolve(tempDir, 'settings.json');
    writeFileSync(settingsPath, '{ not valid json');
    expect(readClaudeSettings(settingsPath)).toEqual({});
  });

  it('patchSettings injects statusLine without losing other keys', async () => {
    const { patchClaudeSettings } = await import('../../electron/providers/claude-statusline.js');
    const settingsPath = resolve(tempDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({ unrelated: 42, enabledPlugins: { foo: true } }));
    const usagePath = resolve(tempDir, 'ai-usage-monitor', 'usage-latest.json');
    patchClaudeSettings(settingsPath, usagePath);
    const after = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(after.unrelated).toBe(42);
    expect(after.enabledPlugins).toEqual({ foo: true });
    expect(after.statusLine).toBeDefined();
    expect(after.statusLine.type).toBe('command');
    expect(after.statusLine.command).toContain('writeFileSync');
  });

  it('patchSettings creates the usage file directory if missing', async () => {
    const { patchClaudeSettings } = await import('../../electron/providers/claude-statusline.js');
    const settingsPath = resolve(tempDir, 'settings.json');
    const usagePath = resolve(tempDir, 'nested', 'dir', 'usage-latest.json');
    patchClaudeSettings(settingsPath, usagePath);
    expect(existsSync(resolve(tempDir, 'nested', 'dir'))).toBe(true);
  });

  it('patchSettings is idempotent (same content twice)', async () => {
    const { patchClaudeSettings } = await import('../../electron/providers/claude-statusline.js');
    const settingsPath = resolve(tempDir, 'settings.json');
    const usagePath = resolve(tempDir, 'usage-latest.json');
    patchClaudeSettings(settingsPath, usagePath);
    const first = readFileSync(settingsPath, 'utf-8');
    patchClaudeSettings(settingsPath, usagePath);
    const second = readFileSync(settingsPath, 'utf-8');
    expect(first).toBe(second);
  });

  it('unpatchClaudeSettings removes the statusLine if it points to our usage path', async () => {
    const { patchClaudeSettings, unpatchClaudeSettings } = await import('../../electron/providers/claude-statusline.js');
    const settingsPath = resolve(tempDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({ unrelated: 1 }));
    const usagePath = resolve(tempDir, 'ai-usage-monitor', 'usage-latest.json');
    patchClaudeSettings(settingsPath, usagePath);
    unpatchClaudeSettings(settingsPath);
    const after = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(after.statusLine).toBeUndefined();
    expect(after.unrelated).toBe(1);
  });

  it('unpatchClaudeSettings leaves a foreign statusLine alone', async () => {
    const { unpatchClaudeSettings } = await import('../../electron/providers/claude-statusline.js');
    const settingsPath = resolve(tempDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({
      statusLine: { type: 'command', command: 'echo "user custom statusline"' },
      unrelated: 2,
    }));
    unpatchClaudeSettings(settingsPath);
    const after = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(after.statusLine).toEqual({ type: 'command', command: 'echo "user custom statusline"' });
    expect(after.unrelated).toBe(2);
  });
});
