// Pure helpers behind the results table: columns, formatting, sorting, filtering and widths.

export type Row = Record<string, unknown>;

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

const COLUMN_SAMPLE_ROWS = 200;
const CHAR_WIDTH_PX = 7.5;
const CELL_PADDING_PX = 24;
export const MIN_COLUMN_WIDTH_PX = 60;
const MAX_INITIAL_COLUMN_WIDTH_PX = 400;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Every field that appears in any row, in first-seen order (`.include()` changes them). */
export function getColumns(rows: readonly Row[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }
  return [...columns];
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Header click cycle: ascending → descending → unsorted. */
export function nextSort(current: SortState | undefined, column: string): SortState | undefined {
  if (current?.column !== column) {
    return { column, direction: 'asc' };
  }
  return current.direction === 'asc' ? { column, direction: 'desc' } : undefined;
}

/** A sorted copy. Numbers compare numerically, text naturally ("2" < "10"); empty values go last. */
export function sortRows(rows: readonly Row[], sort: SortState | undefined): readonly Row[] {
  if (!sort) {
    return rows;
  }
  const direction = sort.direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      const a = x.row[sort.column];
      const b = y.row[sort.column];
      const aEmpty = isEmpty(a);
      const bEmpty = isEmpty(b);
      if (aEmpty || bEmpty) {
        return aEmpty === bEmpty ? x.index - y.index : aEmpty ? 1 : -1;
      }
      return compareValues(a, b) * direction || x.index - y.index;
    })
    .map(({ row }) => row);
}

/** Rows where any cell contains `text`, ignoring case. */
export function filterRows(
  rows: readonly Row[],
  columns: readonly string[],
  text: string,
): readonly Row[] {
  const needle = text.trim().toLowerCase();
  if (!needle) {
    return rows;
  }
  return rows.filter((row) =>
    columns.some((column) => formatCell(row[column]).toLowerCase().includes(needle)),
  );
}

/** A starting width that fits the header and the first rows' values, within sensible bounds. */
export function estimateColumnWidth(column: string, rows: readonly Row[]): number {
  let chars = column.length + 2; // room for the sort arrow
  const sampleSize = Math.min(rows.length, COLUMN_SAMPLE_ROWS);
  for (let i = 0; i < sampleSize; i++) {
    chars = Math.max(chars, formatCell(rows[i][column]).length);
  }
  const px = Math.round(chars * CHAR_WIDTH_PX + CELL_PADDING_PX);
  return Math.min(Math.max(px, MIN_COLUMN_WIDTH_PX), MAX_INITIAL_COLUMN_WIDTH_PX);
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return collator.compare(formatCell(a), formatCell(b));
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}
