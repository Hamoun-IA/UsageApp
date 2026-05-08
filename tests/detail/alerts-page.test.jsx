import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import Alerts from '../../src/detail/pages/Alerts.jsx';
import { DEFAULT_THRESHOLDS } from '../../src/shared/alert-defaults.js';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  delete window.api;
  cleanup();
});

function setupApi({ thresholds = null, log = [] } = {}) {
  window.api = {
    db: {
      getPref: vi.fn().mockImplementation((key, fallback) => {
        if (key === 'alertThresholds') return Promise.resolve(thresholds ?? fallback);
        if (key === 'alertLog') return Promise.resolve(log);
        return Promise.resolve(fallback ?? null);
      }),
      setPref: vi.fn().mockResolvedValue(undefined),
    },
  };
  return window.api;
}

// ---------------------------------------------------------------------------
// 1. Renders 4 provider rows with 3 inputs each (12 inputs total)
// ---------------------------------------------------------------------------

describe('Alerts page — structure', () => {
  it('renders 12 number inputs (4 providers × 3 thresholds)', async () => {
    setupApi();
    render(<Alerts />);
    await waitFor(() => {
      const inputs = screen.getAllByRole('spinbutton'); // type="number"
      expect(inputs).toHaveLength(12);
    });
  });

  it('renders all 4 provider labels', async () => {
    setupApi();
    render(<Alerts />);
    await waitFor(() => {
      expect(screen.getByText('Claude')).toBeTruthy();
      expect(screen.getByText('Codex')).toBeTruthy();
      expect(screen.getByText('Ollama')).toBeTruthy();
      expect(screen.getByText('Z.ai')).toBeTruthy();
    });
  });

  it('renders section headings', async () => {
    setupApi();
    render(<Alerts />);
    await waitFor(() => {
      expect(screen.getByText('Seuils')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Initial values match getPref('alertThresholds', defaults)
// ---------------------------------------------------------------------------

describe('Alerts page — initial values from getPref', () => {
  it('shows default threshold values when pref returns null', async () => {
    setupApi({ thresholds: null });
    render(<Alerts />);
    await waitFor(() => {
      const inputs = screen.getAllByRole('spinbutton');
      // Claude: session=90, weekly=95, errorHours=2
      expect(Number(inputs[0].value)).toBe(90);
      expect(Number(inputs[1].value)).toBe(95);
      expect(Number(inputs[2].value)).toBe(2);
    });
  });

  it('shows stored custom thresholds when pref has values', async () => {
    const custom = {
      claude: { session: 75, weekly: 85, errorHours: 4 },
      codex:  { session: 80, weekly: 90, errorHours: 3 },
      ollama: { session: 70, weekly: 80, errorHours: 1 },
      zai:    { session: 60, weekly: 70, errorHours: 5 },
    };
    setupApi({ thresholds: custom });
    render(<Alerts />);
    await waitFor(() => {
      const inputs = screen.getAllByRole('spinbutton');
      expect(Number(inputs[0].value)).toBe(75);
      expect(Number(inputs[1].value)).toBe(85);
      expect(Number(inputs[2].value)).toBe(4);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Changing a value triggers setPref on blur
// ---------------------------------------------------------------------------

describe('Alerts page — save on blur', () => {
  it('calls setPref("alertThresholds", merged) when input is blurred', async () => {
    const api = setupApi();
    render(<Alerts />);
    await waitFor(() => screen.getAllByRole('spinbutton'));

    const inputs = screen.getAllByRole('spinbutton');
    // Change claude's session threshold (first input)
    await act(async () => {
      fireEvent.change(inputs[0], { target: { value: '80' } });
      fireEvent.blur(inputs[0], { target: { value: '80' } });
    });

    await waitFor(() => {
      expect(api.db.setPref).toHaveBeenCalledWith(
        'alertThresholds',
        expect.objectContaining({
          claude: expect.objectContaining({ session: 80 }),
        }),
      );
    });
  });

  it('merges the changed field — other provider thresholds are preserved', async () => {
    const api = setupApi();
    render(<Alerts />);
    await waitFor(() => screen.getAllByRole('spinbutton'));

    const inputs = screen.getAllByRole('spinbutton');
    await act(async () => {
      fireEvent.change(inputs[0], { target: { value: '80' } });
      fireEvent.blur(inputs[0], { target: { value: '80' } });
    });

    await waitFor(() => {
      const call = api.db.setPref.mock.calls.find(c => c[0] === 'alertThresholds');
      expect(call).toBeTruthy();
      const saved = call[1];
      // Other providers unchanged
      expect(saved.codex).toEqual(DEFAULT_THRESHOLDS.codex);
      expect(saved.ollama).toEqual(DEFAULT_THRESHOLDS.ollama);
      expect(saved.zai).toEqual(DEFAULT_THRESHOLDS.zai);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Renders the alert log when present
// ---------------------------------------------------------------------------

describe('Alerts page — alert log', () => {
  it('renders alert log entries within last 7 days', async () => {
    const now = Date.now();
    const log = [
      { provider: 'claude', type: 'session', threshold: 90, value: 92, at: now - 3_600_000 },
      { provider: 'codex',  type: 'weekly',  threshold: 95, value: 97, at: now - 7_200_000 },
    ];
    setupApi({ log });
    render(<Alerts />);
    await waitFor(() => {
      // Alert type labels should be visible (from the log section)
      expect(screen.getByText('Session %')).toBeTruthy();
      expect(screen.getByText('Weekly %')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Empty state when no alerts
// ---------------------------------------------------------------------------

describe('Alerts page — empty state', () => {
  it('shows empty state text when alertLog is empty', async () => {
    setupApi({ log: [] });
    render(<Alerts />);
    await waitFor(() => {
      expect(screen.getByText('Aucune alerte récente.')).toBeTruthy();
    });
  });

  it('shows empty state when no window.api', () => {
    delete window.api;
    render(<Alerts />);
    expect(screen.getByText('Aucune alerte récente.')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 6. Filters to last 7 days only
// ---------------------------------------------------------------------------

describe('Alerts page — 7-day filter', () => {
  it('does not render alerts older than 7 days', async () => {
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 3_600_000;
    const log = [
      { provider: 'claude', type: 'session', threshold: 90, value: 92, at: now - 3_600_000 },         // recent — should show
      { provider: 'codex',  type: 'session', threshold: 90, value: 93, at: now - SEVEN_DAYS_MS - 1 }, // older than 7d — should NOT show
    ];
    setupApi({ log });
    render(<Alerts />);
    await waitFor(() => {
      // Claude row should be visible (recent)
      expect(screen.getAllByText('Claude').length).toBeGreaterThanOrEqual(1);
    });

    // Codex alert row — the old one should not appear. We check the "Session %"
    // type label is present exactly once (for claude's alert), not twice.
    const sessionLabels = screen.getAllByText('Session %');
    // Only one alert should be rendered (the recent claude one)
    expect(sessionLabels).toHaveLength(1);
  });

  it('shows empty state when all alerts are older than 7 days', async () => {
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 3_600_000;
    const log = [
      { provider: 'claude', type: 'session', threshold: 90, value: 92, at: now - SEVEN_DAYS_MS - 1 },
    ];
    setupApi({ log });
    render(<Alerts />);
    await waitFor(() => {
      expect(screen.getByText('Aucune alerte récente.')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Error banner
// ---------------------------------------------------------------------------

describe('Alerts page — error state', () => {
  it('shows error banner when getPref rejects', async () => {
    window.api = {
      db: {
        getPref: vi.fn().mockRejectedValue(new Error('db error')),
        setPref: vi.fn(),
      },
    };
    render(<Alerts />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText('Erreur de chargement — réessaie plus tard.')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 8. Rapid-blur race: two blurs before state settles both land in setPref
// ---------------------------------------------------------------------------

describe('Alerts page — rapid-blur race condition', () => {
  it('persists both values when two different inputs are blurred rapidly', async () => {
    const api = setupApi();
    render(<Alerts />);
    await waitFor(() => screen.getAllByRole('spinbutton'));

    const inputs = screen.getAllByRole('spinbutton');
    // Blur claude session (input 0) and codex session (input 3) rapidly without awaiting
    await act(async () => {
      fireEvent.change(inputs[0], { target: { value: '80' } });
      fireEvent.blur(inputs[0], { target: { value: '80' } });
      fireEvent.change(inputs[3], { target: { value: '70' } });
      fireEvent.blur(inputs[3], { target: { value: '70' } });
    });

    await waitFor(() => {
      expect(api.db.setPref).toHaveBeenCalled();
    });

    // The last setPref call must include both changed values
    const calls = api.db.setPref.mock.calls.filter((c) => c[0] === 'alertThresholds');
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const lastSaved = calls[calls.length - 1][1];
    expect(lastSaved.claude.session).toBe(80);
    expect(lastSaved.codex.session).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// 9. Malformed entry.at values are filtered out
// ---------------------------------------------------------------------------

describe('Alerts page — malformed entry.at guard', () => {
  it('excludes entries with at: undefined or at: NaN from the rendered log', async () => {
    const now = Date.now();
    const log = [
      { provider: 'claude', type: 'session', threshold: 90, value: 92, at: now - 3_600_000 }, // valid
      { provider: 'codex',  type: 'weekly',  threshold: 95, value: 97 },                       // at: undefined
      { provider: 'ollama', type: 'session', threshold: 90, value: 91, at: NaN },              // at: NaN
    ];
    setupApi({ log });
    render(<Alerts />);

    await waitFor(() => {
      // Only the valid claude entry should appear
      expect(screen.getByText('Claude')).toBeTruthy();
    });

    // Codex and Ollama log entries must NOT be rendered (they have malformed at)
    // The only 'Session %' label visible in the log section should be the claude one
    const sessionLabels = screen.getAllByText('Session %');
    expect(sessionLabels).toHaveLength(1);

    // Weekly % from codex malformed entry must not appear
    expect(screen.queryByText('Weekly %')).toBeNull();
  });
});
