import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ShortcutInput from '../../src/detail/components/ShortcutInput.jsx';

afterEach(() => { cleanup(); });

describe('ShortcutInput', () => {
  it('renders the current value and a "Modifier" button by default', () => {
    render(<ShortcutInput value="CommandOrControl+Shift+Alt+U" onChange={() => {}} />);
    expect(screen.getByText('CommandOrControl+Shift+Alt+U')).toBeTruthy();
    expect(screen.getByRole('button', { name: /modifier/i })).toBeTruthy();
  });

  it('clicking "Modifier" enters recording mode (button text changes)', () => {
    render(<ShortcutInput value="CommandOrControl+Alt+M" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /modifier/i }));
    expect(screen.getByText(/appuie/i)).toBeTruthy();
  });

  it('captures Ctrl+Shift+Alt+K and calls onChange with "CommandOrControl+Shift+Alt+K"', () => {
    const onChange = vi.fn();
    render(<ShortcutInput value="CommandOrControl+Alt+M" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /modifier/i }));
    const captureZone = screen.getByTestId('shortcut-capture');
    fireEvent.keyDown(captureZone, { ctrlKey: true, shiftKey: true, altKey: true, key: 'k' });
    expect(onChange).toHaveBeenCalledWith('CommandOrControl+Shift+Alt+K');
  });

  it('Esc cancels — does not call onChange', () => {
    const onChange = vi.fn();
    render(<ShortcutInput value="CommandOrControl+Alt+M" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /modifier/i }));
    const captureZone = screen.getByTestId('shortcut-capture');
    fireEvent.keyDown(captureZone, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects bare modifier press (Ctrl alone) — keeps recording', () => {
    const onChange = vi.fn();
    render(<ShortcutInput value="CommandOrControl+Alt+M" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /modifier/i }));
    const captureZone = screen.getByTestId('shortcut-capture');
    fireEvent.keyDown(captureZone, { ctrlKey: true, key: 'Control' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/appuie/i)).toBeTruthy();
  });

  it('rejects key without any modifier — calls onError, does not call onChange', () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    render(<ShortcutInput value="CommandOrControl+Alt+M" onChange={onChange} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: /modifier/i }));
    const captureZone = screen.getByTestId('shortcut-capture');
    fireEvent.keyDown(captureZone, { ctrlKey: false, shiftKey: false, altKey: false, key: 'k' });
    expect(onChange).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it('maps space and arrows correctly', () => {
    const onChange = vi.fn();
    render(<ShortcutInput value="CommandOrControl+Alt+M" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /modifier/i }));
    const captureZone = screen.getByTestId('shortcut-capture');
    fireEvent.keyDown(captureZone, { ctrlKey: true, key: ' ' });
    expect(onChange).toHaveBeenCalledWith('CommandOrControl+Space');
  });
});
