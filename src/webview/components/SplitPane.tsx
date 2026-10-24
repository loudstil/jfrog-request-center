import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from 'react';

const KEYBOARD_STEP = 0.05;
/** Matches .split-pane-divider's flex-basis in styles.css. */
const DIVIDER_PX = 1;

interface SplitPaneProps {
  top: ReactNode;
  bottom: ReactNode;
  /** Share of the height given to the top pane, 0–1. */
  ratio: number;
  onRatioChange: (ratio: number) => void;
  /** Ratio restored by double-clicking the divider. */
  defaultRatio: number;
  minTopPx: number;
  minBottomPx: number;
  label: string;
}

/** Two panes stacked vertically with a draggable, keyboard-accessible divider. */
export function SplitPane({
  top,
  bottom,
  ratio,
  onRatioChange,
  defaultRatio,
  minTopPx,
  minBottomPx,
  label,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const setClamped = useCallback(
    (next: number) => {
      const height = containerRef.current?.clientHeight ?? 0;
      // The divider takes its height from the bottom pane's share.
      onRatioChange(clampRatio(next, height, minTopPx, minBottomPx + DIVIDER_PX));
    },
    [onRatioChange, minTopPx, minBottomPx],
  );

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const container = containerRef.current;
    if (!dragging || !container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    setClamped((e.clientY - rect.top) / rect.height);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const actions: Record<string, () => number> = {
      ArrowUp: () => ratio - KEYBOARD_STEP,
      ArrowDown: () => ratio + KEYBOARD_STEP,
      Home: () => 0,
      End: () => 1,
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      setClamped(action());
    }
  }

  return (
    <div className={`split-pane${dragging ? ' dragging' : ''}`} ref={containerRef}>
      <div className="split-pane-top" style={{ flexBasis: `${ratio * 100}%` }}>
        {top}
      </div>
      <div
        className="split-pane-divider"
        role="separator"
        aria-orientation="horizontal"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        tabIndex={0}
        title="Drag to resize, double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => setClamped(defaultRatio)}
        onKeyDown={onKeyDown}
      />
      <div className="split-pane-bottom">{bottom}</div>
    </div>
  );
}

/**
 * Keeps both panes at least their minimum height. If the container is too small for both
 * minimums (or not laid out yet), the top pane's minimum wins.
 */
export function clampRatio(
  ratio: number,
  containerPx: number,
  minTopPx: number,
  minBottomPx: number,
): number {
  if (containerPx <= 0) {
    return Math.min(Math.max(ratio, 0), 1);
  }
  const min = minTopPx / containerPx;
  const max = 1 - minBottomPx / containerPx;
  return max < min ? Math.min(min, 1) : Math.min(Math.max(ratio, min), max);
}
