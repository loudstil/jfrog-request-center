import { useMemo } from 'react';

// Rendering is not virtualized yet, so cap the DOM size; "Open as JSON" shows everything.
const MAX_RENDERED_ROWS = 1000;

/** A table whose columns are whatever fields the rows have, since `.include()` changes them. */
export function ResultsGrid({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = useMemo(() => {
    const keys = new Set<string>();
    rows.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)));
    return [...keys];
  }, [rows]);

  const visibleRows = rows.slice(0, MAX_RENDERED_ROWS);

  return (
    <>
      <table className="grid">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column}>{formatCell(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > MAX_RENDERED_ROWS && (
        <p className="placeholder">
          Showing the first {MAX_RENDERED_ROWS} of {rows.length} rows. Use “Open as JSON” to see all
          of them.
        </p>
      )}
    </>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
