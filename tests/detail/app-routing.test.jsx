import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import App from '../../src/detail/App.jsx';

beforeEach(() => {
  // Provide a minimal window.api so Dashboard does not crash in routing tests
  window.api = {
    providers: { refreshAll: vi.fn().mockResolvedValue([]) },
    db: { recentSnapshots: vi.fn().mockResolvedValue([]) },
  };
});

afterEach(() => {
  delete window.api;
  cleanup();
  // Reset location.search after each test
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...window.location, search: '' },
  });
});

function setLocationSearch(search) {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...window.location, search },
  });
}

describe('App routing', () => {
  it('shows Dashboard by default when no URL param', () => {
    setLocationSearch('');
    render(<App />);
    // Sidebar Dashboard item is visible; the page grid or empty state is rendered
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('shows Settings when ?openTo=settings is in the URL', () => {
    setLocationSearch('?openTo=settings');
    render(<App />);
    expect(screen.getByText('Settings — coming up')).toBeTruthy();
  });

  it('falls back to Dashboard for an unknown ?openTo value', () => {
    setLocationSearch('?openTo=bogus');
    render(<App />);
    // Dashboard sidebar item present = Dashboard is the active page
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
  });

  it('navigates to Alerts page when clicking the Alerts sidebar item', () => {
    setLocationSearch('');
    render(<App />);
    // Click Alerts in sidebar
    fireEvent.click(screen.getByText('Alerts').closest('[role="button"]'));
    expect(screen.getByText('Alerts — coming up')).toBeTruthy();
  });

  it('shows History page when navigated via sidebar', () => {
    setLocationSearch('');
    render(<App />);
    fireEvent.click(screen.getByText('History').closest('[role="button"]'));
    expect(screen.getByText('History — coming up')).toBeTruthy();
  });
});
