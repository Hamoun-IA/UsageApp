import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Widget from '../src/widget/Widget.jsx';

beforeEach(() => {
  window.api = {
    providers: {
      refreshAll: vi.fn().mockResolvedValue([]),
      connect: vi.fn().mockResolvedValue({}),
    },
    widget: {
      setHeight: vi.fn(),
    },
    app: {
      openDetail:   vi.fn().mockResolvedValue(true),
      openSettings: vi.fn().mockResolvedValue(true),
    },
    db: {
      recentSnapshots: vi.fn().mockResolvedValue([]),
      getPref: vi.fn().mockResolvedValue(null),
    },
  };
});

afterEach(() => {
  delete window.api;
  cleanup();
});

describe('Widget footer buttons', () => {
  it('renders the ⤢ button with aria-label "Vue détaillée"', () => {
    render(<Widget />);
    expect(screen.getByRole('button', { name: 'Vue détaillée' })).toBeTruthy();
  });

  it('renders the ⚙ button with aria-label "Paramètres"', () => {
    render(<Widget />);
    expect(screen.getByRole('button', { name: 'Paramètres' })).toBeTruthy();
  });

  it('calls openDetail() when ⤢ button is clicked', () => {
    render(<Widget />);
    fireEvent.click(screen.getByRole('button', { name: 'Vue détaillée' }));
    expect(window.api.app.openDetail).toHaveBeenCalledTimes(1);
  });

  it('calls openSettings() when ⚙ button is clicked', () => {
    render(<Widget />);
    fireEvent.click(screen.getByRole('button', { name: 'Paramètres' }));
    expect(window.api.app.openSettings).toHaveBeenCalledTimes(1);
  });
});
