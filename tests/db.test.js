import { describe, it, expect, vi } from 'vitest';
import { migrate } from '../electron/db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeDb(userVersion = 0) {
  return {
    pragma: vi.fn((q, opts) => {
      if (q === 'user_version' && opts?.simple) return userVersion;
      // Called as pragma('user_version = 2') — no-op, just record the call.
    }),
    exec: vi.fn(),
    prepare: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// migrate()
// ---------------------------------------------------------------------------

describe('migrate', () => {
  it('runs v2 migration when user_version is 0 (fresh DB)', () => {
    const fakeDb = makeFakeDb(0);
    migrate(fakeDb);

    expect(fakeDb.exec).toHaveBeenCalledOnce();

    const sql = fakeDb.exec.mock.calls[0][0];
    expect(sql).toContain('DROP TABLE IF EXISTS snapshots');
    expect(sql).toContain('DROP TABLE IF EXISTS provider_configs');
    expect(sql).toContain('DROP TABLE IF EXISTS quotas');
    expect(sql).toContain('CREATE TABLE usage_snapshots');
    expect(sql).toContain('CREATE TABLE provider_settings');
    expect(sql).toContain('CREATE TABLE app_prefs');
    expect(sql).toContain('CREATE INDEX idx_usage_snapshots_provider_fetched');

    // Must stamp the new version
    expect(fakeDb.pragma).toHaveBeenCalledWith('user_version = 2');
  });

  it('runs v2 migration when user_version is 1', () => {
    const fakeDb = makeFakeDb(1);
    migrate(fakeDb);

    expect(fakeDb.exec).toHaveBeenCalledOnce();
    const sql = fakeDb.exec.mock.calls[0][0];
    expect(sql).toContain('CREATE TABLE usage_snapshots');
    expect(fakeDb.pragma).toHaveBeenCalledWith('user_version = 2');
  });

  it('does NOT re-run migration when user_version is already 2', () => {
    const fakeDb = makeFakeDb(2);
    migrate(fakeDb);

    expect(fakeDb.exec).not.toHaveBeenCalled();
    // pragma('user_version = 2') should NOT be called when already at 2
    const setVersionCalls = fakeDb.pragma.mock.calls.filter(
      ([q]) => q === 'user_version = 2',
    );
    expect(setVersionCalls).toHaveLength(0);
  });

  it('does NOT re-run migration when user_version is higher than 2', () => {
    const fakeDb = makeFakeDb(99);
    migrate(fakeDb);

    expect(fakeDb.exec).not.toHaveBeenCalled();
  });

  it('usage_snapshots has the expected columns in CREATE statement', () => {
    const fakeDb = makeFakeDb(0);
    migrate(fakeDb);

    const sql = fakeDb.exec.mock.calls[0][0];
    // Required columns from the spec
    expect(sql).toContain('provider');
    expect(sql).toContain('fetched_at');
    expect(sql).toContain('session_pct');
    expect(sql).toContain('weekly_pct');
    expect(sql).toContain('session_reset_at');
    expect(sql).toContain('weekly_reset_at');
    expect(sql).toContain('plan_level');
    expect(sql).toContain('approximated');
    expect(sql).toContain('raw_json');
    expect(sql).toContain('error_json');
  });
});
