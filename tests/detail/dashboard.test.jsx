import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import Dashboard from '../../src/detail/pages/Dashboard.jsx';

const NOT_CONFIGURED_SNAP = (provider) => ({
  provider,
  fetchedAt: Date.now(),
  sessionPct: null,
  weeklyPct: null,
  sessionResetAt: null,
  weeklyResetAt: null,
  planLevel: null,
  approximated: false,
  raw: null,
  error: { code: 'NOT_CONFIGURED', message: 'not configured', retriable: false },
});

const HAPPY_SNAP = (provider, planLevel = 'Pro') => ({
  provider,
  fetchedAt: Date.now(),
  sessionPct: 42,
  weeklyPct: 65,
  sessionResetAt: Date.now() + 3 * 3600_000,
  weeklyResetAt: Date.now() + 48 * 3600_000,
  planLevel,
  approximated: false,
  raw: {},
  error: null,
});

const ALL_PROVIDERS = ['claude', 'codex', 'ollama', 'zai'];

afterEach(() => {
  delete window.api;
  cleanup();
});

describe('Dashboard', () => {
  describe('empty state', () => {
    beforeEach(() => {
      window.api = {
        providers: {
          refreshAll: vi.fn().mockResolvedValue(ALL_PROVIDERS.map(NOT_CONFIGURED_SNAP)),
        },
        db: { recentSnapshots: vi.fn().mockResolvedValue([]) },
      };
    });

    it('shows empty-state text when all providers are NOT_CONFIGURED and no series data', async () => {
      render(<Dashboard />);
      await waitFor(() => {
        expect(
          screen.getByText(
            'Pas encore de données — clique Connecter dans la barre latérale Settings.',
          ),
        ).toBeTruthy();
      });
    });

    it('shows empty-state when refreshAll returns empty array', async () => {
      window.api = {
        providers: { refreshAll: vi.fn().mockResolvedValue([]) },
        db: { recentSnapshots: vi.fn().mockResolvedValue([]) },
      };
      render(<Dashboard />);
      await waitFor(() => {
        expect(screen.getByText(/Pas encore de données/)).toBeTruthy();
      });
    });
  });

  describe('4 cards with happy data', () => {
    const rows = [
      { id: 1, provider: 'claude', fetched_at: Date.now() - 5000, session_pct: 30, weekly_pct: 50, session_reset_at: null, weekly_reset_at: null, plan_level: 'Pro', approximated: false, raw_json: null, error_json: null },
      { id: 2, provider: 'claude', fetched_at: Date.now() - 10000, session_pct: 20, weekly_pct: 40, session_reset_at: null, weekly_reset_at: null, plan_level: 'Pro', approximated: false, raw_json: null, error_json: null },
    ];

    beforeEach(() => {
      window.api = {
        providers: {
          refreshAll: vi.fn().mockResolvedValue(ALL_PROVIDERS.map(p => HAPPY_SNAP(p, 'Pro'))),
        },
        db: { recentSnapshots: vi.fn().mockResolvedValue(rows) },
      };
    });

    it('renders all 4 provider labels', async () => {
      render(<Dashboard />);
      await waitFor(() => {
        expect(screen.getByText('Claude')).toBeTruthy();
        expect(screen.getByText('Codex')).toBeTruthy();
        expect(screen.getByText('Ollama')).toBeTruthy();
        expect(screen.getByText('Z.ai')).toBeTruthy();
      });
    });

    it('renders plan level badges for each card', async () => {
      render(<Dashboard />);
      await waitFor(() => {
        const badges = screen.getAllByText('Pro');
        expect(badges.length).toBe(4);
      });
    });

    it('renders sparkline SVGs when series data is available', async () => {
      const { container } = render(<Dashboard />);
      await waitFor(() => {
        const svgs = container.querySelectorAll('svg');
        // At least one sparkline per provider that has 2+ points
        expect(svgs.length).toBeGreaterThan(0);
      });
    });
  });

  describe('auto-refresh interval', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      window.api = {
        providers: {
          refreshAll: vi.fn().mockResolvedValue(ALL_PROVIDERS.map(HAPPY_SNAP)),
        },
        db: { recentSnapshots: vi.fn().mockResolvedValue([]) },
      };
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls refreshAll once on mount and again after 60s', async () => {
      render(<Dashboard />);

      // Flush the initial async effect
      await act(async () => {
        await Promise.resolve();
      });

      expect(window.api.providers.refreshAll).toHaveBeenCalledTimes(1);

      // Advance 60 seconds
      await act(async () => {
        vi.advanceTimersByTime(60_000);
        await Promise.resolve();
      });

      expect(window.api.providers.refreshAll).toHaveBeenCalledTimes(2);
    });
  });

  describe('provider with error renders error UI', () => {
    beforeEach(() => {
      const snaps = [
        { ...HAPPY_SNAP('claude'), error: { code: 'AUTH_EXPIRED', message: 'token expired', retriable: true }, sessionPct: null, weeklyPct: null },
        HAPPY_SNAP('codex'),
        HAPPY_SNAP('ollama'),
        HAPPY_SNAP('zai'),
      ];
      window.api = {
        providers: { refreshAll: vi.fn().mockResolvedValue(snaps) },
        db: { recentSnapshots: vi.fn().mockResolvedValue([]) },
      };
    });

    it('shows error message for the errored provider', async () => {
      render(<Dashboard />);
      await waitFor(() => {
        expect(screen.getByText('token expired')).toBeTruthy();
      });
    });

    it('does not render percentage values for the errored card', async () => {
      render(<Dashboard />);
      await waitFor(() => {
        expect(screen.getByText('token expired')).toBeTruthy();
      });
      // 3 healthy providers × 1 "42%" for session = 3 (weeklyPct is 65%)
      const sessionPcts = screen.queryAllByText('42%');
      expect(sessionPcts.length).toBe(3);
      // 3 healthy providers × 1 "65%" for weekly = 3
      const weeklyPcts = screen.queryAllByText('65%');
      expect(weeklyPcts.length).toBe(3);
    });
  });

  describe('window.api not available', () => {
    it('renders without crashing when window.api is undefined', () => {
      // No window.api set
      expect(() => render(<Dashboard />)).not.toThrow();
    });
  });
});
