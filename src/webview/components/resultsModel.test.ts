import { describe, expect, it } from 'vitest';
import {
  estimateColumnWidth,
  filterRows,
  formatCell,
  getColumns,
  MIN_COLUMN_WIDTH_PX,
  nextSort,
  type Row,
  sortRows,
} from './resultsModel';

const names = (rows: readonly Row[]) => rows.map((r) => r.name);

describe('getColumns', () => {
  it('collects every key in first-seen order', () => {
    expect(getColumns([{ repo: 'a', name: 'x' }, { name: 'y', size: 1 }, {}])).toEqual([
      'repo',
      'name',
      'size',
    ]);
  });
});

describe('formatCell', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    [42, '42'],
    [false, 'false'],
    ['text', 'text'],
    [{ key: 'v' }, '{"key":"v"}'],
    [[1, 2], '[1,2]'],
  ])('%j -> %j', (value, expected) => {
    expect(formatCell(value)).toBe(expected);
  });
});

describe('nextSort', () => {
  it('cycles ascending, descending, unsorted', () => {
    const asc = nextSort(undefined, 'name');
    expect(asc).toEqual({ column: 'name', direction: 'asc' });
    const desc = nextSort(asc, 'name');
    expect(desc).toEqual({ column: 'name', direction: 'desc' });
    expect(nextSort(desc, 'name')).toBeUndefined();
  });

  it('starts ascending when switching columns', () => {
    expect(nextSort({ column: 'name', direction: 'desc' }, 'size')).toEqual({
      column: 'size',
      direction: 'asc',
    });
  });
});

describe('sortRows', () => {
  const rows: Row[] = [
    { name: 'b', size: 10, version: 'v10' },
    { name: 'a', size: 9, version: 'v2' },
    { name: 'c', size: null, version: '' },
    { name: 'd', size: 100, version: 'v1' },
  ];

  it('returns the original rows when unsorted', () => {
    expect(sortRows(rows, undefined)).toBe(rows);
  });

  it('sorts numbers numerically', () => {
    expect(names(sortRows(rows, { column: 'size', direction: 'asc' }))).toEqual([
      'a',
      'b',
      'd',
      'c',
    ]);
  });

  it('sorts text naturally and keeps empty values last in both directions', () => {
    expect(names(sortRows(rows, { column: 'version', direction: 'asc' }))).toEqual([
      'd',
      'a',
      'b',
      'c',
    ]);
    expect(names(sortRows(rows, { column: 'version', direction: 'desc' }))).toEqual([
      'b',
      'a',
      'd',
      'c',
    ]);
  });

  it('is stable for equal values and does not modify the input', () => {
    const tied: Row[] = [
      { name: 'first', repo: 'x' },
      { name: 'second', repo: 'X' },
    ];
    expect(names(sortRows(tied, { column: 'repo', direction: 'desc' }))).toEqual([
      'first',
      'second',
    ]);
    expect(names(rows)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('puts rows missing the column last', () => {
    expect(
      names(
        sortRows([{ name: 'no size' }, { name: 'x', size: 1 }], {
          column: 'size',
          direction: 'asc',
        }),
      ),
    ).toEqual(['x', 'no size']);
  });
});

describe('filterRows', () => {
  const rows: Row[] = [
    { name: 'app-1.0.jar', repo: 'libs-release', props: { team: 'Payments' } },
    { name: 'lib.jar', repo: 'libs-snapshot', props: null },
  ];
  const columns = ['name', 'repo', 'props'];

  it('returns all rows for an empty filter', () => {
    expect(filterRows(rows, columns, '  ')).toBe(rows);
  });

  it('matches any column, ignoring case', () => {
    expect(names(filterRows(rows, columns, 'SNAPSHOT'))).toEqual(['lib.jar']);
    expect(names(filterRows(rows, columns, '.jar'))).toEqual(['app-1.0.jar', 'lib.jar']);
  });

  it('matches inside object values', () => {
    expect(names(filterRows(rows, columns, 'payments'))).toEqual(['app-1.0.jar']);
  });

  it('returns nothing when no cell matches', () => {
    expect(filterRows(rows, columns, 'zip')).toEqual([]);
  });
});

describe('estimateColumnWidth', () => {
  it('fits the longest of the header and sampled values', () => {
    const narrow = estimateColumnWidth('id', [{ id: 1 }]);
    const wide = estimateColumnWidth('path', [{ path: 'org/example/app/1.0.0/deep/path' }]);
    expect(narrow).toBe(MIN_COLUMN_WIDTH_PX);
    expect(wide).toBeGreaterThan(200);
  });

  it('caps very long values', () => {
    expect(estimateColumnWidth('sha', [{ sha: 'x'.repeat(500) }])).toBe(400);
  });
});
