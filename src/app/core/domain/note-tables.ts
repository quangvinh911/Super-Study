import type { NoteNode } from '../models/notes.models';

export const MAX_NOTE_TABLE_CELLS = 5000;
export const MAX_NOTE_COLUMN_WIDTH = 10000;

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function noteCellAttrs(
  attrs: Readonly<Record<string, unknown>>,
): NonNullable<NoteNode['attrs']> {
  const colspan = attrs['colspan'] ?? 1;
  const rowspan = attrs['rowspan'] ?? 1;
  const colwidth = attrs['colwidth'];
  const align = attrs['align'];
  if (
    !integer(colspan, 1, MAX_NOTE_TABLE_CELLS) ||
    !integer(rowspan, 1, MAX_NOTE_TABLE_CELLS) ||
    (colwidth != null &&
      (!Array.isArray(colwidth) ||
        colwidth.length !== colspan ||
        !colwidth.every((width: unknown) => integer(width, 0, MAX_NOTE_COLUMN_WIDTH)))) ||
    (align != null && align !== 'left' && align !== 'center' && align !== 'right')
  )
    throw new Error('invalid_note');
  return {
    colspan,
    rowspan,
    ...(Array.isArray(colwidth) && colwidth.some((width) => width > 0) ? { colwidth } : {}),
    ...(align != null ? { align } : {}),
  };
}

export function noteTableColumnWidths(table: NoteNode): readonly number[] {
  const rows = table.content ?? [];
  // Record occupied positions, including those carried down by a merged cell.
  const grid: number[][] = rows.map(() => []);
  const widths: number[] = [];
  let columnCount = 0;
  for (const [rowIndex, row] of rows.entries()) {
    let column = 0;
    for (const cell of row.content ?? []) {
      while (grid[rowIndex][column] !== undefined) column++;
      const colspan = Number(cell.attrs?.['colspan'] ?? 1);
      const rowspan = Number(cell.attrs?.['rowspan'] ?? 1);
      const colwidth = cell.attrs?.['colwidth'];
      if (
        rowIndex + rowspan > rows.length ||
        (rowIndex > 0 && column + colspan > columnCount) ||
        (column + colspan) * rows.length > MAX_NOTE_TABLE_CELLS
      )
        throw new Error('invalid_note');
      for (let offset = 0; offset < colspan; offset++) {
        const width = Array.isArray(colwidth) ? Number(colwidth[offset]) : 0;
        if (!widths[column + offset]) widths[column + offset] = width;
        for (let covered = rowIndex; covered < rowIndex + rowspan; covered++) {
          if (grid[covered][column + offset] !== undefined) throw new Error('invalid_note');
          grid[covered][column + offset] = width;
        }
      }
      column += colspan;
    }
    if (rowIndex === 0) columnCount = grid[0].length;
    for (let index = 0; index < columnCount; index++) {
      if (grid[rowIndex][index] === undefined) throw new Error('invalid_note');
    }
  }
  if (!columnCount) throw new Error('invalid_note');
  return widths;
}
