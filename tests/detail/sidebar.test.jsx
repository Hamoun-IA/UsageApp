import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Sidebar from '../../src/detail/components/Sidebar.jsx';

afterEach(cleanup);

describe('Sidebar', () => {
  it('renders 4 nav items with correct labels', () => {
    render(<Sidebar active="history" onChange={vi.fn()} />);
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Alerts')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('marks the active item with aria-current="page"', () => {
    render(<Sidebar active="history" onChange={vi.fn()} />);
    const historyItem = screen.getByText('History').closest('[role="button"]');
    expect(historyItem.getAttribute('aria-current')).toBe('page');
  });

  it('does not mark inactive items with aria-current', () => {
    render(<Sidebar active="history" onChange={vi.fn()} />);
    const dashboardItem = screen.getByText('Dashboard').closest('[role="button"]');
    expect(dashboardItem.getAttribute('aria-current')).toBeNull();
  });

  it('calls onChange with the correct id when another item is clicked', () => {
    const onChange = vi.fn();
    render(<Sidebar active="history" onChange={onChange} />);
    fireEvent.click(screen.getByText('Alerts').closest('[role="button"]'));
    expect(onChange).toHaveBeenCalledWith('alerts');
  });

  it('calls onChange when Dashboard item is clicked', () => {
    const onChange = vi.fn();
    render(<Sidebar active="history" onChange={onChange} />);
    fireEvent.click(screen.getByText('Dashboard').closest('[role="button"]'));
    expect(onChange).toHaveBeenCalledWith('dashboard');
  });
});
