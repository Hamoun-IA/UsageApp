import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import Widget from '../src/widget/Widget.jsx';

let onShowCallback = null;
let onShowUnsubscribe = null;

beforeEach(() => {
  onShowCallback = null;
  onShowUnsubscribe = vi.fn();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.api = {
    providers: {
      refreshAll: vi.fn().mockResolvedValue([]),
      connect: vi.fn().mockResolvedValue({}),
    },
    widget: {
      setHeight: vi.fn(),
      onShow: vi.fn((cb) => {
        onShowCallback = cb;
        return onShowUnsubscribe;
      }),
    },
    app: {
      openDetail: vi.fn().mockResolvedValue(true),
      openSettings: vi.fn().mockResolvedValue(true),
    },
    db: {
      recentSnapshots: vi.fn().mockResolvedValue([]),
      getPref: vi.fn().mockResolvedValue(null),
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
  delete window.api;
  cleanup();
});

describe('Widget auto-refresh on show', () => {
  it('subscribes to widget.onShow on mount', () => {
    render(<Widget />);
    expect(window.api.widget.onShow).toHaveBeenCalledTimes(1);
    expect(typeof onShowCallback).toBe('function');
  });

  it('unsubscribes from widget.onShow on unmount', () => {
    const { unmount } = render(<Widget />);
    unmount();
    expect(onShowUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('skips refresh when onShow fires within 10s of last refresh', async () => {
    render(<Widget />);
    await waitFor(() => expect(window.api.providers.refreshAll).toHaveBeenCalledTimes(1));

    await act(async () => { vi.advanceTimersByTime(5_000); });
    await act(async () => { onShowCallback(); });

    expect(window.api.providers.refreshAll).toHaveBeenCalledTimes(1);
  });

  it('triggers refresh when onShow fires more than 10s after last refresh', async () => {
    render(<Widget />);
    await waitFor(() => expect(window.api.providers.refreshAll).toHaveBeenCalledTimes(1));

    await act(async () => { vi.advanceTimersByTime(11_000); });
    await act(async () => { onShowCallback(); });

    await waitFor(() => expect(window.api.providers.refreshAll).toHaveBeenCalledTimes(2));
  });
});
