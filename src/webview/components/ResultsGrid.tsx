import { useVirtualizer } from '@tanstack/react-virtual';
import { type PointerEvent, useMemo, useRef, useState } from 'react';
import {
  estimateColumnWidth,
  formatCell,
  MIN_COLUMN_WIDTH_PX,
  type Row,
  type SortState,
} from './resultsModel';

const ROW_HEIGHT_PX = 24;
const HEADER_HEIGHT_PX = 26;
const OVERSCAN_ROWS = 20;
const DIGIT_WIDTH_PX = 8;

interface ResultsGridProps {
  /** The rows to show, already filtered and sorted. */
  rows: readonly Row[];
  /** The full, unsorted result; column widths are estimated from it so they stay put. */
  allRows: readonly Row[];
  columns: readonly string[];
  sort: SortState | undefined;
  onSortClick: (column: string) => void;
}

/**
 * A virtualized table: only the rows in view are in the DOM, so large AQL results stay fast.
 * Rows are absolutely positioned, so column widths are explicit (estimated, then resizable).
 */
export function ResultsGrid({ rows, allRows, columns, sort, onSortClick }: ResultsGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Widths survive re-runs for columns with the same name, including ones the user resized.
  const [widths, setWidths] = useState<Record<string, number>>({});
  const estimated = useMemo(
    () => new Map(columns.map((column) => [column, estimateColumnWidth(column, allRows)])),
    [columns, allRows],
  );
  const widthOf = (column: string) =>
    widths[column] ?? estimated.get(column) ?? MIN_COLUMN_WIDTH_PX;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: OVERSCAN_ROWS,
    scrollMargin: HEADER_HEIGHT_PX,
  });

  const rowNumberWidth = String(rows.length).length * DIGIT_WIDTH_PX + 16;
  const totalWidth = columns.reduce((sum, column) => sum + widthOf(column), rowNumberWidth);

  return (
    <div
      className="grid"
      ref={scrollRef}
      role="table"
      aria-rowcount={rows.length + 1}
      aria-colcount={columns.length + 1}
    >
      <div className="grid-header" role="row" aria-rowindex={1} style={{ width: totalWidth }}>
        <div
          className="grid-cell grid-row-number"
          role="columnheader"
          style={{ width: rowNumberWidth }}
        >
          #
        </div>
        {columns.map((column) => {
          const direction = sort?.column === column ? sort.direction : undefined;
          return (
            <div
              key={column}
              className="grid-cell grid-header-cell"
              role="columnheader"
              aria-sort={
                direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'
              }
              style={{ width: widthOf(column) }}
            >
              <button
                className="grid-sort-button"
                onClick={() => onSortClick(column)}
                title={`Sort by ${column}`}
              >
                <span className="grid-header-label">{column}</span>
                <span className="grid-sort-indicator" aria-hidden="true">
                  {direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : ''}
                </span>
              </button>
              <ColumnResizer
                width={widthOf(column)}
                onResize={(width) => setWidths((current) => ({ ...current, [column]: width }))}
                onReset={() =>
                  setWidths((current) => {
                    const next = { ...current };
                    delete next[column];
                    return next;
                  })
                }
              />
            </div>
          );
        })}
      </div>

      <div
        className="grid-body"
        role="rowgroup"
        style={{ height: virtualizer.getTotalSize(), width: totalWidth }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          return (
            <div
              key={item.key}
              className={`grid-row${item.index % 2 ? ' odd' : ''}`}
              role="row"
              aria-rowindex={item.index + 2}
              style={{
                height: ROW_HEIGHT_PX,
                transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              <div
                className="grid-cell grid-row-number"
                role="cell"
                style={{ width: rowNumberWidth }}
              >
                {item.index + 1}
              </div>
              {columns.map((column) => {
                const text = formatCell(row[column]);
                return (
                  <div
                    key={column}
                    className="grid-cell"
                    role="cell"
                    title={text}
                    style={{ width: widthOf(column) }}
                  >
                    {text}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Drag handle on a header's right edge. Double-click restores the estimated width. */
function ColumnResizer({
  width,
  onResize,
  onReset,
}: {
  width: number;
  onResize: (width: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | undefined>(undefined);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: width };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (drag.current) {
      const next = drag.current.startWidth + e.clientX - drag.current.startX;
      onResize(Math.max(MIN_COLUMN_WIDTH_PX, Math.round(next)));
    }
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = undefined;
  }

  return (
    <div
      className="grid-column-resizer"
      aria-hidden="true"
      title="Drag to resize, double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
