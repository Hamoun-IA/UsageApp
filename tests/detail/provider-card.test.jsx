import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ProviderCard from '../../src/detail/components/ProviderCard.jsx';

afterEach(cleanup);

const HAPPY_SNAP = {
  provider: 'claude',
  fetchedAt: Date.now(),
  sessionPct: 55,
  weeklyPct: 70,
  sessionResetAt: Date.now() + 2 * 3600_000,
  weeklyResetAt: Date.now() + 72 * 3600_000,
  planLevel: 'Pro',
  approximated: false,
  raw: {},
  error: null,
};

describe('ProviderCard', () => {
  it('renders label, plan badge, both bars, and sparkline with happy-path snap', () => {
    const { container } = render(
      <ProviderCard
        snap={HAPPY_SNAP}
        points={[10, 30, 55]}
        color="#f59e0b"
        label="Claude"
      />,
    );

    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText('55%')).toBeTruthy();
    expect(screen.getByText('70%')).toBeTruthy();
    // Both session and weekly bar labels are present
    expect(screen.getByText('Session 5h')).toBeTruthy();
    expect(screen.getByText('Weekly')).toBeTruthy();
    // Sparkline SVG rendered
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('path')).toBeTruthy();
  });

  it('renders approximated badge when snap.approximated is true', () => {
    render(
      <ProviderCard
        snap={{ ...HAPPY_SNAP, approximated: true }}
        points={[]}
        color="#f59e0b"
        label="Claude"
      />,
    );
    expect(screen.getByText('(approximé)')).toBeTruthy();
  });

  it('renders error message and no session/weekly labels for an error snap', () => {
    const errorSnap = {
      provider: 'claude',
      fetchedAt: Date.now(),
      sessionPct: null,
      weeklyPct: null,
      sessionResetAt: null,
      weeklyResetAt: null,
      planLevel: null,
      approximated: false,
      raw: null,
      error: { code: 'AUTH_EXPIRED', message: 'token expired', retriable: true },
    };
    render(
      <ProviderCard
        snap={errorSnap}
        points={[]}
        color="#f59e0b"
        label="Claude"
      />,
    );
    expect(screen.getByText('token expired')).toBeTruthy();
    // No progress bar labels rendered for errored card
    expect(screen.queryByText('Session 5h')).toBeNull();
    expect(screen.queryByText('Weekly')).toBeNull();
  });

  it('shows NOT_CONFIGURED error as "Non configuré"', () => {
    const notConfiguredSnap = {
      provider: 'claude',
      fetchedAt: Date.now(),
      sessionPct: null,
      weeklyPct: null,
      sessionResetAt: null,
      weeklyResetAt: null,
      planLevel: null,
      approximated: false,
      raw: null,
      error: { code: 'NOT_CONFIGURED', message: 'not configured', retriable: false },
    };
    render(
      <ProviderCard
        snap={notConfiguredSnap}
        points={[]}
        color="#f59e0b"
        label="Claude"
      />,
    );
    expect(screen.getByText('Non configuré')).toBeTruthy();
  });

  it('does not render "Resets in" when no reset times provided', () => {
    render(
      <ProviderCard
        snap={{ ...HAPPY_SNAP, sessionResetAt: null, weeklyResetAt: null }}
        points={[]}
        color="#f59e0b"
        label="Claude"
      />,
    );
    expect(screen.queryByText(/Resets in/)).toBeNull();
  });

  it('renders "Resets in" when reset times are provided', () => {
    render(
      <ProviderCard
        snap={HAPPY_SNAP}
        points={[]}
        color="#f59e0b"
        label="Claude"
      />,
    );
    const resetTexts = screen.getAllByText(/Resets in/);
    expect(resetTexts.length).toBe(2);
  });

  it('does not render sparkline when fewer than 2 points', () => {
    const { container } = render(
      <ProviderCard
        snap={HAPPY_SNAP}
        points={[42]}
        color="#f59e0b"
        label="Claude"
      />,
    );
    // ProviderCard guards `points.length >= 2`, so no SVG is rendered at all
    expect(container.querySelector('svg')).toBeNull();
  });
});
