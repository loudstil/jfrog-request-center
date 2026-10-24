import { describe, expect, it } from 'vitest';
import { clampRatio } from './SplitPane';

describe('clampRatio', () => {
  it('keeps a ratio that leaves room for both panes', () => {
    expect(clampRatio(0.4, 1000, 100, 150)).toBe(0.4);
  });

  it('enforces the top minimum', () => {
    expect(clampRatio(0.05, 1000, 100, 150)).toBe(0.1);
  });

  it('enforces the bottom minimum', () => {
    expect(clampRatio(0.95, 1000, 100, 150)).toBe(0.85);
  });

  it('favors the top pane when both minimums do not fit', () => {
    expect(clampRatio(0.5, 200, 120, 150)).toBe(0.6);
    expect(clampRatio(0.5, 100, 120, 150)).toBe(1);
  });

  it('only bounds to 0–1 before the container is laid out', () => {
    expect(clampRatio(0.4, 0, 100, 150)).toBe(0.4);
    expect(clampRatio(-1, 0, 100, 150)).toBe(0);
    expect(clampRatio(2, 0, 100, 150)).toBe(1);
  });
});
