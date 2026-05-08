import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import History, { prepSingleSeries, prepAllSeries } from '../../src/detail/pages/History.jsx';

// ---------------------------------------------------------------------------
// Mock recharts — stub all used components with simple DOM wrappers so that
// the chart renders without layout measurements (getBoundingClientRect → 0/0)
// ---------------------------------------------------------------------------
vi.mock('recharts', () => {
  const React = require('react');

  const ResponsiveContainer = ({ children }) =>
    React.createElement('div', { 'data-testid': 'responsive-container' }, children);

  const AreaChart = ({ children, data }) =>
    React.createElement(
      'div',
      { 'data-testid': 'area-chart', 'data-point-count': data ? data.length : 0 },
      children,
    );

  const Area = ({ dataKey, stroke, fill, fillOpacity }) =>
    React.createElement('div', {
      'data-testid': 'area',
      'data-datakey': dataKey,
      'data-stroke': stroke,
      'data-fill': fill,
      'data-fill-opacity': fillOpacity,
    });

  const XAxis = () => null;
  const YAxis = () => null;
  const Tooltip = () => null;

  return { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = Date.now();

function makeRow(provider, offsetMs, sessionPct, weeklyPct) {
  return {
    id: Math.random(),
    provider,
    fetched_at: NOW - offsetMs,   // snake_case as returned by DB
    session_pct: sessionPct,
    weekly_pct: weeklyPct,
  };
}

// Two DESC rows for a single provider
const CLAUDE_ROWS = [
  makeRow('claude', 1000, 50, 60),   // most recent (fetched_at is higher)
  makeRow('claude', 5000, 40, 55),   // older
];

function setupApi({ rowsByProvider = {} } = {}) {
  window.api = {
    db: {
      recentSnapshots: vi.fn().mockImplementation((provider) =>
        Promise.resolve(rowsByProvider[provider] || [])
      ),
    },
  };
  return window.api;
}

afterEach(() => {
  delete window.api;
  cleanup();
});

// ---------------------------------------------------------------------------
// 1. Provider selector
// ---------------------------------------------------------------------------

describe('History — provider selector', () => {
  beforeEach(() => setupApi());

  it('renders 5 provider buttons: All + 4 providers', async () => {
    render(<History />);
    await waitFor(() => {
      expect(screen.getByText('All')).toBeTruthy();
      expect(screen.getByText('Claude')).toBeTruthy();
      expect(screen.getByText('Codex')).toBeTruthy();
      expect(screen.getByText('Ollama')).toBeTruthy();
      expect(screen.getByText('Z.ai')).toBeTruthy();
    });
  });

  it('"All" button has aria-pressed=true initially', async () => {
    render(<History />);
    await waitFor(() => {
      const btn = screen.getByText('All').closest('button');
      expect(btn.getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('clicking a provider button sets aria-pressed=true on that button', async () => {
    render(<History />);
    await waitFor(() => screen.getByText('Claude'));

    await act(async () => {
      fireEvent.click(screen.getByText('Claude'));
    });

    const claudeBtn = screen.getByText('Claude').closest('button');
    expect(claudeBtn.getAttribute('aria-pressed')).toBe('true');

    const allBtn = screen.getByText('All').closest('button');
    expect(allBtn.getAttribute('aria-pressed')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// 2. Window selector
// ---------------------------------------------------------------------------

describe('History — window selector', () => {
  beforeEach(() => setupApi());

  it('renders 2 window buttons: Session 5h and Weekly', async () => {
    render(<History />);
    await waitFor(() => {
      expect(screen.getByText('Session 5h')).toBeTruthy();
      expect(screen.getByText('Weekly')).toBeTruthy();
    });
  });

  it('"Session 5h" is active by default', async () => {
    render(<History />);
    await waitFor(() => {
      const btn = screen.getByText('Session 5h').closest('button');
      expect(btn.getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('clicking "Weekly" makes it active', async () => {
    render(<History />);
    await waitFor(() => screen.getByText('Weekly'));

    await act(async () => {
      fireEvent.click(screen.getByText('Weekly'));
    });

    const weeklyBtn = screen.getByText('Weekly').closest('button');
    expect(weeklyBtn.getAttribute('aria-pressed')).toBe('true');

    const sessionBtn = screen.getByText('Session 5h').closest('button');
    expect(sessionBtn.getAttribute('aria-pressed')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// 3. IPC call on provider change
// ---------------------------------------------------------------------------

describe('History — IPC on selector change', () => {
  it('calls recentSnapshots for all 4 providers on mount', async () => {
    const api = setupApi();
    render(<History />);
    await waitFor(() => {
      expect(api.db.recentSnapshots).toHaveBeenCalledTimes(4);
    });
  });

  it('re-fetches when provider selector changes', async () => {
    const api = setupApi();
    render(<History />);
    await waitFor(() => expect(api.db.recentSnapshots).toHaveBeenCalledTimes(4));

    await act(async () => {
      fireEvent.click(screen.getByText('Claude'));
    });

    await waitFor(() => expect(api.db.recentSnapshots).toHaveBeenCalledTimes(8));
  });
});

// ---------------------------------------------------------------------------
// 4. Empty state
// ---------------------------------------------------------------------------

describe('History — empty state', () => {
  it('shows empty-state text when no rows for any provider', async () => {
    setupApi();   // all providers return []
    render(<History />);
    await waitFor(() => {
      expect(screen.getByText('Pas de données pour les 30 derniers jours.')).toBeTruthy();
    });
  });

  it('does NOT show chart when data is empty', async () => {
    setupApi();
    render(<History />);
    await waitFor(() => {
      expect(screen.queryByTestId('area-chart')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Single-provider chart
// ---------------------------------------------------------------------------

describe('History — single-provider chart', () => {
  beforeEach(() => {
    setupApi({ rowsByProvider: { claude: CLAUDE_ROWS } });
  });

  it('renders AreaChart when Claude has data and is selected', async () => {
    render(<History />);
    // Switch to Claude
    await waitFor(() => screen.getByText('Claude'));
    await act(async () => { fireEvent.click(screen.getByText('Claude')); });

    await waitFor(() => {
      expect(screen.getByTestId('area-chart')).toBeTruthy();
    });
  });

  it('Area has dataKey="value" and correct stroke color for Claude', async () => {
    render(<History />);
    await waitFor(() => screen.getByText('Claude'));
    await act(async () => { fireEvent.click(screen.getByText('Claude')); });

    await waitFor(() => {
      const area = screen.getByTestId('area');
      expect(area.getAttribute('data-datakey')).toBe('value');
      expect(area.getAttribute('data-stroke')).toBe('#f59e0b');
    });
  });
});

// ---------------------------------------------------------------------------
// 6. 'All' chart — multiple series
// ---------------------------------------------------------------------------

describe('History — All chart', () => {
  beforeEach(() => {
    setupApi({
      rowsByProvider: {
        claude: CLAUDE_ROWS,
        codex:  [makeRow('codex', 2000, 20, 30)],
        ollama: [makeRow('ollama', 3000, 10, 15)],
        zai:    [makeRow('zai',   4000, 5,  8)],
      },
    });
  });

  it('renders 4 Area components when "All" is selected', async () => {
    render(<History />);
    await waitFor(() => {
      const areas = screen.getAllByTestId('area');
      expect(areas.length).toBe(4);
    });
  });

  it('each Area has the correct provider color', async () => {
    render(<History />);
    await waitFor(() => {
      const areas = screen.getAllByTestId('area');
      const strokes = areas.map(a => a.getAttribute('data-stroke'));
      expect(strokes).toContain('#f59e0b');  // claude
      expect(strokes).toContain('#10b981');  // codex
      expect(strokes).toContain('#a855f7');  // ollama
      expect(strokes).toContain('#06b6d4');  // zai
    });
  });

  it('each Area has the provider name as dataKey', async () => {
    render(<History />);
    await waitFor(() => {
      const areas = screen.getAllByTestId('area');
      const keys = areas.map(a => a.getAttribute('data-datakey'));
      expect(keys).toContain('claude');
      expect(keys).toContain('codex');
      expect(keys).toContain('ollama');
      expect(keys).toContain('zai');
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Window switch → re-fetches + uses weekly_pct
// ---------------------------------------------------------------------------

describe('History — window switch', () => {
  it('switches to weekly and re-fetches data', async () => {
    const api = setupApi({ rowsByProvider: { claude: CLAUDE_ROWS } });
    render(<History />);
    await waitFor(() => screen.getByText('Claude'));

    const callsBefore = api.db.recentSnapshots.mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByText('Weekly'));
    });

    await waitFor(() => {
      expect(api.db.recentSnapshots.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});

// ---------------------------------------------------------------------------
// 8. Data-prep helper — prepSingleSeries
// ---------------------------------------------------------------------------

describe('prepSingleSeries', () => {
  const rows = [
    { fetched_at: 3000, session_pct: 70, weekly_pct: 80 },
    { fetched_at: 2000, session_pct: 50, weekly_pct: 60 },
    { fetched_at: 1000, session_pct: 30, weekly_pct: 40 },
  ];

  it('returns chronological order (oldest first)', () => {
    const result = prepSingleSeries(rows, 'session');
    expect(result[0].time).toBe(1000);
    expect(result[1].time).toBe(2000);
    expect(result[2].time).toBe(3000);
  });

  it('uses session_pct for "session" window', () => {
    const result = prepSingleSeries(rows, 'session');
    expect(result[0].value).toBe(30);
    expect(result[1].value).toBe(50);
    expect(result[2].value).toBe(70);
  });

  it('uses weekly_pct for "weekly" window', () => {
    const result = prepSingleSeries(rows, 'weekly');
    expect(result[0].value).toBe(40);
    expect(result[1].value).toBe(60);
    expect(result[2].value).toBe(80);
  });

  it('maps null field to null (not 0)', () => {
    const r = [{ fetched_at: 1000, session_pct: null, weekly_pct: null }];
    expect(prepSingleSeries(r, 'session')[0].value).toBeNull();
  });

  it('does not mutate the input array', () => {
    const original = [...rows];
    prepSingleSeries(rows, 'session');
    expect(rows).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// 9. Data-prep helper — prepAllSeries
// ---------------------------------------------------------------------------

describe('prepAllSeries', () => {
  it('merges rows with the same fetched_at into one object', () => {
    const rowsByProvider = {
      claude: [{ fetched_at: 1000, session_pct: 10, weekly_pct: 20 }],
      codex:  [{ fetched_at: 1000, session_pct: 15, weekly_pct: 25 }],
      ollama: [],
      zai:    [],
    };
    const result = prepAllSeries(rowsByProvider, 'session');
    expect(result.length).toBe(1);
    expect(result[0].time).toBe(1000);
    expect(result[0].claude).toBe(10);
    expect(result[0].codex).toBe(15);
    expect(result[0].ollama).toBeUndefined();
  });

  it('returns rows in chronological order', () => {
    const rowsByProvider = {
      claude: [
        { fetched_at: 3000, session_pct: 30, weekly_pct: 40 },
        { fetched_at: 1000, session_pct: 10, weekly_pct: 20 },
      ],
      codex:  [{ fetched_at: 2000, session_pct: 20, weekly_pct: 30 }],
      ollama: [],
      zai:    [],
    };
    const result = prepAllSeries(rowsByProvider, 'session');
    expect(result.map(r => r.time)).toEqual([1000, 2000, 3000]);
  });

  it('uses weekly_pct when window is "weekly"', () => {
    const rowsByProvider = {
      claude: [{ fetched_at: 1000, session_pct: 10, weekly_pct: 90 }],
      codex: [], ollama: [], zai: [],
    };
    const result = prepAllSeries(rowsByProvider, 'weekly');
    expect(result[0].claude).toBe(90);
  });

  it('does not include missing providers in merged row', () => {
    const rowsByProvider = {
      claude: [{ fetched_at: 1000, session_pct: 42, weekly_pct: 60 }],
      codex: [], ollama: [], zai: [],
    };
    const result = prepAllSeries(rowsByProvider, 'session');
    expect(result[0].codex).toBeUndefined();
    expect(result[0].ollama).toBeUndefined();
    expect(result[0].zai).toBeUndefined();
  });

  it('returns empty array when all providers have no rows', () => {
    const rowsByProvider = { claude: [], codex: [], ollama: [], zai: [] };
    expect(prepAllSeries(rowsByProvider, 'session')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 10. Error banner
// ---------------------------------------------------------------------------

describe('History — error state', () => {
  it('shows error banner when IPC rejects', async () => {
    window.api = {
      db: {
        recentSnapshots: vi.fn().mockRejectedValue(new Error('db error')),
      },
    };
    render(<History />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText('Erreur de chargement — réessaie plus tard.')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 11. No crash when window.api is undefined
// ---------------------------------------------------------------------------

describe('History — no window.api', () => {
  it('renders without crashing when window.api is undefined', () => {
    expect(() => render(<History />)).not.toThrow();
  });

  it('shows empty state when window.api is undefined', () => {
    render(<History />);
    expect(screen.getByText('Pas de données pour les 30 derniers jours.')).toBeTruthy();
  });
});
