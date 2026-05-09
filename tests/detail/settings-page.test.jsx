import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import Settings from '../../src/detail/pages/Settings.jsx';

// ---------------------------------------------------------------------------
// Snapshot factories
// ---------------------------------------------------------------------------

function makeSnap(provider, connected = false, errorCode = null) {
  if (!connected || errorCode === 'NOT_CONFIGURED') {
    return {
      provider,
      fetchedAt: Date.now(),
      sessionPct: null,
      weeklyPct: null,
      sessionResetAt: null,
      weeklyResetAt: null,
      planLevel: null,
      approximated: false,
      raw: null,
      error: errorCode
        ? { code: errorCode, message: errorCode, retriable: false }
        : { code: 'NOT_CONFIGURED', message: 'not configured', retriable: false },
    };
  }
  return {
    provider,
    fetchedAt: Date.now(),
    sessionPct: 42,
    weeklyPct: 60,
    sessionResetAt: null,
    weeklyResetAt: null,
    planLevel: 'Pro',
    approximated: false,
    raw: {},
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  delete window.api;
  cleanup();
});

function setupApi({ snaps, autostart = false, retentionDays = 90 } = {}) {
  window.api = {
    providers: {
      refreshAll: vi.fn().mockResolvedValue(snaps ?? [
        makeSnap('claude'),
        makeSnap('codex'),
        makeSnap('ollama'),
        makeSnap('zai'),
      ]),
      connect:    vi.fn().mockResolvedValue({}),
      disconnect: vi.fn().mockResolvedValue({}),
    },
    db: {
      getPref: vi.fn().mockImplementation((key, fallback) => {
        if (key === 'autostart') return Promise.resolve(autostart);
        if (key === 'retentionDays') return Promise.resolve(retentionDays);
        return Promise.resolve(fallback ?? null);
      }),
      setPref: vi.fn().mockResolvedValue(undefined),
    },
    app: {
      setAutostart: vi.fn().mockResolvedValue(true),
      getAutostart: vi.fn().mockResolvedValue(autostart),
    },
  };
  return window.api;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Settings page', () => {
  describe('structure', () => {
    it('renders all 4 section headings', async () => {
      setupApi();
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByText('Connexions')).toBeTruthy();
        expect(screen.getByText('Démarrage automatique')).toBeTruthy();
        expect(screen.getByText('Rétention DB')).toBeTruthy();
        expect(screen.getByText('Raccourci global')).toBeTruthy();
      });
    });

    it('renders all 4 provider labels', async () => {
      setupApi();
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByText('Claude')).toBeTruthy();
        expect(screen.getByText('Codex')).toBeTruthy();
        expect(screen.getByText('Ollama')).toBeTruthy();
        expect(screen.getByText('Z.ai')).toBeTruthy();
      });
    });

    it('renders the persisted shortcut accelerator', async () => {
      setupApi();
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByText('CommandOrControl+Shift+Alt+U')).toBeTruthy();
      });
    });
  });

  describe('Connexions section', () => {
    it('shows "Connecter" button for disconnected providers', async () => {
      setupApi({
        snaps: [
          makeSnap('claude'),   // NOT_CONFIGURED → Déconnecté
          makeSnap('codex'),
          makeSnap('ollama'),
          makeSnap('zai'),
        ],
      });
      render(<Settings />);
      await waitFor(() => {
        const btns = screen.getAllByText('Connecter');
        expect(btns.length).toBe(4);
      });
    });

    it('shows "Déconnecter" button for a connected provider', async () => {
      setupApi({
        snaps: [
          makeSnap('claude', true),   // connected, no error
          makeSnap('codex'),
          makeSnap('ollama'),
          makeSnap('zai'),
        ],
      });
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByText('Déconnecter')).toBeTruthy();
        expect(screen.getAllByText('Connecter').length).toBe(3);
      });
    });

    it('calls connect(id) when "Connecter" clicked for Claude', async () => {
      const api = setupApi({
        snaps: [
          makeSnap('claude'),
          makeSnap('codex'),
          makeSnap('ollama'),
          makeSnap('zai'),
        ],
      });
      render(<Settings />);
      await waitFor(() => screen.getAllByText('Connecter'));

      const buttons = screen.getAllByText('Connecter');
      // Claude is first in the PROVIDERS array → first button
      await act(async () => {
        fireEvent.click(buttons[0]);
      });
      expect(api.providers.connect).toHaveBeenCalledWith('claude');
    });

    it('calls disconnect(id) when "Déconnecter" clicked for Z.ai', async () => {
      const api = setupApi({
        snaps: [
          makeSnap('claude'),
          makeSnap('codex'),
          makeSnap('ollama'),
          makeSnap('zai', true),  // connected
        ],
      });
      render(<Settings />);
      await waitFor(() => screen.getByText('Déconnecter'));

      await act(async () => {
        fireEvent.click(screen.getByText('Déconnecter'));
      });
      expect(api.providers.disconnect).toHaveBeenCalledWith('zai');
    });
  });

  describe('Démarrage automatique section', () => {
    it('checkbox is unchecked by default when autostart pref is false', async () => {
      setupApi({ autostart: false });
      render(<Settings />);
      await waitFor(() => {
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox.checked).toBe(false);
      });
    });

    it('checkbox is checked when autostart pref is true', async () => {
      setupApi({ autostart: true });
      render(<Settings />);
      await waitFor(() => {
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox.checked).toBe(true);
      });
    });

    it('calls setAutostart(true) when checkbox is toggled on', async () => {
      const api = setupApi({ autostart: false });
      render(<Settings />);
      await waitFor(() => screen.getByRole('checkbox'));

      await act(async () => {
        fireEvent.click(screen.getByRole('checkbox'));
      });
      expect(api.app.setAutostart).toHaveBeenCalledWith(true);
    });
  });

  describe('Rétention DB section', () => {
    function getRetentionSelect() {
      // Of the 2 selects on the page, the retention one carries the "30 jours" option.
      const selects = screen.getAllByRole('combobox');
      return selects.find((s) => s.querySelector('option[value="30"]') && s.querySelector('option[value="180"]'));
    }

    it('select shows the current retention value from getPref', async () => {
      setupApi({ retentionDays: 30 });
      render(<Settings />);
      await waitFor(() => {
        const select = getRetentionSelect();
        expect(Number(select.value)).toBe(30);
      });
    });

    it('calls setPref("retentionDays", N) when dropdown changed', async () => {
      const api = setupApi({ retentionDays: 90 });
      render(<Settings />);
      await waitFor(() => getRetentionSelect());

      await act(async () => {
        fireEvent.change(getRetentionSelect(), { target: { value: '30' } });
      });
      expect(api.db.setPref).toHaveBeenCalledWith('retentionDays', 30);
    });

    it('renders all 4 retention options', async () => {
      setupApi();
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByText('7 jours')).toBeTruthy();
        expect(screen.getByText('30 jours')).toBeTruthy();
        expect(screen.getByText('90 jours')).toBeTruthy();
        expect(screen.getByText('180 jours')).toBeTruthy();
      });
    });
  });

  describe('loading / error states', () => {
    it('does not crash when window.api is undefined', () => {
      delete window.api;
      expect(() => render(<Settings />)).not.toThrow();
    });

    it('does not crash when refreshAll returns empty array', async () => {
      setupApi({ snaps: [] });
      expect(() => render(<Settings />)).not.toThrow();
      await waitFor(() => {
        const btns = screen.getAllByText('Connecter');
        expect(btns.length).toBe(4);
      });
    });

    it('shows error banner when refreshAll rejects', async () => {
      window.api = {
        providers: {
          refreshAll: vi.fn().mockRejectedValue(new Error('network error')),
        },
        db: {
          getPref: vi.fn().mockResolvedValue(null),
          setPref: vi.fn().mockResolvedValue(undefined),
        },
        app: {
          setAutostart: vi.fn().mockResolvedValue(true),
          getAutostart: vi.fn().mockResolvedValue(false),
        },
      };
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(screen.getByText('Erreur de chargement — réessaie plus tard.')).toBeTruthy();
      });
    });

    it('does not show error banner when refreshAll succeeds', async () => {
      setupApi();
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByText('Connexions')).toBeTruthy();
      });
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});

describe('Settings page — M5 additions', () => {
  beforeEach(() => {
    window.api = {
      providers: {
        refreshAll: vi.fn().mockResolvedValue([]),
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
      },
      db: {
        getPref: vi.fn(async (key, fallback) => {
          if (key === 'pollIntervalMin') return 5;
          if (key === 'globalShortcut') return 'CommandOrControl+Shift+Alt+U';
          if (key === 'autostart') return false;
          if (key === 'retentionDays') return 90;
          return fallback;
        }),
        setPref: vi.fn().mockResolvedValue(undefined),
      },
      app: {
        setAutostart: vi.fn().mockResolvedValue(true),
        setPollInterval: vi.fn().mockResolvedValue(true),
        setGlobalShortcut: vi.fn().mockResolvedValue({ ok: true }),
      },
    };
  });

  afterEach(() => { cleanup(); });

  it('renders a Fréquence dropdown with the persisted value', async () => {
    render(<Settings />);
    const select = await screen.findByLabelText(/fr[ée]quence/i);
    expect(select.value).toBe('5');
  });

  it('changing Fréquence calls app.setPollInterval', async () => {
    render(<Settings />);
    const select = await screen.findByLabelText(/fr[ée]quence/i);
    fireEvent.change(select, { target: { value: '15' } });
    await waitFor(() => {
      expect(window.api.app.setPollInterval).toHaveBeenCalledWith(15);
    });
  });

  it('shows an error banner when setGlobalShortcut returns { ok: false, reason: "CONFLICT" }', async () => {
    window.api.app.setGlobalShortcut = vi.fn().mockResolvedValue({ ok: false, reason: 'CONFLICT' });
    render(<Settings />);

    fireEvent.click(await screen.findByRole('button', { name: /modifier/i }));
    const captureZone = screen.getByTestId('shortcut-capture');
    fireEvent.keyDown(captureZone, { ctrlKey: true, altKey: true, key: 'm' });

    await waitFor(() => {
      expect(screen.getByText(/conflit|d[ée]j[àa] utilis/i)).toBeTruthy();
    });
  });
});
