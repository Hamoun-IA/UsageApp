import { describe, it, expect } from 'vitest';
import * as registry from '../../electron/providers/index.js';
import { isValidSnapshot } from '../../electron/providers/types.js';

describe('Provider stubs', () => {
  it('all 4 adapters return valid snapshots from refresh()', async () => {
    const adapters = registry.listAdapters();
    expect(adapters).toHaveLength(4);
    const ids = new Set(adapters.map(a => a.id));
    expect(ids).toEqual(new Set(['claude', 'codex', 'ollama', 'zai']));

    for (const a of adapters) {
      const snap = await a.refresh();
      expect(isValidSnapshot(snap)).toBe(true);
      expect(snap.provider).toBe(a.id);
      expect(snap.error).not.toBeUndefined();
    }
  });

  it('unimplemented stubs return NOT_CONFIGURED', async () => {
    for (const id of ['codex', 'ollama', 'zai']) {
      const adapter = registry.getAdapter(id);
      const snap = await adapter.refresh();
      expect(snap.error?.code).toBe('NOT_CONFIGURED');
    }
  });

  it('codex stub flags approximated=true', async () => {
    const codex = registry.getAdapter('codex');
    const snap = await codex.refresh();
    expect(snap.approximated).toBe(true);
  });

  it('non-codex stubs flag approximated=false', async () => {
    for (const id of ['claude', 'ollama', 'zai']) {
      const adapter = registry.getAdapter(id);
      const snap = await adapter.refresh();
      expect(snap.approximated).toBe(false);
    }
  });

  it('getAdapter throws on unknown provider', () => {
    expect(() => registry.getAdapter('unknown')).toThrow(/Unknown provider/);
  });
});
