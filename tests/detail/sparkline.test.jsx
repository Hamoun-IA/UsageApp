import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import Sparkline from '../../src/detail/components/Sparkline.jsx';

afterEach(cleanup);

describe('Sparkline', () => {
  it('renders an empty SVG with no <path> when points is an empty array', () => {
    const { container } = render(<Sparkline points={[]} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('width')).toBe('220');
    expect(svg.getAttribute('height')).toBe('36');
    expect(container.querySelector('path')).toBeNull();
  });

  it('renders an empty SVG when only one point is provided', () => {
    const { container } = render(<Sparkline points={[42]} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('path')).toBeNull();
  });

  it('renders an empty SVG when points is null', () => {
    const { container } = render(<Sparkline points={null} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('path')).toBeNull();
  });

  it('renders an empty SVG when points is undefined', () => {
    const { container } = render(<Sparkline />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('path')).toBeNull();
  });

  it('renders a <path> with correct d attribute for a two-point array', () => {
    const { container } = render(<Sparkline points={[0, 100]} />);
    const path = container.querySelector('path');
    expect(path).toBeTruthy();
    // width=220, height=36, points=[0,100], stepX=220, max=100, min=0, span=100
    // i=0: px=0.0, py=36-(0/100)*36=36.0 → M 0.0 36.0
    // i=1: px=220.0, py=36-(100/100)*36=0.0 → L 220.0 0.0
    expect(path.getAttribute('d')).toBe('M 0.0 36.0 L 220.0 0.0');
  });

  it('preserves max y at top with points=[100,50,0]', () => {
    const { container } = render(<Sparkline points={[100, 50, 0]} />);
    const path = container.querySelector('path');
    expect(path).toBeTruthy();
    // width=220, height=36, max=100, span=100, stepX=110
    // i=0: px=0.0,   py=36-(100/100)*36=0.0   → M 0.0 0.0
    // i=1: px=110.0, py=36-(50/100)*36=18.0   → L 110.0 18.0
    // i=2: px=220.0, py=36-(0/100)*36=36.0    → L 220.0 36.0
    expect(path.getAttribute('d')).toBe('M 0.0 0.0 L 110.0 18.0 L 220.0 36.0');
  });

  it('applies a custom color to the <path> stroke', () => {
    const { container } = render(<Sparkline points={[10, 20]} color="#ff0000" />);
    const path = container.querySelector('path');
    expect(path).toBeTruthy();
    expect(path.getAttribute('stroke')).toBe('#ff0000');
  });

  it('uses custom width and height props', () => {
    const { container } = render(<Sparkline points={[0, 50]} width={100} height={20} />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('100');
    expect(svg.getAttribute('height')).toBe('20');
    const path = container.querySelector('path');
    expect(path).toBeTruthy();
  });
});
